# Deposit Separate from Contract Total – Change Recommendation

## Layout summary (at a glance)

| # | What | Where | One-line change |
|---|------|--------|-----------------|
| 1 | **get_payment_summary** | DB migration | Use contract total for installment base; stop using (contract − deposit). |
| 2 | **get_application_total_with_discount** | DB migration | Sum only installment rows; exclude deposit row from schedule sum. |
| 3 | **deposit_installment_breakdown** view | DB migration | expected_installments = total_due (remove − deposit_paid). |
| 4 | **contract_payment_schedule** (seed / bulk upload) | Seed script | Build installment amounts from full totalRent, not (totalRent − deposit). |
| 5 | **useStudentPayments.ts** | Frontend | Use totalContractValue (not totalContractValue − deposit) for installment amounts. |
| 6 | **UI wording** | ContractDetail, Payments, Wizard | Clarify: "Deposit separate; installments = full contract total." |

**No data migration needed:** You can delete all applications and bulk upload; schedules will be created with the new logic.

**Invoices, PDFs, AR/outstanding/sales reports:** No code change; they stay correct once (1)–(3) and schedule data are fixed.

---

## Will it break my system?

**Short answer:** No. You can delete all applications and bulk upload; no data migration is required.

| Risk | What could go wrong | How to avoid breakage |
|------|----------------------|------------------------|
| **Existing applications** | N/A – you will delete and bulk upload. | Ensure **seed script** (and any bulk-upload logic that builds schedules) uses full **totalRent** for installments, not (totalRent − deposit). |
| **Deploy order** | Frontend expects new totals but DB still returns old (or the opposite). | Deploy **DB migrations first** (function + views). Then deploy frontend and run seed/bulk upload so new schedules are built with the new logic. |
| **Reports / PDFs** | They read `get_payment_summary` and schedule. | No change needed; they will show correct numbers once the function is updated and schedules are created from seed/bulk upload. |
| **Discount / cashback** | Applied to "installment total." | No breaking change: they still apply to installment total; you just exclude deposit from `get_application_total_with_discount`. |

**Conclusion:** Implement the DB changes (function, views), frontend (useStudentPayments), and seed script. Then delete existing applications and bulk upload. All new data will use the correct "deposit separate" logic.

---

## Summary of the change

**Current behaviour (incorrect for your policy):**
- Contract total (rent) = e.g. £7,425  
- Deposit = e.g. £99  
- System treats: *remaining balance = £7,425 − £99 = £7,326*  
- Installments are calculated from **£7,326** (contract total minus deposit).

**Desired behaviour:**
- Contract total (rent) = £7,425  
- Deposit = £99 (**paid separately**, not part of rent)  
- Student pays: **£99 (deposit) + £7,425 (installments)**  
- Installments are calculated from the **full £7,425** (no deduction for deposit).

So: **deposit is separate from the contract amount**; it is not a “first payment” that reduces the rent balance.

---

## 1. Impact map – what needs to change

| Area | What it does today | Change required |
|------|--------------------|-----------------|
| **Database: `get_payment_summary`** | `v_remaining_balance := contract_total - deposit`; `total_due` and schedule sum use this. | Use **contract_total** (no minus deposit) for installment total. Deposit still not part of `total_due` / `total_paid`. |
| **Database: `contract_payment_schedule`** | When built (seed/bulk): deposit row + installments from `remaining = totalRent - deposit`. | Build installments from **full totalRent**; optional: keep deposit row for display only, or drop it from schedule. |
| **Database: `get_application_total_with_discount`** | Sums all `contract_payment_schedule.amount`. | Exclude deposit row when summing (label = 'Deposit' or sequence 1 + amount = deposit), so “contract” total = installments only. |
| **Database: `deposit_installment_breakdown` view** | `expected_installments = ps.total_due - deposit_paid`. | After fix, `total_due` is installment-only; set **expected_installments = ps.total_due** (no minus deposit_paid). |
| **Frontend: `useStudentPayments.ts`** | `remainingBalance = totalContractValue - depositAmount`; installments from that. | Use **totalContractValue** (no minus deposit) for generating installment amounts. |
| **Seed script: `scripts/seed-data.mjs`** | `remaining = totalRent - deposit`; installments from `remaining`. | Use **totalRent** (no minus deposit) for installment amounts. |
| **UI: ContractDetail, Payments, ApplicationWizard** | Show deposit and “remaining balance” / schedule. | Wording: make clear “Contract total” = rent; “Deposit” = separate; “Installments” = full contract total. No logic change if backend is fixed. |
| **Invoices / PDFs** | Use `get_payment_summary` and schedule. | No change once `get_payment_summary` and schedule are correct. |
| **Reports (AR, outstanding, sales, accounting)** | Use `get_payment_summary`, `total_contract_value`, views. | Verify: `total_due` = installment total only; deposit not subtracted from contract. |
| **Discount/cashback** | Applied to installment total. | Keep: discount/cashback apply to **installment total** (full contract), not to (contract − deposit). |

