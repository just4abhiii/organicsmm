-- Lock down direct user inserts into transactions (Ahsan, 2026-11-11).
-- The old policy let any authenticated user insert ANY transaction row for
-- themselves — including fake completed deposits that would inflate admin
-- deposit totals and fake the user's own history. Real money movements are
-- created by server-side functions (service role bypasses RLS), and the only
-- client-side insert is the admin page (covered by the admin ALL policy).
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND type NOT IN ('deposit', 'refund', 'order_payment', 'order'));
