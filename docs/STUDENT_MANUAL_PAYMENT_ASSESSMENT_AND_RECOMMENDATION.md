# Student Portal Manual Payment – Assessment & Recommendation

**Date:** 2026-01-29  
**Goal:** Allow students who pay outside the system (e.g. bank transfer) to add a manual payment entry against their instalment, have it appear in admin for accountant approval, and then show as paid in the student portal **without breaking existing behaviour**.

---

## 1. Current State Summary

### 1.1 Who can record manual payments today

| Actor | Where | What |
|-------|--------|------|
| **Staff** | Application Detail / Applications list → “Record Manual Payment” (ManualPaymentDialog) | Deposit or instalment; linked to application + optional instalment_id. **Immediately “completed”** – no approval. |
| **Staff** | Admin → Manual Payment Entry (`/admin/manual-payment-entry`) | **Orphaned** payments (no application) – e.g. pre-application; student later links via receipt number in Application Wizard Step 5. |

**Students cannot create manual payment entries today.** They can only:
- Pay via Stripe (card) on the Payments page.
- In Step 5 (Application Wizard), **link** an existing orphaned payment to their application using a receipt number (staff had already entered it).

### 1.2 How “paid” status is shown in the student portal

- **Instalment cards (Pay / Paid badge):**  
  `paidInstalmentIds` is filled by the **check-payment-status** Edge Function.  
  That function returns:
  - Stripe payment intents (succeeded, type instalment), and  
  - Rows from **stripe_payments** (succeeded/completed, instalment).  
  It does **not** include **manual_payments**.

- **Payment History list (below the cards):**  
  Uses **unified_payment_history**, which **does** include `manual_payments` (with `payment_source = 'manual'`).

So today:
- Staff-recorded **manual** instalment payments **do appear** in the student’s Payment History.
- The same instalment **does not** get the “Paid” badge on the card, because `check-payment-status` ignores `manual_payments`.

### 1.3 Database

- **manual_payments:**  
  `application_id`, `payment_type` (deposit | instalment), `instalment_id`, `amount`, `payment_method`, `receipt_number`, `payment_date`, `recorded_by`, `notes`.  
  No `status` or approval field – every row is treated as completed.

- **RLS:**  
  Staff: full access. Students: **SELECT only** (own application’s payments). Students **cannot INSERT** into `manual_payments`.

---

## 2. Gaps Identified

| # | Gap | Impact |
|---|-----|--------|
| 1 | **check-payment-status ignores manual_payments** | Staff-recorded manual instalment payments do not make the instalment show as “Paid” on the student portal card (only in Payment History). |
| 2 | **Students cannot submit a manual payment “request”** | No way for a student to say “I paid this instalment by bank transfer” and have it go to admin for approval. |
| 3 | **No approval workflow** | All staff-recorded manual payments are final; there is no “pending” queue for accountant to approve. |

---

## 3. Recommendations (safe, non-breaking)

### 3.1 Fix existing behaviour (recommended first)

**Update `check-payment-status`** so it also returns instalment IDs that have a **manual_payment** (payment_type = `'instalment'`, application_id = request’s application).

- **Change:** In `supabase/functions/check-payment-status/index.ts`, after building `paidInstalments` from Stripe + `stripe_payments`, query `manual_payments` for that `applicationId` and `payment_type = 'instalment'`, and add each `instalment_id` to the response (avoid duplicates).
- **Effect:** Staff-recorded manual instalment payments will correctly show as “Paid” on the student portal without any UI or schema change.
- **Risk:** Low; additive only.

### 3.2 New feature: student-submitted manual payment + accountant approval

Two implementation options.

---

#### Option A: New table `manual_payment_requests` (recommended)

**Idea:** Students create a **request**; admin approves or rejects; approval creates a real **manual_payment** and the instalment then counts as paid (once 3.1 is in place).

**Schema (conceptual):**

- `manual_payment_requests`
  - `id`, `application_id`, `instalment_id`, `amount`, `payment_method`, `reference` (e.g. bank ref / receipt), `notes`
  - `status`: `'pending' | 'approved' | 'rejected'`
  - `submitted_by` (student user id), `submitted_at`
  - `reviewed_by`, `reviewed_at`, `rejection_reason` (optional)

