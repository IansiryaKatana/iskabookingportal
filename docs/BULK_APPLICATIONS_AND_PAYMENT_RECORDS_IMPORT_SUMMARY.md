# Bulk Import: Applications + Payment Records — Summary & Recommendations

This document summarises the agreed approach for **bulk importing applications** and **payment records**, and gives detailed recommendations so the system is not broken.

---

## 1. Where This Was Documented

The design is spread across these docs:

| Document | What it covers |
|----------|----------------|
| **BULK_APPLICATION_IMPORT_RECOMMENDATIONS.md** | Applications on `/admin/data-import`, Phase 4 = Payment Import as separate phase |
| **BULK_APPLICATION_IMPORT_PROPOSAL.md** | Section 6: Payment Import Strategy; Scenario 1: “Import payments separately” |
| **COMPREHENSIVE_BULK_IMPORT_SYSTEM.md** | Phase 5 Historical Data: Applications then “Import Payments” as separate step; Phase 4 lists “Payments Import” |
| **COMPREHENSIVE_BULK_IMPORT_ASSESSMENT.md** (in `supabase/migrations/`) | Current: only deposit in application import; **installment payment import missing**; recommends separate payment handling |
| **BULK_IMPORT_IMPLEMENTATION_ROADMAP.md** | Phase 4: “Payments Import – Historical payment records” as its own import |

So the **agreed direction** is: keep the **current application bulk upload** as-is (including deposit), and add a **separate bulk import for payment records** (installments and other payments).

---

## 2. The Two-Part Design (Recap)

### Part A: Keep Current Application Bulk Upload (Unchanged)

- **Where:** `/admin/data-import` → import type **Applications**.
- **What it does:**
  - Creates/finds users (placeholder or existing).
  - Creates `student_applications` with steps, contract, studio, payment plan, status, etc.
  - Creates **one manual payment for the deposit** (if CSV has `deposit_amount` / `deposit_paid_date`) in `manual_payments` with `payment_type = 'deposit'`.
  - Does **not** create installment or other payment records.
- **Why keep it:** It already works, handles the heaviest part (applications + deposit), and is the single source for “application + deposit” so you avoid duplicate or conflicting deposit logic.

So: **do not remove or replace the current application bulk upload.** Any new feature is **in addition** to it.

### Part B: Separate Bulk Import for Payment Records

- **Purpose:** Import **installment** and other **non-deposit** payments (historical or corrections) without touching application creation.
- **When to use:** After applications (and optionally contracts/schedules) exist — e.g. “Phase 5: Historical Data” or “Phase 4: Payments Import” in the roadmap.
- **What it does:**
  - Reads a **payment-only CSV** (e.g. application identifier, payment type, amount, date, method, notes).
  - Resolves `application_id` (e.g. by email + academic year or by application reference).
  - Inserts into `manual_payments` (and optionally links to `contract_payment_schedule` if you track per-installment).
  - Does **not** create or change applications or users.

So: **one flow for applications (with deposit), one flow for payment records.**

---

## 3. How It Would Work End-to-End

### Recommended order

1. **Foundation & config (existing)**  
   Academic years, studio grades, studios, prices, payment plans, installments, contracts (and contract payment schedules if you use them).

2. **Bulk import applications (existing)**  
   - Use current “Applications” import.  
   - CSV includes deposit fields; deposit is created as one `manual_payments` row.  
   - No installment data in this CSV.

3. **Bulk import payment records (new)**  
   - New import type e.g. “Payment records” or “Payments” on the same `/admin/data-import` page.  
   - CSV lists **per-application payments** (installments, extra manual payments, etc.).  
   - Each row → one (or more) `manual_payments` row(s), with `application_id` set.  
   - Optional: link to `contract_payment_schedule.instalment_id` if you want “which installment this pays”.

### Why this doesn’t break the system

- **Applications:** Unchanged. No new application logic, no change to `bulk_import_student_applications`.
- **Deposits:** Stay in application import only; payment import does not create deposits (or you explicitly define rules to avoid duplicates).
- **Reporting / balance:** All payments still go into `manual_payments` (and Stripe where applicable); existing views (e.g. payment summary, history) keep working.
- **Idempotency:** Payment import can be “add-only” (no delete/update of applications), with optional duplicate checks (e.g. same application + amount + date = skip or warn).

---

## 4. Detailed Recommendations (Safe for Production)

### 4.1 Application import (current) — leave as-is

- **Do not** add installment columns to the **application** CSV or to `bulk_import_student_applications`.
- **Do** keep deposit in application import only: one deposit per application row, one `manual_payments` row with `payment_type = 'deposit'`.
- Ensures a single, clear place for “application + deposit”; avoids double deposits or logic split across two imports.

### 4.2 New “Payment records” import — design

- **Location:** Same `/admin/data-import` page, new import type (e.g. `payment_records` or `payments`).
- **Edge function:** Reuse `bulk-import-data`; add a branch for `import_type: "payment_records"` that:
  - Parses the payment CSV.
  - Validates (required columns, amounts > 0, dates, application lookup).
  - Calls a new RPC, e.g. `bulk_import_payment_records(p_rows JSONB, p_imported_by UUID)`.
