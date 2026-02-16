# Contract installment dates & application review payment progress – assessment

## 1. Do contract installment date updates affect previously created applications?

### Short answer: **Yes**

Installment dates are stored at **contract** level, not per application. All applications that use that contract see the same schedule.

### How it works

- **Table:** `contract_payment_schedule`  
  - Key: `(contract_id, sequence)`  
  - Columns include: `due_date`, `amount`, `label`, etc.
- **Applications** only store:
  - `contract_id` → which contract (and thus which schedule) they use  
  - `selected_payment_plan_id` → which plan was chosen (used for backfill and display)
- **Payments** (Stripe and manual) reference installments via `instalment_id` → `contract_payment_schedule.id`.

So there is **no application-level copy** of installment dates. When you change the contract’s schedule, every application with that `contract_id` immediately uses the new dates and amounts.

### When do “custom contract” dates get updated?

1. **Contract create/update in admin (e.g. Contracts / Create contract)**  
   - `useAdminContracts`: on create/update it:
     - Deletes all `contract_payment_schedule` rows for that contract.
     - Calls `backfill_contract_payment_schedule_for_contract(contract_id, first_payment_plan_id)` to repopulate from the **first linked payment plan** (using `payment_plan_installments`: due_date / due_date_offset_days, amounts, etc.).
   - So: **all applications on that contract** see the new schedule as soon as the contract is saved.

2. **Editing only the payment plan (e.g. Payment Plans – instalment due dates)**  
   - That updates `payment_plan_installments` only.  
   - **Existing** `contract_payment_schedule` rows are **not** automatically updated.  
   - So: **existing applications keep seeing the old dates** until something regenerates the contract schedule (e.g. admin re-saves the contract, or you run a backfill that deletes and re-inserts).

3. **Direct edits to `contract_payment_schedule`**  
   - There is **no UI in the codebase** that updates `contract_payment_schedule` rows directly (only delete + backfill).  
   - If such an UI (or a migration/script) were added, any change would **immediately** affect all applications for that contract, since they all read from this table.

### Summary (Q1)

| Action | Effect on existing applications |
|--------|----------------------------------|
| Update contract (e.g. change linked plans, save) | Schedule is deleted and regenerated from first plan → **all applications on that contract get new installment dates**. |
| Edit payment plan installments only | No change to existing contract schedules → **applications keep old dates** until the contract is re-saved (or schedule is otherwise regenerated). |
| Direct update to `contract_payment_schedule` | **All applications for that contract** see the new dates (no per-application copy). |

So: **yes, contract installment date updates that actually change the contract’s schedule do update what all previously created applications “see”** – because they all share the same `contract_payment_schedule` by `contract_id`. The only caveat is when only the plan is edited and the contract schedule is never regenerated.

---

## 2. Payment progress overview on “review application”

### Goal

On the **review application** page (admin **Application Detail**), show an overview of what the student has paid vs what they were supposed to pay, e.g. a **progress bar** (and optionally amounts).

### Current state

- **Application Detail** (`src/pages/admin/ApplicationDetail.tsx`):
  - Does **not** call `get_payment_summary` or `usePaymentSummary`.
  - Has “Record Manual Payment” and cashback/discount/partner UI, but **no** “total due / total paid / remaining” summary or progress bar.
- **Existing backend:**
  - `get_payment_summary(p_application_id)` returns:  
    `total_due`, `total_paid`, `remaining_balance`, `payment_count`, `last_payment_date`, `payment_status`  
  - This is **installment-only** (excludes deposit): same logic as used in portal Payments and elsewhere.
- **Existing frontend hook:**
  - `usePaymentSummary(applicationId)` in `src/hooks/useUnifiedPayments.ts` already calls this RPC and is used in the portal and other admin pages.

### Can we do it?

**Yes.** We can add a small “Payment progress” (or “Installment progress”) block on Application Detail that:

- Uses **existing** `usePaymentSummary(applicationId)`.
- Shows:
  - A **progress bar**: e.g. `total_paid / total_due` (with `total_due > 0`), capped at 100%.
  - Text such as: “£X of £Y paid” and “Remaining: £Z”, and optionally `payment_status` (e.g. Fully paid / Partially paid / Unpaid).

No new API or DB changes are required; it’s read-only and uses current behaviour.

### Recommendations (no code changes yet)

1. **Where to show it**  
   - In the **Payment & finance** card (or a new “Payment progress” card) near “Record Manual Payment” on Application Detail, so staff see payment status at a glance.

2. **When to show it**  
   - Only when `usePaymentSummary` returns non-null and `total_due > 0` (e.g. confirmed applications with a schedule).  
   - For draft / no-schedule applications, `get_payment_summary` may return null or zeros; in that case either hide the block or show “No payment schedule” / “Payment summary not available”.

3. **What to show**  
   - **Progress bar:**  
     - Fill ratio: `Math.min(1, total_paid / total_due)` (guard against `total_due === 0`).  
     - Optional: colour by `payment_status` (e.g. green when fully paid, amber partially, grey unpaid).
   - **Text:**  
     - “£X of £Y paid” (installments only).  
     - “Remaining: £Z” (use `remaining_balance` from summary).  
   - Optionally: “Deposit is recorded separately” so it’s clear this is installment progress only.

4. **Consistency**  
   - Reuse the same currency formatting and status wording used elsewhere (e.g. portal Payments, ManualPaymentDialog).  
   - After “Record Manual Payment” or any action that invalidates payment summary, invalidate `["payment-summary", applicationId]` so the progress bar refetches (this is already done in ManualPaymentDialog and related flows).

5. **Risks**  
   - **Low:** Read-only; no new tables or RPCs.  
   - **Edge cases:**  
     - Draft / no schedule: handle null or zero `total_due` (hide or friendly message).  
     - Overpayments: progress bar can cap at 100%; `remaining_balance` from the RPC is already clamped (e.g. to 0 when fully paid).

6. **Optional later enhancement**  
   - If you want “deposit + installments” in one bar, you’d need to either extend the RPC (or a new one) to return deposit expected/deposit paid and total expected/total paid, or use something like `deposit_installment_breakdown` for that application and combine with payment history. For a first step, **installment-only progress** is consistent with `get_payment_summary` and keeps the change minimal and safe.

---

## Summary

| Topic | Conclusion |
|-------|------------|
| **Contract installment dates vs applications** | Updating a **contract’s** installment dates (via contract save/backfill or direct `contract_payment_schedule` update) **does** update what **all** previously created applications for that contract see; there is no per-application copy. Editing only the **payment plan** does not change existing contract schedules until the contract is re-saved (or schedule regenerated). |
| **Payment progress on review** | **Achievable** using existing `get_payment_summary` and `usePaymentSummary`. Add a small “Payment progress” (installment) block with progress bar and “£X of £Y paid / Remaining: £Z” on Application Detail; show only when summary is available and `total_due > 0`; no backend changes required and low risk if we handle null/zero and keep the bar read-only. |

No implementation was done; this document is assessment and recommendation only.
