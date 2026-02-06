# Upcoming & Paid Installments Report – Documentation

This document describes the **Upcoming & Paid Installments** report (Accounting Reports → Upcoming tab), how it works, how to use it, and how bulk-imported applications are supported via schedule backfill.

---

## 1. Overview

The **Upcoming & Paid Installments** report helps the finance team:

- See **who has installments due** in the next 7, 14, or 30 days (or all dates).
- See **who has paid** which installments (paid date and status).
- See **who is overdue** (installments past their due date).
- Export the same data to **CSV** for reconciliation and chase lists.

The report is **one row per installment** (per contract/application), with student name, studio, contract, due date, amount, status (upcoming / overdue / paid), and optional paid date.

**Where to find it:** Admin → **Accounting Reports** → **Upcoming** tab.

---

## 2. How It Works

### 2.1 Data source

The report is built from:

- **View:** `public.upcoming_and_paid_installments_report`
- **Base table:** `contract_payment_schedule` (one row per installment per contract: due date, amount, sequence, label).
- The view joins schedule rows to contracts, student applications, profiles (student name), studios (studio number), and studio grades. It also computes:
  - **is_paid** – from Stripe payments (metadata `instalment_id`) or `manual_payments.instalment_id`.
  - **paid_date** – date the installment was paid (Stripe or manual).
  - **status** – `upcoming` (due in future), `overdue` (due date &lt; today, not paid), or `paid`.

Only applications in status **confirmed**, **awaiting_deposit**, or **awaiting_signature** are included.

### 2.2 Migrations involved

| Migration | Purpose |
|-----------|--------|
| `20260220_upcoming_and_paid_installments_report.sql` | Creates the view (one row per installment with student/studio and paid status). |
| `20260221_upcoming_installments_report_academic_year_id.sql` | Adds `academic_year_id` to the view and DROP/CREATE so the report can be filtered by academic year. |
| `20260222_backfill_contract_payment_schedule.sql` | Backfills `contract_payment_schedule` for applications that have a contract and payment plan but no schedule rows (e.g. bulk import). |

---

## 3. Filters and Behaviour

### 3.1 Academic year

- **All academic years** – Shows installments for every contract (all years).
- **Specific year (e.g. 2025/26)** – Restricts to contracts in that academic year only.

“Due within” and “Status” then apply **within** that year. This scopes the report to “active payment plans for that academic year” as requested.

### 3.2 Due within

- **Next 7 days** – Due date between today and today + 7 days.
- **Next 14 days** – Due date between today and today + 14 days.
- **Next 30 days** – Due date between today and today + 30 days.
- **All dates** – No due-date filter; all installments in the report (past, today, future).

Important: **“Next 7/14/30 days” only includes future due dates.** Installments that were due in the past (overdue) do **not** appear when you select “Next 30 days”. To see them, use **Due within: All dates** and **Status: Overdue**.

### 3.3 Status

- **All** – Upcoming, overdue, and paid.
- **Upcoming** – Due date ≥ today, not paid.
- **Overdue** – Due date &lt; today, not paid.
- **Paid** – At least one payment (Stripe or manual) recorded for that installment.

### 3.4 Typical use cases

| Goal | Academic year | Due within | Status |
|------|----------------|------------|--------|
| Installments due in the next 30 days for 2025/26 | 2025/26 | Next 30 days | All or Upcoming |
| Overdue installments (e.g. first installment already due) | Any or specific year | **All dates** | **Overdue** |
| Who has paid (all paid installments) | Any or specific year | All dates | Paid |
| Full picture for one year | Specific year | All dates | All |

---

## 4. Bulk-Imported Applications and Schedule Backfill

### 4.1 Why bulk-imported applications showed nothing

The report only shows installments that exist in the table **`contract_payment_schedule`**.

- **Bulk import** creates `student_applications`, links them to contracts and payment plans, but **does not** insert rows into `contract_payment_schedule`.
- So for those applications there were **no schedule rows** → the report had nothing to show.
- The student portal still showed installments because it **generates** the schedule in memory from `payment_plan_installments` when no rows exist; that logic does not write to the database.

### 4.2 Fix: backfill migration

Migration **`20260222_backfill_contract_payment_schedule.sql`**:

1. **Function:** `backfill_contract_payment_schedule_for_contract(p_contract_id UUID, p_payment_plan_id UUID)`
   - If the contract already has rows in `contract_payment_schedule`, it does nothing (returns 0).
   - Otherwise it generates schedule rows from the payment plan’s installments (excluding deposit), using the same rules as the portal (amounts from contract total and payment plan; last installment adjusted for rounding; due dates from fixed date or contract start + offset).
   - Returns the number of rows inserted.

2. **One-time backfill (in the same migration):**
   - Finds every contract that has at least one application in **confirmed**, **awaiting_deposit**, or **awaiting_signature** with a **selected_payment_plan_id** and **no** rows in `contract_payment_schedule`.
   - Calls the function for each such contract so that missing schedules are created.

After applying this migration, bulk-imported (and any other) confirmed applications that had no schedule will have rows in `contract_payment_schedule`, and they will appear in the Upcoming report.

### 4.3 When to run the backfill

- **Once:** When you first add the report or after bulk imports that don’t create schedules (running `supabase db push` or the migration applies the one-time backfill).
- **Again later:** If you bulk-import more applications and they don’t create schedule rows, you can call the function per contract or re-run a similar backfill script. The function is safe to call multiple times (no-op when the contract already has a schedule).

---

## 5. CSV Export

The **Export CSV** button on the Upcoming tab exports the **currently filtered** rows with columns:

- Student Name, Studio, Studio Grade  
- Contract, Academic Year  
- Due Date, Amount, Status, Paid Date  
- Installment Label, Application ID, Is Deposit  

Use the same filters (academic year, due within, status) as on screen to get the export you need (e.g. overdue only, or next 30 days for one year).

---

## 6. UI Hint

On the Upcoming tab, a short note under the filters explains:

- To see **overdue** installments (e.g. first installment already due): set **Due within: All dates** and **Status: Overdue**.
- If **nothing appears** for bulk-imported applications, the schedule backfill (see docs) may be needed.

---

## 7. Related Documentation

- **`docs/UPCOMING_PAYMENTS_REPORT_EXPLAINED.md`** – Short explanation of “why nothing showed” (missing schedule + due-window filter) and how to see overdue.
- **`docs/CSV_EXPORT_AND_FINANCE_REPORTS_RECOMMENDATIONS.md`** – CSV export audit and recommendation for this report (including academic year and upcoming/paid logic).

---

## 8. Summary

| Topic | Summary |
|-------|--------|
| **Report** | Upcoming & Paid Installments: one row per installment, with student name, studio, due date, amount, status (upcoming/overdue/paid), paid date. |
| **Location** | Admin → Accounting Reports → Upcoming tab. |
| **Filters** | Academic year, Due within (7/14/30 days or all), Status (all/upcoming/overdue/paid). |
| **Overdue** | Use Due within: **All dates** and Status: **Overdue**. |
| **Bulk import** | No schedule rows by default; run migration `20260222_backfill_contract_payment_schedule.sql` to create them so these applications appear in the report. |
| **Export** | CSV export uses the same filters as the on-screen table. |
