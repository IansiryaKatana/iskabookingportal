# CSV Export and Finance Reports – Recommendations

## 1. CSV export audit: where names help

Review of all CSV export functions and whether they would benefit from **student name** and **studio name** (or studio number) instead of or in addition to IDs.

| Export / Page | Current columns | Benefit from names? | Status / Notes |
|---------------|-----------------|----------------------|----------------|
| **Payment History** (`/admin/payment-history`) | Had Student ID, Application ID only | **High** – finance needs to match payments to people and studios | **Done** – CSV now includes Student Name, Studio, Studio Grade (IDs kept for traceability). |
| **Accounting Reports – Accounts Receivable** | Application ID, **Student Name**, Studio Number, etc. | Already has names | No change. |
| **Accounting Reports – Outstanding Balances** | Application ID, **Student Name**, Studio Grade, etc. | Already has names | No change. |
| **Accounting Reports – Deposit/Installment Breakdown** | Application ID, **Student Name**, Contract, Studio Grade | Already has names | No change. |
| **Accounting Reports – Bank Reconciliation** | **Student Name**, Contract, Studio Grade | Already has names | No change. |
| **Accounting Reports – Revenue Summary** | Period-level aggregates only (no student rows) | N/A | No change. |
| **Fully Paid Students** | **Student Name**, Email, Studio Number, Studio Grade | Already has names | No change. |
| **Reports (Studio allocation)** | Studio grade / counts only | No student rows | No change. |
| **Reports (Occupancy)** | **Student Name**, Student Email, Studio Number | Already has names | No change. |
| **Reports (Sales / Overdue / Debtors etc.)** | **Student Name**, Email, Contract, Studio Grade | Already has names | No change. |
| **Booking Calendar** | **Student Name**, Student Email, Studio Number, Studio Grade | Already has names | No change. |
| **OTA Finance** | Guest Name, **Studio Number** | Already human-readable | No change. |
| **Expenses** | Category, Vendor, etc. (no student) | N/A | No change. |
| **Audit Logs** | Staff Member, Action, **Entity Type**, **Entity ID** | **Medium** – “Entity ID” is often a UUID; adding “Entity name” (e.g. student/app name when type = student_application) would help | Optional enhancement. |

**Summary**

- **Payment History** was the main gap: it only had Student ID and Application ID. It now includes **Student Name**, **Studio** (number), and **Studio Grade** in the CSV (IDs retained for traceability).
- All other exports that list students or studios already use names/studio number/grade. No further changes required for “names instead of IDs” there.
- **Audit Logs**: adding an optional “Entity name” column (when entity is a student/application/contract) would improve readability; lower priority than Payment History.

---

## 2. Payment History CSV change (implemented)

- **DB**: View `unified_payment_history` extended with:
  - `student_name` (from `profiles`: first_name + last_name)
  - `studio_number` (from `studios` via `student_applications.assigned_studio_id`)
  - `studio_grade` (from `studio_grades` via `student_applications.studio_grade_id`)
- **Frontend**: Payment History CSV export now includes columns: **Student Name**, **Studio**, **Studio Grade** (plus existing columns including Student ID and Application ID for reference).

---

## 3. Finance report: upcoming payments and who has paid

### 3.1 What finance needs

- **Upcoming payments**: who has installments due in the next X days (e.g. 7, 14, 30), with student name, studio, amount, due date, and whether it’s paid or not.
- **Who has paid**: list of installments (or payment plan positions) with due date and paid status (paid on time, paid late, unpaid, upcoming).

This supports:
- Cash flow forecasting
- Chase list for overdue/upcoming
- Confirmation of who has paid off installments

### 3.2 What already exists

- **`contract_payment_schedule`**: one row per installment per contract (due_date, amount, sequence, label). This is the source of truth for “what is due and when”.
- **`unified_payment_history`**: actual payments (Stripe + manual). Matching is by application/contract and installment (e.g. metadata/instalment_id or manual_payments.instalment_id).
- **`outstanding_balances_report`**: per application: total_due, total_paid, outstanding_balance, **oldest_unpaid_due_date**, **days_overdue**, plus student_name, contract, studio_grade. Good for “who owes money” and “oldest overdue”, but not a row-per-installment view.
- **`useReports` (overdue_payments, debtors)**: uses contract_payment_schedule and maps to applications; can show overdue amounts and days.
- **Dashboard stats**: e.g. `upcoming_instalments_count`, `upcoming_instalments_total`, `upcoming_instalments_next_due` (aggregates).

