# Bulk Import: Optional Deposit & Staff “Record Deposit” on Review

This document analyses what is needed so that:

1. **Bulk upload** can leave deposit empty or zero → no finance record is created at import.
2. **Staff review** can see “confirmed but awaiting deposit”, then use a **toggle / action** to open a dialog, enter the manual deposit payment, and have the record created.

It is deliberately thorough so we don’t agree to a design that causes issues later.

---

## 1. Current Behaviour (What Already Works)

### 1.1 Bulk import and deposit

- **Location:** `bulk_import_student_applications` (migrations `20251125_bulk_import_applications.sql` and `20260204_bulk_import_booking_source.sql`).
- **Logic:** Deposit is only created when **both**:
  - `deposit_amount` is not null **and**
  - `deposit_amount > 0`.
- So **leaving `deposit_amount` empty or setting it to 0 already results in:**
  - No row in `manual_payments` for deposit.
  - No update to `student_applications.deposit_payment_intent_id` (it stays null).

**Conclusion:** At the **database/import** level, “optional deposit” is already supported. No change is required to the bulk import function for “leave deposit empty = no record”.

### 1.2 Staff recording a deposit after import

- **ManualPaymentDialog** (`src/components/admin/ManualPaymentDialog.tsx`) already supports:
  - Payment type **Deposit** or **Instalment**.
  - Amount, payment method, date, notes (receipt optional).
- **useCreateManualPayment** (`src/hooks/useManualPayment.ts`) when `paymentType === 'deposit'` and `applicationId` is set:
  - Inserts into `manual_payments` (type `deposit`).
  - Sets `student_applications.deposit_payment_intent_id = 'manual-{payment_id}'`.
  - Updates Step 5 payload `deposit_paid: true`.
  - If application status is `awaiting_deposit`, updates status to `awaiting_signature`.

So the **flow “staff opens application → Record Manual Payment → choose Deposit → submit”** already creates the finance record and links it to the application. No new backend flow is required for “staff records deposit via dialog”.

### 1.3 Status “confirmed” vs “awaiting_deposit”

- Application status is set from the CSV during bulk import (e.g. `status` column).
- The system supports both:
  - `confirmed` with `deposit_payment_intent_id` null → “confirmed but no deposit recorded yet”.
  - `awaiting_deposit` → explicitly “waiting for deposit”.
- When staff records a deposit via `useCreateManualPayment`, only **awaiting_deposit** is auto-changed to **awaiting_signature**. If status is already **confirmed**, it is left as is (no automatic status change). So “confirmed but awaiting deposit” is a valid, supported state.

---

## 2. What We Need to Clarify or Add

### 2.1 CSV template and documentation

- **Current:** Applications CSV includes `deposit_amount` and `deposit_paid_date`. The template generator currently leaves them empty in the example row (`deposit_amount: "", deposit_paid_date: ""`).
- **Needed:**
  - **Document** clearly that:
    - Leaving `deposit_amount` blank or 0 means **no deposit payment is created** at import.
    - Staff can later record the deposit from the application (Record Manual Payment → Deposit).
  - Optionally add a short note in the Data Import UI for the “Applications” type: e.g. “Leave deposit amount blank to record deposit later from the application.”
- **Risk if omitted:** Users might assume deposit is required and fill it when they don’t have it, or the opposite—expect a record when they leave it blank and not see it until they understand the workflow.

### 2.2 Duplicate deposit prevention

- **Risk:** If the CSV has a deposit amount for some rows and staff later also uses “Record Manual Payment → Deposit” for the same application, we get two deposit records. `deposit_payment_intent_id` would point to the **latest** manual payment; reports that **sum** all deposit payments (e.g. Deposit vs Installment Breakdown) would count both and overstate deposit paid.
- **Recommendation:** Before creating a **deposit** manual payment, check that the application does not already have a deposit recorded:
  - Either `deposit_payment_intent_id IS NOT NULL`, or
  - Exists a row in `manual_payments` for this `application_id` with `payment_type = 'deposit'`.
