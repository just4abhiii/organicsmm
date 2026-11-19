-- Binance Pay: one real Binance payment can only credit once (Ahsan, 2026-11-11).
-- A Binance payment carries several identifiers (orderId, transactionId,
-- merchantTradeNo). A user could submit different IDs of the SAME payment and
-- get credited multiple times. Store the matched payment's identifiers on the
-- deposit row and enforce uniqueness among credited deposits.

ALTER TABLE public.binance_deposits ADD COLUMN IF NOT EXISTS matched_transaction_id text;
ALTER TABLE public.binance_deposits ADD COLUMN IF NOT EXISTS matched_order_id text;

CREATE UNIQUE INDEX IF NOT EXISTS binance_deposits_credited_txnid_uniq
  ON public.binance_deposits (matched_transaction_id)
  WHERE credited AND matched_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS binance_deposits_credited_orderid_uniq
  ON public.binance_deposits (matched_order_id)
  WHERE credited AND matched_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.credit_wallet_binance(p_deposit_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- One real Binance payment can only credit once, no matter which of its IDs
  -- (orderId / transactionId) was submitted on any request.
  IF (v_dep.matched_transaction_id IS NOT NULL OR v_dep.matched_order_id IS NOT NULL) AND EXISTS (
    SELECT 1 FROM public.binance_deposits d2
    WHERE d2.id <> v_dep.id
      AND d2.credited = true
      AND (
        (v_dep.matched_transaction_id IS NOT NULL AND d2.matched_transaction_id = v_dep.matched_transaction_id)
        OR (v_dep.matched_order_id IS NOT NULL AND d2.matched_order_id = v_dep.matched_order_id)
      )
  ) THEN
    SELECT balance INTO v_balance FROM public.wallets WHERE user_id = v_dep.user_id;
    RETURN json_build_object(
      'credited', false, 'duplicate', true,
      'reason', 'binance_payment_already_credited',
      'new_balance', COALESCE(v_balance, 0)
    );
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
$function$;
