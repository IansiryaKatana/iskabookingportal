-- Fix: Student portal can send instalment_id from payment_plan_installments (when there is no
-- contract_payment_schedule). Drop FK so we accept any UUID; on approve we only set
-- manual_payments.instalment_id when it exists in contract_payment_schedule.

ALTER TABLE public.manual_payment_requests
  DROP CONSTRAINT IF EXISTS manual_payment_requests_instalment_id_fkey;

COMMENT ON COLUMN public.manual_payment_requests.instalment_id IS
  'UUID identifying the instalment: contract_payment_schedule.id or payment_plan_installments.id. No FK so both sources work.';