- **Where to enforce:**
  - **Option A (recommended):** In `useCreateManualPayment` (or in an RPC it calls): when `paymentType === 'deposit'` and `applicationId` is set, run the check and either reject with a clear message (“This application already has a deposit recorded”) or surface a warning and require confirmation.
  - **Option B:** In the UI only (ManualPaymentDialog): before submit, fetch application and any existing deposit; disable “Deposit” or show a warning if one exists. Option B is friendlier but can be bypassed; Option A is safe even if other UIs are added later.
- **Conclusion:** We should add **server- or client-side duplicate-deposit check** and block (or warn and confirm) when recording a second deposit for the same application.

### 2.3 “Deposit paid” toggle vs single action

- **User ask:** “When staff goes to review application can toggle deposit paid enter the manual payment record with a dialog and then the record is created.”
- **Interpretation:** Staff should have a clear action that means “mark deposit as paid” and that leads into entering the payment (amount, date, method, etc.) in a dialog; on submit, the record is created. So we do **not** need a literal “toggle” that writes to the DB without amount/date (that would be incorrect for finance). We need:
  - A **trigger** (e.g. “Record deposit” or “Mark deposit paid”) that opens the existing **Manual Payment** dialog pre-set to **Deposit**.
  - User fills amount, date, method, notes and submits → `useCreateManualPayment` runs → record created and `deposit_payment_intent_id` set.
- **Conclusion:** Reuse **ManualPaymentDialog** with `paymentType="deposit"` (and optionally default open to Deposit when the application has no deposit). No second “toggle” that creates a record without going through the dialog.

### 2.4 Visibility of “no deposit recorded” during review

- **Current:** Application detail has “Record Manual Payment”; staff can open it and choose Deposit. There is no explicit “Deposit pending” or “No deposit recorded” badge on the card.
- **Needed:** So staff can see which bulk-imported applications still need a deposit:
  - On **Application Detail**: show a clear state when `deposit_payment_intent_id` is null (e.g. “Deposit not recorded” or “Awaiting deposit”) and a primary action **“Record deposit”** that opens ManualPaymentDialog with type Deposit.
  - Optionally on **Applications list**: a small indicator (e.g. icon or badge) for “no deposit” so staff can filter or prioritise.
- **Conclusion:** Add clear UI on at least the application detail page for “deposit not recorded” + “Record deposit” opening the dialog. List-level indicator is optional but useful.

### 2.5 ManualPaymentDialog deposit amount pre-fill

- **Current:** The dialog fetches “deposit amount” from `contract_payment_plans` with `.eq("id", app.selected_payment_plan_id)`. But `student_applications.selected_payment_plan_id` is a FK to **payment_plans**, not to `contract_payment_plans`. So the query is wrong (wrong table and wrong id); it likely returns null and the amount is not pre-filled.
- **Fix:** Fetch deposit from **payment_plans**: e.g. `payment_plans.deposit_amount` where `id = application.selected_payment_plan_id`. If that is null, optionally fall back to expected deposit from contract/studio_grade_prices (same logic as deposit_installment_breakdown) so bulk-imported applications with no selected_plan still get a sensible default.
- **Conclusion:** Fix the deposit-amount query in ManualPaymentDialog so staff see a pre-filled amount when recording a deposit (and so “Record deposit” flow is quick and consistent with expected deposit).

### 2.6 Bulk import status when deposit is left empty

- **Options:**
  - **A:** Use whatever status is in the CSV (e.g. `confirmed` or `awaiting_deposit`). No automatic change based on deposit.
  - **B:** If CSV has deposit empty/zero and status is `confirmed`, automatically set status to `awaiting_deposit` so the application clearly shows as “awaiting deposit” in filters and lists.
- **Recommendation:** **A**. Keep status exactly as in the CSV. Rationale: You may want “confirmed but awaiting deposit” as a display state for bulk imports; auto-changing to `awaiting_deposit` could conflict with that and with reporting. Recommend using status **`awaiting_deposit`** for rows with no deposit so they appear in the "Awaiting Deposit" stage; when staff record the deposit, the application moves to `awaiting_signature`. Using `confirmed` is also valid for a "confirmed but no deposit yet" display.

