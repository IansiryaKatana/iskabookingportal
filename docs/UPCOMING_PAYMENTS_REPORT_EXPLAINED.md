# Upcoming Payments Report – Why Nothing Shows

## 1. The report only shows installments that exist in `contract_payment_schedule`

The **Upcoming & Paid Installments** report is built from the table `contract_payment_schedule`: one row per installment (due date, amount, etc.) per contract.

- **Bulk-imported applications** create `student_applications` and link them to contracts and payment plans, but **do not** insert rows into `contract_payment_schedule`.
- So for those applications there are **no schedule rows** → the report has nothing to show for them.
- The student portal still works because it **generates** the schedule in memory from `payment_plan_installments` when no rows exist, but that is never saved to the database.

**Fix:** Run the backfill migration `20260222_backfill_contract_payment_schedule.sql`. It creates missing `contract_payment_schedule` rows for all confirmed (and awaiting_deposit/awaiting_signature) applications that have a contract and selected payment plan but no schedule yet. After that, the Upcoming report will include those applications.

---

## 2. “Due within: Next 7/14/30 days” only shows *future* due dates

The filter **“Due within: Next 7 days”** (or 14/30) means: *due date is between today and today + N days*. So:

- Installments whose **due date is in the past** (e.g. first installment you were supposed to pay last week) are **not** in that window.
- They are **overdue**, so they won’t appear when you choose “Next 7/14/30 days”.

**To see overdue installments (e.g. first installment that was due already):**

1. Set **Due within** to **“All dates”**.
2. Set **Status** to **“Overdue”**.

Then the report lists all installments that are past due, including the first installment for bulk-uploaded students.

---

## Summary

| What you want to see | What to select |
|----------------------|----------------|
| Installments due in the next 7/14/30 days | Due within: Next 7/14/30 days, Status: All or Upcoming |
| Installments that are already past due (e.g. first installment) | Due within: **All dates**, Status: **Overdue** |
| Only applications that have schedule rows | Run the backfill migration so bulk-imported applications get schedule rows |