---

## 2. Database – detailed changes

### 2.1 `get_payment_summary` (single source of truth for “what is due”)

**File:** Implement in a new migration; current logic is in `supabase/migrations/20260210_discount_system.sql` (PART 6).

**Current logic:**
- `v_contract_total := weekly_price * weeks`
- `v_remaining_balance := GREATEST(v_contract_total - v_deposit_amount, 0)`  ← **remove minus deposit**
- When schedule exists: sum schedule excluding deposit row → `v_total_due`
- When no schedule: compute from `payment_plan_installments` using `v_remaining_balance` (percent/fixed)

**Required change:**
- Introduce a variable for “installment base” (amount installments must cover):
  - **New:** `v_installment_base := v_contract_total` (do **not** subtract deposit).
- Where you currently use `v_remaining_balance` for **installment** total and schedule sum:
  - Use **v_installment_base** instead (so installments are based on full contract total).
- Keep:
  - `total_due` = installment total only (no deposit).
  - `total_paid` = installment payments only (deposit still excluded).
  - `remaining_balance` = total_due (after cashback/discount) − total_paid.

So:
- Replace every use of “remaining balance” that is meant to be “what installments are calculated from” with **contract total**.
- Do not subtract deposit from contract total when computing installment amounts or schedule totals.

### 2.2 `contract_payment_schedule` (when it exists)

**Current:** Schedule is built (e.g. in seed) as:
- Row 1: Deposit, amount = deposit.
- Rows 2+ : Installments, amounts from `(totalRent - deposit)`.

**Required:**
- Installment rows (sequence ≥ 2, or all rows that are not “Deposit”) must sum to **totalRent**, not `totalRent - deposit`.
- You can either:
  - **Option A:** Keep a “Deposit” row in the table for display/audit only; when summing for `total_due` in `get_payment_summary` and elsewhere, **exclude** that row (already done by label/sequence checks).
  - **Option B:** Stop inserting a deposit row into `contract_payment_schedule`; schedule = installments only. Then all existing logic that excludes “Deposit” still works.

**No data migration:** You will delete all applications and bulk upload. New schedules (from seed or bulk upload) will be built with installments from full totalRent.

### 2.3 `get_application_total_with_discount`

**Current:** `SUM(amount)` over `contract_payment_schedule` for the application (no filter).

**Required:** Sum only amounts that are **installments** (e.g. exclude rows where `LOWER(COALESCE(label,'')) LIKE '%deposit%'` or same rules as in `get_payment_summary`). Then “application total with discount” = installment total − cashback − discount; deposit is not part of this sum.

### 2.4 View: `deposit_installment_breakdown`

**Current:** `expected_installments = COALESCE(ps.total_due, 0) - COALESCE(deposit_paid, 0)`.

**Required:** After the change, `ps.total_due` is already the installment total only. So set:
- `expected_installments = COALESCE(ps.total_due, 0)`  
and remove the “− deposit_paid” part (otherwise you double-subtract deposit).

### 2.5 Other views (accounts_receivable, outstanding_balances, sales)

They use `get_payment_summary` and/or `total_contract_value`. No view definition change needed **if**:
- `get_payment_summary.total_due` = installment total (full contract, no minus deposit), and
- `total_contract_value` remains rent only (unchanged).

Double-check:
- **accounts_receivable_report / outstanding_balances_report:** `total_due` and `remaining_balance` from `get_payment_summary` → correct once function is fixed.
- **sales_demographics_report:** Uses `total_contract_value` (rent) → correct.
- **adjusted_contract_value** in some views = `total_contract_value - cashback - discount` → still correct (rent minus reductions; deposit is separate).

---

## 3. Frontend – detailed changes

### 3.1 `src/hooks/useStudentPayments.ts`

**Current:**
- `remainingBalance = Math.max(totalContractValue - depositAmount, 0)`
- Installment amounts (percent/fixed) and last-instalment adjustment use `remainingBalance`.

**Required:**
- Use **totalContractValue** (no minus deposit) as the base for all installment calculations.
- So: e.g. `const installmentBase = totalContractValue;` and use `installmentBase` wherever you currently use `remainingBalance` for calculating installment amounts.
- Keep deposit **out** of the returned schedule (no deposit row in the generated list), or keep it as a separate line if you want “Deposit” and “Installments” both visible.