---

## 3. Edge Cases and Risks

| Scenario | Risk | Mitigation |
|----------|------|------------|
| CSV has deposit amount for some rows, blank for others | Only rows with amount get a record. Others show 0 in reports until staff records. | Document; optional list/detail indicator for “no deposit”. |
| Staff records deposit twice (e.g. forgot it was in CSV) | Double counting in reports. | Duplicate-deposit check (see 2.2). |
| Status = confirmed, no deposit; staff expects “awaiting deposit” label | Confusion. | Clear “Deposit not recorded” (or similar) on detail and optional list badge. |
| Bulk import with status = awaiting_deposit, deposit blank | Correct: no record; status shows awaiting deposit. After staff records deposit, useCreateManualPayment moves to awaiting_signature. | No change; document. |
| Contract has no payment_plan_id / selected_payment_plan_id | expected_deposit and dialog pre-fill may be 0 or null. | Deposit breakdown view already uses contract + studio_grade_prices fallback; dialog should use same fallback for pre-fill (see 2.5). |

---

## 4. Recommended Implementation Checklist (Done)

1. **Documentation**
   - [x] Data Import page for Applications: note added that leaving `deposit_amount` and `deposit_paid_date` blank (or 0) skips creating a deposit at import; staff can record it from the application (Record deposit).

2. **Duplicate deposit**
   - [x] In `useCreateManualPayment`: when `paymentType === 'deposit'` and `applicationId` is set, check `deposit_payment_intent_id` and existing `manual_payments` deposit; reject with clear error if already has deposit.
   - [x] In ManualPaymentDialog: fetch “has deposit”; show “(already recorded)” and helper text when deposit exists; when opening with deposit type and has deposit, switch to instalment.

3. **Application detail: “Record deposit” when no deposit**
   - [x] On Application Detail, when `deposit_payment_intent_id` is null: “Not recorded” badge + primary **“Record deposit”** button that opens ManualPaymentDialog with `paymentType="deposit"`.
   - [x] ManualPaymentDialog receives `paymentType` and syncs selected type when opened.

4. **ManualPaymentDialog deposit amount**
   - [x] Deposit amount: load from `payment_plans` where `id = application.selected_payment_plan_id`. Fallback: contract `deposit_override`, then `studio_grade_prices.deposit_amount_override` for contract’s academic year + application’s studio grade.

5. **Applications list**
   - [x] “No deposit” badge for applications with status confirmed or awaiting_deposit and no `deposit_payment_intent_id`. Button label “Record deposit” (primary) when no deposit, “Record Payment” (outline) when deposit exists. Dialog opened with deposit vs instalment based on whether application has deposit.

6. **No change**
   - Bulk import function: **no code change** for “leave deposit empty” (already correct).
   - Creating the manual payment and setting `deposit_payment_intent_id`: **no new backend**; use existing ManualPaymentDialog + useCreateManualPayment.

---

## 5. Summary

- **Bulk upload:** Leaving deposit empty or zero **already** creates no finance record; no change to the import function is required.
- **Staff flow:** “Toggle” = **“Record deposit”** action that opens the existing Manual Payment dialog pre-set to Deposit; user enters amount, date, method, notes → submit → record created. This flow already exists; we need clearer entry point and duplicate-deposit protection.
- **Confirmed but awaiting deposit:** Supported: status can be `confirmed` (or `awaiting_deposit`) with `deposit_payment_intent_id` null; we should surface “Deposit not recorded” and “Record deposit” on the application detail (and optionally on the list).
- **Critical additions:** (1) Duplicate-deposit check when recording a deposit. (2) Fix ManualPaymentDialog deposit-amount pre-fill. (3) Documentation and small UI improvements so the behaviour is clear and safe.

Implementing the checklist above will give you a robust “optional deposit on upload + record on review” workflow without introducing double counting or confusion.
