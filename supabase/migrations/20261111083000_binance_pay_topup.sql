-- Binance Pay wallet top-up (2026-11-11)
-- Settings single-row + deposits with single-use txn id + atomic credit RPC.

CREATE TABLE IF NOT EXISTS public.binance_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  usdt_rate numeric(12,4) NOT NULL DEFAULT 90 CHECK (usdt_rate > 0),
  pay_id text NOT NULL DEFAULT '1183631033',
  min_inr numeric(10,2) NOT NULL DEFAULT 10 CHECK (min_inr >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.binance_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT ALL ON public.binance_settings TO service_role;
ALTER TABLE public.binance_settings ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies: browser reads config via the edge function (service role).

CREATE TABLE IF NOT EXISTS public.binance_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_inr numeric(14,2) NOT NULL CHECK (amount_inr > 0),
  expected_usdt numeric(14,4) NOT NULL CHECK (expected_usdt > 0),
  usdt_rate numeric(12,4) NOT NULL,
  binance_txn_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','verified','approved','credited','rejected')),
  matched_amount_usdt numeric(14,4),
  verify_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  credited boolean NOT NULL DEFAULT false,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS binance_deposits_txn_uniq ON public.binance_deposits (binance_txn_id);
CREATE INDEX IF NOT EXISTS idx_binance_deposits_user ON public.binance_deposits (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_binance_deposits_status ON public.binance_deposits (status);
GRANT SELECT ON public.binance_deposits TO authenticated;
GRANT ALL ON public.binance_deposits TO service_role;
ALTER TABLE public.binance_deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS binance_deposits_own_read ON public.binance_deposits;
CREATE POLICY binance_deposits_own_read ON public.binance_deposits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- No insert/update/delete for authenticated: all writes go through edge functions (service role).

-- One Binance transaction ID can credit only one wallet deposit, ever.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tx_binance_payment_ref
  ON public.transactions (payment_reference)
  WHERE payment_method = 'binance_pay' AND payment_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.credit_wallet_binance(p_deposit_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dep record;
  v_balance numeric;
  v_deposited numeric;
  v_new_balance numeric;
  v_credit_usd numeric;
  v_credit_inr numeric;
  v_tx_id uuid;
  v_lock_key bigint;
  v_rate numeric := 90;
BEGIN
  v_lock_key := abs(hashtextextended(p_deposit_id::text, 97));
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT * INTO v_dep FROM public.binance_deposits WHERE id = p_deposit_id FOR UPDATE;
  IF v_dep.id IS NULL THEN
    RAISE EXCEPTION 'Deposit not found: %', p_deposit_id;
  END IF;

  IF v_dep.credited THEN
    SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_dep.user_id;
    RETURN json_build_object('credited', false, 'duplicate', true, 'new_balance', COALESCE(v_balance,0));
  END IF;

  IF v_dep.status NOT IN ('verified','approved') THEN
    RETURN json_build_object('credited', false, 'reason', 'not_approved', 'status', v_dep.status);
  END IF;

  -- Wallet units are internal USD at the fixed platform rate (₹90 = 1.0000 unit),
  -- same as credit_wallet_oxapay. usdt_rate only sets the USDT quote, never the credit.
  v_credit_inr := ROUND(v_dep.amount_inr::numeric, 2);
  v_credit_usd := ROUND((v_credit_inr / v_rate)::numeric, 4);

  IF v_credit_inr <= 0 OR v_credit_usd <= 0 THEN
    RAISE EXCEPTION 'invalid credit amount';
  END IF;

  INSERT INTO public.wallets (user_id, balance, total_deposited, total_spent)
  VALUES (v_dep.user_id, 0, 0, 0) ON CONFLICT (user_id) DO NOTHING;

  SELECT balance, total_deposited INTO v_balance, v_deposited
  FROM public.wallets WHERE user_id = v_dep.user_id FOR UPDATE;

  v_new_balance := ROUND(COALESCE(v_balance,0) + v_credit_usd, 4);

  -- Transaction row FIRST: enforce_wallet_credit_trail requires it before balance increases.
  INSERT INTO public.transactions (
    user_id, type, amount, balance_after, status, payment_method, payment_reference, description
  ) VALUES (
    v_dep.user_id, 'deposit', v_credit_usd, v_new_balance, 'completed', 'binance_pay', v_dep.binance_txn_id,
    'Binance Pay deposit (Rs.' || v_credit_inr || ' / ' || v_dep.expected_usdt || ' USDT)'
  ) RETURNING id INTO v_tx_id;

  UPDATE public.wallets
     SET balance = v_new_balance,
         total_deposited = ROUND(COALESCE(v_deposited,0) + v_credit_usd, 4),
         updated_at = now()
   WHERE user_id = v_dep.user_id;

  UPDATE public.binance_deposits
     SET credited = true, status = 'credited', updated_at = now()
   WHERE id = p_deposit_id;

  RETURN json_build_object(
    'credited', true,
    'duplicate', false,
    'transaction_id', v_tx_id,
    'new_balance', v_new_balance,
    'credited_inr', v_credit_inr,
    'credited_usd', v_credit_usd
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_wallet_binance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_wallet_binance(uuid) TO service_role;

-- Allow Binance Pay deposits through the provenance guard (added after live test).

CREATE OR REPLACE FUNCTION public.enforce_deposit_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.type = 'deposit' AND NEW.status = 'completed' THEN
    IF NEW.payment_method IS NULL OR NEW.payment_method NOT IN (
      'zapupi', 'oxapay', 'manual_admin', 'razorpay', 'usdt_bep20', 'razorpay_manual', 'legacy_admin', 'binance_pay'
    ) THEN
      RAISE EXCEPTION 'Forbidden: deposit requires a known payment_method (got: %).', COALESCE(NEW.payment_method, 'NULL');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
