# Payment summary & Record Manual Payment – verification after fix

This doc summarises what was checked after the **get_payment_summary** and **ManualPaymentDialog** fixes, and what was fixed or left as-is.

## 1. Consumers of `get_payment_summary` (RPC)

| Consumer | Location | Status |
|----------|----------|--------|
| **Application Detail** | `usePaymentSummary(applicationId)` → progress bar, total_due, remaining_balance, payment_count, payment_status | ✅ Correct. total_due now from plan when selected; progress matches schedule. |
| **Portal Payments** | `usePaymentSummary(application.id)` when confirmed | ✅ Same RPC; totals and remaining correct. |
| **Accounting reports** | DB views use `CROSS JOIN LATERAL get_payment_summary(sa.id) ps` | ✅ Backend only; gets corrected total_due/remaining. |
| **Invoice PDF** | `supabaseAdmin.rpc("get_payment_summary", …)` | ✅ Correct totals on generated invoice. |
| **Payment history PDF** | `supabaseAdmin.rpc("get_payment_summary", …)` | ✅ Correct summary in PDF. |
| **Fully Paid Students** | Data from report/query that uses get_payment_summary | ✅ Backend-driven; correct. |
| **Cashback / Discount / Custom contract** | Invalidate `payment-summary` after apply | ✅ Cache invalidation only; no logic change. |

No further code changes needed for these; they all use the updated function.

---

## 2. Record Manual Payment dialog

| Entry point | Passes `applicationId`? | Status |
|-------------|------------------------|--------|
| **Application Detail** | Yes (`applicationId`) | ✅ |
| **Applications list** | Yes (`selectedApplicationId`) | ✅ |
| **Student Detail** | Yes (`applicationId`) | ✅ |

Dialog behaviour after fix:

- When the application has **selected_payment_plan_id**: instalment list is built from the **plan** (same as page schedule). Unpaid = indices `>= payment_count` (e.g. 7–10 when 6 paid). Each option is mapped to a **contract_payment_schedule** id for recording.
- When there is **no** selected plan: list comes from **contract_payment_schedule**; unpaid filtered by paid IDs and paid sequences (unchanged).

---

## 3. Manual Payment Entry (link to application + instalment)

**Issue:** The “Link to application” → “Select instalment” dropdown was using **contract_payment_schedule** only, so it could show wrong amounts and too many options (same as the dialog before fix).

**Change:** The instalment list for the selected application now uses the **same plan-based logic** when that application has **selected_payment_plan_id**: build from plan, map to first N schedule rows, filter unpaid by **payment_count**. Otherwise it still uses contract schedule + paid sequences. So the dropdown matches Application Detail and the Record Manual Payment dialog (e.g. only 7–10 unpaid with correct £816 amounts).

---

## 4. Paid badges on Application Detail

Paid badges use `paymentSummary.payment_count`: first `payment_count` rows in the schedule table are “Paid”. The schedule table is from **useStudentPayments** (plan-based when plan exists). So the count aligns with the plan’s instalments and is correct.

---

## 5. Edge cases

- **Contract has fewer schedule rows than plan (e.g. 6 vs 10):**  
  Dialog and Manual Payment Entry only show instalments that have a **contract_payment_schedule** row (so up to 6). If 6 are paid, unpaid list can be empty even though the page shows 4 unpaid (7–10). Fix: run the **append** migration (`20260255_append_missing_contract_payment_schedule_rows.sql`) so the contract has enough rows for the plan.

- **Application has no selected_payment_plan_id:**  
  total_due comes from **contract_payment_schedule** (or fallback). Instalment lists in dialog and Manual Payment Entry use contract schedule + paid IDs/sequences. Behaviour unchanged from before.

---

## 6. Quick verification checklist

- [ ] Application Detail: Total Value, schedule table (10 × £816), and “£X of £Y paid” / Remaining all match.
- [ ] Application Detail: Open Record Manual Payment → only unpaid instalments (e.g. 7–10) at £816.
- [ ] Applications list: Record Payment for an application → same dropdown behaviour as above.
- [ ] Student Detail: Record Manual Payment → same as above.
- [ ] Manual Payment Entry: Link to application → Select instalment shows only unpaid (e.g. 7–10) at correct amounts.
- [ ] Portal Payments: Confirmed application shows correct total due and remaining.
- [ ] After recording a manual instalment: payment summary and unpaid lists refresh (cache invalidation).

---

## 7. Files touched in this round

- `supabase/migrations/20260256_get_payment_summary_cap_total_due_by_plan.sql` – total_due from plan when selected.
- `src/components/admin/ManualPaymentDialog.tsx` – plan-based instalment list and unpaid by payment_count.
- `src/pages/admin/ManualPaymentEntry.tsx` – same plan-based instalment list for “Link to application” dropdown.

No changes to: useStudentPayments, useUnifiedPayments, usePaymentSummary, useManualPayment, PDFs, or accounting report views (they consume the updated RPC only).
