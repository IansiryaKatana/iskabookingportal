# Will the Student Manual Payment Implementation Break Anything? – Analysis

**Scope:** Option A (new `manual_payment_requests` table + student submit → admin approve → create `manual_payment`) plus the quick fix (include `manual_payments` in `check-payment-status`).

---

## Summary: **No breaking changes** if implemented as below

- **Quick fix (check-payment-status):** Additive only; no existing behaviour removed.
- **Option A (manual_payment_requests):** New table and new UI only; existing `manual_payments` schema, RLS, and flows are unchanged. One place that must be extended: application delete (see §4).

---

## 1. Quick fix: Include manual_payments in check-payment-status

**Change:** Edge Function returns instalment IDs that have a row in `manual_payments` (payment_type = `'instalment'`, same application_id) in addition to Stripe + `stripe_payments`.

| Area | Risk | Verdict |
|------|------|--------|
| **Student portal** | Frontend only uses `data.paidInstalments[].instalmentId` to build a Set and show "Paid". It does not require `paymentIntentId` or any other field. Adding more IDs only adds more "Paid" badges. | **Safe** |
| **Duplicate instalment** | Same instalment could have both Stripe and manual payment. We merge into a set; the UI shows "Paid" once. No double-count. | **Safe** |
| **Response shape** | We can return `{ instalmentId, paymentIntentId: null, amount, paidAt }` for manual rows. Frontend only reads `instalmentId`. | **Safe** |

**Conclusion:** No break. Only effect is staff-recorded manual instalments start showing as "Paid" on the student portal.

---

## 2. Option A: New table manual_payment_requests

**Change:** New table; students INSERT requests; staff approve → INSERT into `manual_payments` (existing table, existing shape).

### 2.1 manual_payments table – **unchanged**

- No new columns, no new constraints, no RLS change.
- New rows are created only on approval, with the same columns as today (application_id, instalment_id, amount, payment_method, receipt_number, payment_date, recorded_by, notes, etc.).
- **receipt_number:** Must be unique. On approve, generate a value (e.g. `REQ-{request_id}` or your sequential format) so we never conflict with existing receipts. No change to existing manual payment recording.

**Conclusion:** Existing `manual_payments` behaviour and all code that reads it remain valid.

### 2.2 unified_payment_history view – **unchanged**

- View selects from `manual_payments` with no status filter (table has no status column).
- Approved requests become normal `manual_payments` rows and appear in the view like staff-created ones.
- No view change required.

**Conclusion:** No break.

### 2.3 get_payment_summary and payment_status – **unchanged**

- Uses `unified_payment_history` and filters by `payment_status = 'completed'`.
- Manual rows in the view are already `payment_status = 'completed'`.
- New approved rows are identical in shape and status.

**Conclusion:** Totals and "fully_paid" / "partially_paid" stay correct; no break.

### 2.4 Refunds, deposit_payment_intent_id, link_payment_to_application – **unchanged**

- Refunds resolve `manual-{id}` from `manual_payments` by id. New rows have normal ids.
- Deposit flow (Step 5 receipt link) and `link_payment_to_application` only deal with `manual_payments`; they do not reference the new requests table.
- Orphaned payment flow (Manual Payment Entry page) still creates `manual_payments` with application_id null; no interaction with requests.

**Conclusion:** No break.

### 2.5 Staff flows – **unchanged**

- **ManualPaymentDialog** (Application Detail / Applications): still INSERTs into `manual_payments` only; no use of requests.
- **Manual Payment Entry (orphaned):** still INSERTs into `manual_payments` only.
- **useCreateManualPayment:** unchanged; still used by staff only.

**Conclusion:** No break.

### 2.6 RLS on manual_payments – **unchanged**

- Students: SELECT only (own application). They will see new rows after approval like today.
- Staff: full access. Approval runs as staff and INSERTs into `manual_payments` as today.

**Conclusion:** No break.

### 2.7 Reports, invoices, accounting – **unchanged**

- Code that aggregates `manual_payments` or reads `unified_payment_history` (e.g. useReports, invoice PDF, get_payment_summary, accounting reports) will simply see one more row per approved request.
- No filters or logic assume "only staff-created" manual payments.

**Conclusion:** No break.

### 2.8 Triggers on manual_payments – **unchanged**

- Only trigger: `set_timestamp_manual_payments` (updated_at). Fires on INSERT/UPDATE as today.
- No business logic that could behave differently for "approved from request" vs "staff-created".

**Conclusion:** No break.

---

## 3. What we add (no impact on existing behaviour)

| Addition | Impact on existing |
|----------|--------------------|
| New table `manual_payment_requests` | None; no existing code references it until we add new UI. |
| New RLS on `manual_payment_requests` (students INSERT/SELECT own; staff SELECT/UPDATE) | None; isolates new data. |
| Student portal: "I paid by bank transfer" + form | Additive UI; existing "Pay" (Stripe) and Payment History unchanged. |
| Admin: "Pending student requests" list + Approve/Reject | Additive UI; existing Manual Payment Entry and ManualPaymentDialog unchanged. |
| On Approve: INSERT into `manual_payments` | Same as staff recording a payment; all downstream behaviour already supports that. |

---

## 4. One required extension (not a break, just completeness)

**Application delete (data management):**  
Today the delete function explicitly deletes `manual_payments` for the application. When we add `manual_payment_requests`:

- **Option 1 (recommended):** Define `manual_payment_requests.application_id` with `ON DELETE CASCADE`. Then deleting an application automatically deletes its pending requests; no change to the delete function.
- **Option 2:** Add one line to the delete function: `DELETE FROM manual_payment_requests WHERE application_id = p_application_id;` (and include it in the returned counts if desired).

Without one of these, pending requests would remain for a deleted application (orphaned rows). That’s a data hygiene gap, not a "break" of existing behaviour, but it should be handled.

---

## 5. Edge cases (handled by design)

| Scenario | Handling |
|----------|----------|
| Student submits two requests for same instalment | Allow both; show both "Pending". Accountant approves one and rejects the other. Optional: prevent a second pending request per instalment in UI or DB. |
| Approve then student deletes application | Application delete removes requests (CASCADE or explicit delete). Already-deleted application_id would prevent orphaned manual_payments if delete runs after approve (normal flow). |
| receipt_number uniqueness | On approval, generate a unique receipt number (e.g. REQ-{id}) so we never conflict with existing manual_payments or Step 5 receipt linking. |

---

## 6. Conclusion

- **Quick fix (check-payment-status):** Safe; additive only; no breaking change.
- **Option A (manual_payment_requests + approval → manual_payments):** Does not change any existing table, view, RLS, or flow. Only adds a new table, new UI, and one INSERT path into `manual_payments` that looks exactly like current staff-created rows. The only required follow-up is to tie application delete to requests (CASCADE or one extra delete line).

**Nothing in the current system is broken by this implementation** if you keep `manual_payments` unchanged and treat approved requests as "staff-created" rows from the DB’s perspective.
