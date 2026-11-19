BEGIN;
ALTER TABLE public.organic_run_schedule ADD COLUMN IF NOT EXISTS provider_requested_quantity bigint,
 ADD COLUMN IF NOT EXISTS provider_public_start_count bigint,
 ADD COLUMN IF NOT EXISTS provider_public_start_observed_at timestamptz,
 ADD COLUMN IF NOT EXISTS provider_public_end_count bigint,
 ADD COLUMN IF NOT EXISTS provider_public_end_observed_at timestamptz,
 ADD COLUMN IF NOT EXISTS provider_history_order_id text;
CREATE OR REPLACE FUNCTION public.history_explicit_count(v jsonb) RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE s text;
BEGIN
 IF v IS NULL OR jsonb_typeof(v) NOT IN ('number','string') THEN RETURN NULL; END IF;
 s:=btrim(v #>> '{}'); IF s !~ '^[0-9]+$' THEN RETURN NULL; END IF;
 BEGIN RETURN s::bigint; EXCEPTION WHEN numeric_value_out_of_range THEN RETURN NULL; END;
END; $$;
CREATE OR REPLACE FUNCTION public.capture_provider_history() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p jsonb; s text; n bigint; fresh boolean;
BEGIN
 IF TG_OP='INSERT' THEN fresh:=NEW.provider_response IS NOT NULL;
 ELSE
  fresh:=NEW.provider_response IS DISTINCT FROM OLD.provider_response;
  IF NEW.provider_order_id IS DISTINCT FROM OLD.provider_order_id THEN
   NEW.provider_public_start_count:=NULL; NEW.provider_public_start_observed_at:=NULL;
   NEW.provider_public_end_count:=NULL; NEW.provider_public_end_observed_at:=NULL;
   IF NEW.provider_order_id IS NULL OR NEW.provider_history_order_id IS DISTINCT FROM NEW.provider_order_id::text THEN
    NEW.provider_requested_quantity:=NULL; NEW.provider_history_order_id:=NULL;
   END IF;
  END IF;
 END IF;
 IF NULLIF(btrim(NEW.provider_order_id::text),'') IS NULL OR NOT fresh THEN RETURN NEW; END IF;
 p:=NEW.provider_response;
 IF jsonb_typeof(p)<>'object' THEN RETURN NEW; END IF;
 IF jsonb_typeof(p->'last')='object' THEN p:=p->'last'; END IF;
 IF jsonb_typeof(p->'order')='object' THEN p:=p->'order'; END IF;
 IF p ? 'add' THEN RETURN NEW; END IF;
 n:=public.history_explicit_count(p->'start_count');
 IF NEW.provider_public_start_count IS NULL AND n IS NOT NULL THEN
  NEW.provider_public_start_count:=n; NEW.provider_public_start_observed_at:=statement_timestamp();
 END IF;
 s:=lower(btrim(coalesce(p->>'status',p->>'Status','')));
 IF s NOT IN ('completed','complete','done','partial','partially completed','cancelled','canceled','failed','error','refunded') THEN RETURN NEW; END IF;
 n:=coalesce(public.history_explicit_count(p->'end_count'),public.history_explicit_count(p->'current_count'));
 IF NEW.provider_public_end_count IS NULL AND n IS NOT NULL THEN
  NEW.provider_public_end_count:=n; NEW.provider_public_end_observed_at:=statement_timestamp();
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS capture_provider_history ON public.organic_run_schedule;
CREATE TRIGGER capture_provider_history BEFORE INSERT OR UPDATE ON public.organic_run_schedule FOR EACH ROW EXECUTE FUNCTION public.capture_provider_history();
COMMIT;