**Flow:**
1. Student portal (Payments page): per unpaid instalment, show e.g. “Paid by bank transfer?” → form (amount, method, reference, notes) → INSERT into `manual_payment_requests` with `status = 'pending'`.
2. Admin: new view or section “Manual payment requests” (or under existing Manual Payment Entry): list pending requests; actions Approve / Reject.
3. On **Approve:** INSERT into `manual_payments` (same application_id, instalment_id, amount, etc.; `recorded_by` = reviewing staff), then UPDATE request `status = 'approved'`, set `reviewed_by`, `reviewed_at`.
4. On **Reject:** UPDATE request `status = 'rejected'`, optional `rejection_reason`.
5. Student portal: instalment shows “Paid” after approval (because of 3.1 + new `manual_payments` row). Request can be shown as “Pending” / “Approved” / “Rejected” in history or a small status line.

**Pros:** Clear separation between “request” and “payment”; full audit trail; no change to existing `manual_payments` semantics.  
**Cons:** One extra table and a bit more UI (admin list + approve/reject).

---

#### Option B: Add `status` (and optionally `submitted_by`) to `manual_payments`

**Idea:** One table; students insert rows with `status = 'pending'`; staff approve by setting `status = 'approved'` (or treat NULL as approved for backward compatibility).

**Schema:**
- Add to `manual_payments`: `status` (e.g. `'pending' | 'approved'`), default `'approved'` for existing and staff-created rows; optionally `submitted_by` (user id).

**Flow:**
1. Student: INSERT `manual_payments` with `status = 'pending'`, `submitted_by = auth.uid()`, application_id, instalment_id, amount, etc. (RLS policy: allow INSERT for own application when status = 'pending').
2. Admin: list rows where `status = 'pending'`; Approve → UPDATE `status = 'approved'`; Reject → DELETE or UPDATE to `'rejected'` (if you add that enum).
3. **unified_payment_history** and **check-payment-status** include only rows where `status = 'approved'` (or `status IS NULL` for backward compatibility).

**Pros:** No new table; simpler schema.  
**Cons:** Mixes “request” and “payment”; existing views and RLS must be updated carefully; need to handle NULL vs `'approved'` everywhere.

---

### 3.3 Recommendation summary

| Step | Action | Breaks anything? |
|------|--------|-------------------|
| 1 | Implement **3.1**: include manual_payments in `check-payment-status` | No |
| 2 | Implement **Option A** (manual_payment_requests + admin approval + create manual_payment on approve) | No, if only new table and new UI are added; existing manual_payments and staff flows unchanged |
| 3 | Student portal: add “Record bank transfer” (or similar) per instalment → create pending request; show “Pending approval” on that instalment until approved | No |

Optional: On the admin Manual Payment Entry page, add a tab or section “Pending student requests” that lists `manual_payment_requests` with status = pending and Approve/Reject actions, so accountants have one place to approve.

---

## 4. What to avoid (so nothing breaks)

- **Do not** change existing RLS on `manual_payments` in a way that blocks staff from inserting/updating as they do today.
- **Do not** change `unified_payment_history` to exclude current manual_payments (only add filters for a new `status` if you choose Option B).
- **Do not** remove or repurpose the existing “Record Manual Payment” (ManualPaymentDialog) or “Manual Payment Entry” orphaned flow; add the new “student request + approval” flow **alongside** them.
- If you add a `status` column to `manual_payments` (Option B), keep default or backward compatibility so existing rows and all current staff-created rows still count as paid everywhere.

---

## 5. Summary

- **Current:** Students cannot add manual payment entries. Staff-recorded manual instalment payments appear in Payment History but **not** as “Paid” on the instalment card, because `check-payment-status` does not include them.
- **Quick fix (3.1):** Extend `check-payment-status` to include instalment IDs from `manual_payments`. Then existing staff-recorded manual instalments show as “Paid” in the student portal.
- **New feature:** Introduce student-submitted “manual payment request” with accountant approval; **Option A** (new `manual_payment_requests` table and create `manual_payments` on approve) is the safest and clearest way to achieve “student adds entry → appears in admin for accountant to approve → shows as paid in student portal” without breaking anything you’ve already built.

Once you decide between Option A and Option B (or a variant), the next step is to implement 3.1 and then the chosen option in small, testable steps (DB → Edge Function / RPC if needed → Admin UI → Student portal UI).