- **Database:** New function `bulk_import_payment_records`:
  - For each row: resolve `application_id` (e.g. by `student_email` + `academic_year_name` or by `application_id`/external ref if you have it).
  - Insert into `manual_payments`: `application_id`, `amount`, `payment_date`, `payment_type` (‘installment’ or ‘other’), `payment_method`, `notes`, `recorded_by`.
  - If you use `contract_payment_schedule`: optionally set `instalment_id` when the CSV identifies which installment (e.g. installment number or due date).
  - Use a transaction per row (or small batch) so one bad row doesn’t corrupt the rest; return per-row success/error in the report.

### 4.3 Payment CSV shape (recommended)

Keep it simple and consistent with existing `manual_payments`:

- **Required:** Application identifier (e.g. `student_email` + `academic_year_name`, or `application_id` if you export it), `amount`, `payment_date`, `payment_type` (e.g. `installment`), `payment_method` (e.g. `bank_transfer`).
- **Optional:** `notes`, `instalment_number` or `instalment_due_date` (if you want to link to `contract_payment_schedule`), `receipt_number` (if you need uniqueness).

Example (by email + academic year):

```csv
student_email,academic_year_name,payment_type,amount,payment_date,payment_method,notes
student@example.com,2024/2025,installment,500.00,2024-10-01,bank_transfer,First installment
student@example.com,2024/2025,installment,500.00,2024-11-01,bank_transfer,Second installment
```

### 4.4 Avoid breaking existing behaviour

- **Deposit:** In payment-records import, either:
  - **Do not** allow `payment_type = 'deposit'`, and document that deposits are only in application import, or  
  - If you do allow it, add a guard: “application already has a deposit (deposit_payment_intent_id or manual_payment deposit) → skip or error for that row”.
- **Schedules:** If reports/portal rely on `contract_payment_schedule` or `get_payment_summary`, ensure:
  - Applications have `selected_payment_plan_id` and schedules exist (already in your assessment), and  
  - Payment import only **adds** payments; it doesn’t delete or change schedule rows.
- **RLS / auth:** Reuse the same service role / auth as the rest of bulk-import-data; no new bypasses.
- **Idempotency:** Optionally detect duplicates (e.g. same application_id + amount + payment_date) and skip or report as warning instead of inserting twice.

### 4.5 Order of operations and validation

- **Dependency:** Require that applications (and ideally payment schedules) exist before running payment records import. In the UI, show “Payment records import requires Applications (and optionally Contracts / Schedules) to be imported first.”
- **Validation before insert:**  
  - Application exists and is resolved.  
  - Amount > 0, payment_date valid.  
  - payment_type in an allowed set (e.g. `installment`, `other`; deposit only with the guard above).  
  - If you link to installments, validate `instalment_id` or instalment key exists for that contract.

### 4.6 Reporting and rollback

- **Report:** Same pattern as other bulk imports: total rows, succeeded, failed, per-row errors (e.g. “application not found”, “invalid date”).  
- **Rollback:** No automatic delete. If a run was wrong, either:  
  - Fix data manually (or with a one-off script), or  
  - Add a separate “bulk delete payment records by import batch” later (with audit and safety checks).  
  - Prefer “add-only” for the first version.

### 4.7 What not to do

- **Do not** put installment columns into the **application** CSV and then create many payments inside `bulk_import_student_applications`. That would bloat and complicate the only function that creates applications and deposits.
- **Do not** let the new payment import create or update applications or users.
- **Do not** change existing `get_payment_summary` or reporting logic unless you’re explicitly adding support for the new payment types or allocation rules.

---

## 5. Implementation Checklist (Done)

- [x] Add import type `payment_records` on `/admin/data-import` (DataImport.tsx).
- [x] Add CSV template and download for payment records (csvTemplateGenerator.ts).
- [x] In bulk-import-data, add payment_records and map to RPC bulk_import_payment_records.
- [x] Create migration 20260223_bulk_import_payment_records.sql; optional link via instalment_sequence.
- [x] Application resolution: by application_id or by student_email + academic_year_name.
- [x] Deposit handling: either disallow deposit in this import or add “already has deposit” check.
- [x] Per-row transaction and error reporting.
- [x] CSV template: Download from Data Import page (student_email, academic_year_name, amount, payment_date, payment_method, notes, instalment_sequence). “Applications (with deposit) first; then Payment records for installments.”

---

## 6. Summary

- **Application bulk upload:** Keep it. It stays responsible for applications + **one deposit** per application.  
- **Payment records bulk upload:** New, separate import for **installments and other payments** only, after applications exist.  
- **How it works:** Same `/admin/data-import` page, two import types; payment import only inserts into `manual_payments` (and optionally links to schedules) and does not touch applications.  
- **So you get:** Clear separation, no duplication of deposit logic, minimal risk to existing application import, reporting, or payment summary logic, with a path to full historical payment history via a dedicated, add-only payment import.

If you want, next step can be a concrete CSV column list and a minimal `bulk_import_payment_records` SQL signature and behaviour line-by-line so your team can implement it without breaking the system.
