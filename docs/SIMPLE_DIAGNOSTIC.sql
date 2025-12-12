-- SIMPLE DIAGNOSTIC: Run this ONE query with your application ID
-- Replace 'f135ff15-b4c1-4ad8-b3bd-0301ab9e2840' with your actual application ID

WITH app_data AS (
  SELECT 
    sa.id AS application_id,
    sa.selected_payment_plan_id,
    sa.contract_id,
    c.weekly_price_override * c.weeks AS contract_total,
    COALESCE(c.deposit_override, pp.deposit_amount, 0) AS deposit_amount,
    (c.weekly_price_override * c.weeks) - COALESCE(c.deposit_override, pp.deposit_amount, 0) AS remaining_balance
  FROM student_applications sa
  INNER JOIN contracts c ON c.id = sa.contract_id
  LEFT JOIN payment_plans pp ON pp.id = sa.selected_payment_plan_id
  WHERE sa.id = 'f135ff15-b4c1-4ad8-b3bd-0301ab9e2840'::UUID  -- REPLACE THIS
),
installment_data AS (
  SELECT 
    ppi.sequence,
    ppi.label,
    ppi.amount_type,
    ppi.amount_value,
    CASE 
      WHEN LOWER(COALESCE(ppi.label, '')) LIKE '%deposit%' THEN '❌ DEPOSIT (excluded)'
      ELSE '✅ INSTALLMENT (included)'
    END AS filter_status,
    CASE 
      WHEN ppi.amount_type = 'percentage' THEN (ad.remaining_balance * ppi.amount_value / 100)
      WHEN ppi.amount_type = 'fixed' THEN ppi.amount_value
      ELSE 0
    END AS calculated_amount
  FROM app_data ad
  LEFT JOIN payment_plan_installments ppi ON ppi.payment_plan_id = ad.selected_payment_plan_id
  WHERE LOWER(COALESCE(ppi.label, '')) NOT LIKE '%deposit%'  -- Exclude deposit
)
SELECT 
  'Contract Details' AS section,
  ad.contract_total::text AS value1,
  ad.deposit_amount::text AS value2,
  ad.remaining_balance::text AS value3,
  NULL::text AS value4
FROM app_data ad

UNION ALL

SELECT 
  'Installment Breakdown' AS section,
  id.sequence::text,
  id.label,
  id.amount_type || ' (' || id.amount_value::text || ')' AS value3,
  '£' || id.calculated_amount::text AS value4
FROM installment_data id
ORDER BY 
  CASE WHEN section = 'Contract Details' THEN 1 ELSE 2 END,
  id.sequence;

-- Also show the function result
SELECT 
  'Function Result' AS section,
  total_due::text AS value1,
  total_paid::text AS value2,
  remaining_balance::text AS value3,
  payment_status AS value4
FROM public.get_payment_summary('f135ff15-b4c1-4ad8-b3bd-0301ab9e2840'::UUID);  -- REPLACE THIS