### 3.2 Seed script: `scripts/seed-data.mjs`

**Current:**
- `remaining = Math.max(totalRent - deposit, 0)`; installments from `remaining`.

**Required:**
- Installment amounts should be based on **totalRent** (e.g. `remaining = totalRent` for the purpose of splitting installments).
- Deposit row can stay as-is (sequence 1, label “Deposit”); only the **installment** rows’ amounts must sum to `totalRent`.

### 3.3 UI copy (ContractDetail, portal Payments, ApplicationWizard)

- **Contract total** = rent (e.g. £7,425).  
- **Deposit** = separate payment (e.g. £99); “Payable to secure this contract” / “Paid separately”.  
- **Installments** = “Payable over the term” / “Total instalments: £7,425” (full contract), so users see that deposit is not reducing the instalment total.

No backend logic change in UI; only clarity of labels and possibly one line like “Deposit is separate and is not deducted from your contract total.”

---

## 4. Invoices and PDFs

- **generate-student-invoice-pdf:** Uses `get_payment_summary` and payment/schedule data. Once `get_payment_summary` and schedule are correct, invoice totals and “amount due” will be correct.
- **generate-payment-history-pdf:** Same.
- **create-contract-pdf:** Uses `application.total_contract_value` (rent). No change.

---

## 5. Reports and accounting

- **AccountingReports (deposit vs installment):** Uses `deposit_installment_breakdown`. Fix the view as in 2.4; optionally add a column “Total student pays” = deposit + expected_installments if useful.
- **Outstanding balances / AR:** Rely on `get_payment_summary`; no view change needed once the function is fixed.
- **Sales / forecasts:** Use `total_contract_value` (rent); no change. If any report currently shows “contract − deposit” as “contract value”, switch to `total_contract_value` and add deposit as a separate line if needed.

---

## 6. Discount and cashback

- **apply_discount_to_application / get_application_total_with_discount:** Discount and cashback should apply to the **installment total** (full contract), not to (contract − deposit). With the changes above:
  - Installment total = contract total.
  - `get_application_total_with_discount` should sum only installment rows (see 2.3).
- No change to discount/cashback **logic**; only the base to which they apply becomes “full contract” instead of “contract − deposit”.

---

## 7. Suggested order of implementation

1. **Migration 1 – `get_payment_summary`**  
   - Use contract total (no minus deposit) for `v_total_due` / installment base.  
   - Keep counting only installment payments in `total_paid`.  
   - Test with one application: total_due = 7425, not 7326.

2. **Migration 2 – `get_application_total_with_discount`**  
   - Exclude deposit row from `SUM(amount)`.

3. **Migration 3 – `deposit_installment_breakdown`**  
   - `expected_installments = ps.total_due` (remove − deposit_paid).

4. **Frontend – `useStudentPayments.ts`**  
   - Base installment calculation on `totalContractValue` only.

5. **Seed script**  
   - Build installment amounts from `totalRent`, not `totalRent - deposit`.

6. **UI copy**  
   - Clarify that deposit is separate and not deducted from contract total.

7. **Delete applications and bulk upload**  
   - So all schedules are created with the new logic (no data migration).

8. **Regression tests**  
   - One application: contract 7425, deposit 99.  
   - Expect: total_due = 7425, installments sum = 7425, remaining_balance after paying 7425 = 0; deposit 99 paid separately and not reducing balance.  
   - Check invoice PDF, payment history PDF, and Deposit vs Installment report.

---

## 8. Risk and rollback

- **Risk:** Minimal. You will delete all applications and bulk upload, so no existing schedule data to migrate. Just ensure seed/bulk-upload logic builds schedules from full totalRent.

- **Rollback:** Keep a copy of the current `get_payment_summary` (and related function/view definitions); you can revert the migration and redeploy if needed.

---

## 9. Checklist before you decide

- [ ] Confirm with business: “Deposit is separate; student pays deposit + full contract in installments.”
- [ ] Confirm you will delete all applications and bulk upload (no data migration).
- [ ] Confirm whether `contract_payment_schedule` should still contain a “Deposit” row (display only) or only installments.
- [ ] Plan order: deploy DB migrations first, then frontend, then delete applications and bulk upload.
- [ ] Plan one end-to-end test: new booking with contract 7425 + deposit 99; pay deposit then installments; check invoice, reports, and “fully paid” status.

Once you confirm these, the implementation can follow the sections above step by step.