So: **row-level installment data** (contract_payment_schedule + paid/unpaid) and **student/studio names** are available; what’s missing is a **single report/view** that combines them for “upcoming by due date” and “who has paid which installment”.

### 3.3 Recommended approach

**Option A – New DB view: `upcoming_and_paid_installments_report` (recommended)**

- **Purpose**: One row per installment (per contract/application), with due_date, amount, student name, studio number/grade, and paid status.
- **Logic**:
  - Base: `contract_payment_schedule` joined to `contracts` → `student_applications` (to get application_id, student_id, assigned_studio_id, studio_grade_id).
  - Join `profiles` for student name, `studios` for studio_number, `studio_grades` for studio_grade name.
  - “Paid” flag: LEFT JOIN to a subquery (or function) that marks an installment as paid if there is a matching payment in `unified_payment_history` (or stripe_payments + manual_payments) for that contract_payment_schedule.id (e.g. via metadata->instalment_id or manual_payments.instalment_id).
- **Columns (example)**: application_id, student_id, student_name, studio_number, studio_grade, contract_name, contract_id, installment_id, sequence, label, due_date, amount, is_paid, paid_date (if paid).
- **Usage**: Admin/Accounting page can filter by due_date range (e.g. next 7/14/30 days or “all upcoming”), and optionally “only unpaid” or “only paid”. Export to CSV for finance.

**Option B – Extend Accounting Reports UI**

- Add a tab or section “Upcoming payments” / “Installment schedule” that:
  - Calls a new RPC or reads from the new view above.
  - Filters: date range (e.g. due in next 7 / 14 / 30 days), status (upcoming / overdue / paid).
  - Shows table: Student Name, Studio, Contract, Due Date, Amount, Status (Paid / Unpaid / Overdue).
  - **Export CSV** with same columns (and optional Student ID, Application ID for traceability).

**Option C – Reuse existing reports + small extension**

- **Outstanding balances** already gives “who has unpaid balance” and “oldest unpaid due date”. To get “next due” installments explicitly, either:
  - Add a second view/function that returns **next N upcoming installments** (by due_date) with student name and studio, and a “paid” flag; or
  - In the same report, add a column “next_due_date” and “next_due_amount” (from contract_payment_schedule) per application.

**Recommendation**

- Implement **Option A** (view `upcoming_and_paid_installments_report`) so all “installment + paid status” reporting and exports use one source of truth.
- Add an **Accounting Reports** tab or a dedicated **“Upcoming payments”** page that queries this view, with filters (due window, paid/unpaid) and **Export CSV** (with student name and studio, same as Payment History).
- Optionally add a small **“Paid off this period”** filter or section (installments with due_date in range and is_paid = true) for “who has paid” reporting.

### 3.4 Implementation notes

- **Paid detection**: An installment is “paid” if:
  - For **Stripe**: `stripe_payments` has a row for that application with `metadata->>'instalment_id' = contract_payment_schedule.id::text` (and status succeeded/completed); or
  - For **Manual**: `manual_payments` has `instalment_id = contract_payment_schedule.id`.
- **Deposits**: If contract_payment_schedule includes a “Deposit” row (e.g. sequence 1, label “Deposit”), include it in the view so finance sees deposit due/paid in the same report. If your business treats deposit separately, add a column `is_deposit` so the UI can filter.
- **Performance**: Index on `contract_payment_schedule(due_date)` and on the join keys (contract_id, application_id, etc.) so date-range filters stay fast.

---

## 4. Summary

| Item | Status |
|------|--------|
| Payment History CSV: add Student Name, Studio, Studio Grade | **Done** (view + frontend export). |
| Other CSV exports: audit | **Done** – only Payment History needed names; others already have them. |
| Optional: Audit Logs “Entity name” | Recommended as a later enhancement. |
| Upcoming payments report (by due date, with paid/unpaid) | **Recommended**: new view + Accounting (or dedicated) page + CSV export. |
| “Who has paid off” installments | **Recommended**: same view with filter “is_paid = true” and optional “due in period” for paid-in-period reporting. |

If you want to proceed with the upcoming/paid installments report, the next step is to add the migration for `upcoming_and_paid_installments_report` and a small UI section with filters and CSV export.
