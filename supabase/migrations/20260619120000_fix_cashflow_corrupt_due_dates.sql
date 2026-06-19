-- Fix corrupt due dates that break the student payment cash flow monthly grid.
-- 1) Import contract with year 0001 BC dates (Grace Pardon-Gallagher)
-- 2) Payment plan typo 20225-08-16 (krutika Pandit 51-week plan)

UPDATE public.contracts
SET
  contract_start = '2025-09-18',
  updated_at = NOW()
WHERE id = '596cabb7-f8fe-405b-9217-e58ae17a19ca'
  AND contract_start < '2000-01-01';

UPDATE public.contract_payment_schedule
SET
  due_date = '2025-09-18',
  updated_at = NOW()
WHERE id = '4ab70efe-40f0-41a3-873e-ec14a615d473'
  AND due_date < '2000-01-01';

UPDATE public.payment_plan_installments
SET
  due_date = '2025-09-18',
  updated_at = NOW()
WHERE id = 'ff241c6d-f1f8-4030-b7c4-70dc6e76aa43'
  AND due_date < '2000-01-01';

UPDATE public.payment_plan_installments
SET
  due_date = '2026-01-01',
  updated_at = NOW()
WHERE due_date::text LIKE '20225-%';

UPDATE public.contract_payment_schedule
SET
  due_date = '2026-01-01',
  updated_at = NOW()
WHERE due_date::text LIKE '20225-%';
