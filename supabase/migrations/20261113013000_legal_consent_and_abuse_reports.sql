-- Legal consent evidence (signup / order / api) and abuse reports
CREATE TABLE IF NOT EXISTS public.legal_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  event_type text NOT NULL CHECK (event_type IN ('signup','order','api_key')),
  reference text,
  ip_address text,
  user_agent text,
  consent_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legal_consents_user_idx ON public.legal_consents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS legal_consents_email_idx ON public.legal_consents(lower(email));
GRANT SELECT ON public.legal_consents TO authenticated;
GRANT ALL ON public.legal_consents TO service_role;
ALTER TABLE public.legal_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read consents" ON public.legal_consents;
CREATE POLICY "admins read consents" ON public.legal_consents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.abuse_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_name text NOT NULL,
  organization text,
  reporter_email text NOT NULL,
  affected_url text NOT NULL,
  details text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','resolved','rejected')),
  url_blacklisted boolean NOT NULL DEFAULT false,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.abuse_reports TO authenticated;
GRANT ALL ON public.abuse_reports TO service_role;
ALTER TABLE public.abuse_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read reports" ON public.abuse_reports;
CREATE POLICY "admins read reports" ON public.abuse_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins update reports" ON public.abuse_reports;
CREATE POLICY "admins update reports" ON public.abuse_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public._request_ip() RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE h json;
BEGIN
  BEGIN h := current_setting('request.headers', true)::json; EXCEPTION WHEN others THEN RETURN NULL; END;
  IF h IS NULL THEN RETURN NULL; END IF;
  RETURN left(coalesce(nullif(trim(split_part(h->>'x-forwarded-for', ',', 1)), ''), h->>'x-real-ip', h->>'cf-connecting-ip'), 100);
END $$;

CREATE OR REPLACE FUNCTION public.record_legal_consent(
  _event_type text, _consent_text text, _email text DEFAULT NULL, _reference text DEFAULT NULL, _user_agent text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); em text;
BEGIN
  IF _event_type NOT IN ('signup','order','api_key') THEN RAISE EXCEPTION 'invalid event'; END IF;
  IF uid IS NULL AND _event_type <> 'signup' THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF uid IS NOT NULL THEN SELECT email INTO em FROM auth.users WHERE id = uid; END IF;
  INSERT INTO public.legal_consents(user_id, email, event_type, reference, ip_address, user_agent, consent_text)
  VALUES (uid, left(coalesce(em, _email), 255), _event_type, left(_reference, 200), public._request_ip(),
          left(coalesce(_user_agent, current_setting('request.headers', true)::json->>'user-agent'), 500), left(_consent_text, 2000));
END $$;
REVOKE ALL ON FUNCTION public.record_legal_consent(text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_legal_consent(text,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_abuse_report(
  _name text, _organization text, _email text, _url text, _details text, _user_agent text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ip text := public._request_ip();
BEGIN
  IF length(trim(coalesce(_name,''))) < 2 OR length(_name) > 100 THEN RAISE EXCEPTION 'Invalid name'; END IF;
  IF coalesce(_email,'') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(_email) > 255 THEN RAISE EXCEPTION 'Invalid email'; END IF;
  IF length(trim(coalesce(_url,''))) < 5 OR length(_url) > 1000 THEN RAISE EXCEPTION 'Invalid URL'; END IF;
  IF length(trim(coalesce(_details,''))) < 10 OR length(_details) > 5000 THEN RAISE EXCEPTION 'Please add more details'; END IF;
  IF ip IS NOT NULL AND (SELECT count(*) FROM public.abuse_reports WHERE ip_address = ip AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many reports. Please try again later.';
  END IF;
  INSERT INTO public.abuse_reports(reporter_name, organization, reporter_email, affected_url, details, ip_address, user_agent)
  VALUES (trim(_name), left(nullif(trim(_organization),''),200), trim(_email), trim(_url), trim(_details), ip, left(_user_agent,500));
END $$;
REVOKE ALL ON FUNCTION public.submit_abuse_report(text,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_abuse_report(text,text,text,text,text,text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
