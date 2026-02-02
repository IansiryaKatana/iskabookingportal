# Booking Source + Bulk Import Fully-Paid Fix – Alignment

**Purpose:** Confirm scope and behaviour before implementation. Do not implement until you give the go-ahead.

---

## 1. Booking source – scope (as you requested)

- **Column:** `booking_source` on `student_applications`.
- **Allowed values (exactly 4):**
  - `rebooker`
  - `website`
  - `imported`
  - `partner_referral`
- **Default for existing rows:** `NULL` (no backfill). Reports will treat “rebooker” as `is_rebooking = true OR booking_source = 'rebooker'`.
- **Sync with `is_rebooking`:** When staff or bulk import set `booking_source = 'rebooker'`, set `is_rebooking = true`. When changed away from `'rebooker'`, set `is_rebooking = false`. `previous_application_id` can stay `NULL` until 25/26 is uploaded and linked.

---

## 2. Why some bulk-imported records show as “fully paid” (root cause)

**Finding:** In `get_payment_summary`:

1. **`total_due`** is set only when:
   - the contract has **`contract_payment_schedule`** rows, or  
   - the application has **`selected_payment_plan_id`** and the plan has installments (and “no schedule” branch runs).
2. If the contract has **no** `contract_payment_schedule` and the application has **no** `selected_payment_plan_id` (e.g. CSV has no `payment_plan_name` or it’s empty), **`v_total_due` is never set** and stays **0**.
3. Then `v_total_due_after_cashback = 0`, and the function returns **`payment_status = 'fully_paid'`** because of:  
   `WHEN v_total_due_after_cashback <= 0.01 THEN 'fully_paid'`.
4. **`total_paid`** in this function only counts **instalments** (Stripe + manual), not deposits. So bulk-imported rows (deposit-only manual payment) have `total_paid = 0`. So they show “fully paid” only because **`total_due` is wrongly 0**, not because they’ve paid everything.

**Conclusion:** Bulk-imported applications with no schedule and no payment plan end up with `total_due = 0` and are incorrectly marked fully paid.

**Fix (in `get_payment_summary`):** After the existing logic that sets `v_total_due`, add a fallback:

- If `v_total_due` is still NULL or ≤ 0 **and** `v_remaining_balance > 0`, set **`v_total_due := v_remaining_balance`**.

Then:

- `total_due` = contract total − deposit (what’s left to pay).
- `total_paid` = 0 (only deposit recorded; deposits not counted here).
- They will show as **unpaid** or **partially_paid**, not fully paid.

No change to bulk import itself for this fix; only to `get_payment_summary`.

---

## 3. Current bulk-import behaviour (unchanged by booking_source)

After bulk import, the following **will stay as they are**:

| Step | Current behaviour | After changes |
|------|-------------------|----------------|
| User/email lookup | Must exist in `auth.users` | Same |
| Contract by `contract_slug` | Required | Same |
| Studio by `studio_number` (optional) | Optional | Same |
| Payment plan by `payment_plan_name` (optional) | Optional; `selected_payment_plan_id` set or NULL | Same |
| Status | From CSV or default `confirmed` | Same |
| Application insert | Same columns as now **plus** `booking_source` (and when `booking_source = 'rebooker'`, `is_rebooking = true`) | Additive only |
| Steps 1–6 | Inserted as today | Same |
| Documents | From paths in CSV, approved | Same |
| Deposit | If `deposit_amount` (+ optional `deposit_paid_date`) in CSV → `manual_payments` row + `deposit_payment_intent_id = 'manual-' || id` | Same |
| Partner referral | If `referral_code` in CSV → `partner_referrals` row | Same |

So: **everything that currently happens after bulk import continues**, with the only additions being:

- Optional CSV column **`booking_source`** and DB column **`booking_source`** (and `is_rebooking` when `booking_source = 'rebooker'`).

---

## 4. What will be implemented (summary)

### A. Database

1. **Migration 1 – `booking_source`**
   - Add `student_applications.booking_source` (TEXT, nullable).
   - CHECK: `booking_source IS NULL OR booking_source IN ('rebooker','website','imported','partner_referral')`.
   - Optional index for reporting.

2. **Migration 2 – `get_payment_summary`**
   - Add fallback: if `(v_total_due IS NULL OR v_total_due <= 0) AND v_remaining_balance > 0` then `v_total_due := v_remaining_balance`.
   - Prevents “fully paid” when there is no schedule and no plan.

### B. Bulk import (DB)

- In `bulk_import_student_applications`:
  - Read optional `booking_source` from each row; validate against the 4 values; set `student_applications.booking_source`.
  - If `booking_source = 'rebooker'`, set `is_rebooking = true` on insert (and optionally `rebooking_reason` e.g. ‘Imported as rebooker’).
- **Existing columns/behaviour:** Unchanged (contract, studio, status, steps, documents, deposit, referral_code, etc.).

### C. Bulk import (UI / CSV)

- **CSV template (e.g. `csvTemplateGenerator`):** Add column **`booking_source`** (e.g. after `referral_code`). Example row: `rebooker` or `website` or empty.
- **Edge function / API** that calls `bulk_import_student_applications`: Pass through `booking_source` from CSV into the JSONB payload (if your current pipeline reads CSV → JSONB, add this field).

### D. Application detail (review)

- **ApplicationDetail.tsx:** Add editable **Booking source** dropdown (Rebooker, Website, Imported, Partner referral). Save to `student_applications.booking_source`. When user selects **Rebooker**, set `is_rebooking = true`; when they change away from Rebooker, set `is_rebooking = false`.
- Optional: short note when Rebooker is selected: “Previous year can be linked when 25/26 data is uploaded.”

### E. Reports / “rebooker” logic

- Where you currently use `is_rebooking` for “rebooker” (e.g. sales views, counts), use:  
  **`(is_rebooking = true OR booking_source = 'rebooker')`**  
  so staff-marked rebookers (no previous application yet) are included.

### F. Portal rebooking

- When a student creates a rebooking via the portal, set **`booking_source = 'rebooker'`** as well as `is_rebooking = true` and `previous_application_id` (when available). No change to `can_student_rebook` logic.

---

## 5. Confirmation checklist

- [ ] **Booking source list:** Rebooker, Website, Imported, Partner referral only (no OTA/Other for now).
- [ ] **Fully-paid fix:** Agree it’s due to `total_due = 0` when there’s no schedule and no plan; fix by setting `v_total_due := v_remaining_balance` in that case.
- [ ] **Bulk import:** All current behaviour (steps, documents, deposit, referral, status, etc.) stays; only add optional `booking_source` column and DB column + `is_rebooking` when `booking_source = 'rebooker'`.
- [ ] **No breaking changes:** New column nullable; existing CSVs without `booking_source` still work; portal and rest of app unchanged except where we add dropdown and reporting logic.

Once you confirm this alignment, implementation can start.
