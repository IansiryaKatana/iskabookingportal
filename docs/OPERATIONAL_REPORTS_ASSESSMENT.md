# Operational Reports – Assessment & Recommendations

**Page:** Admin → Reports → **Operational Reports** (`/admin/reports`)  
**Last assessed:** February 2025

---

## 1. Current Reports Overview

| Report | Data source | Pulling data correctly? | Notes |
|--------|-------------|-------------------------|--------|
| **Awaiting Signatures** | `student_applications` (status `awaiting_signature`) + profiles, emails, contracts, studios | ✅ Yes | Uses `useReport("awaiting_signatures")`. |
| **Awaiting Deposit** | `student_applications` (status `awaiting_deposit`), excludes those with `deposit_payment_intent_id` | ✅ Yes | Client-side filter for no deposit. |
| **Overdue Payments** | `student_applications` (confirmed) + `contract_payment_schedule` + paid status from **manual_payments** and **stripe_payments** | ✅ Fixed | Was only using manual_payments; now includes Stripe-paid instalments (see fixes below). |
| **Debtors** | Same as Overdue; filters to applications with outstanding balance (total due − total paid) | ✅ Fixed | Same payment logic as Overdue. |
| **Occupancy** | `studio_status_by_academic_year` (view) + applications for occupied studios, profiles, emails | ✅ Yes | Academic year optional; uses view for per-year status. |
| **Studio Allocation** | `studio_allocation_report` (view) | ✅ Yes | View aggregates by studio grade and allocation (Student/OTA/Keyworkers/Unallocated). |

---

## 2. Fixes Applied (This Session)

### 2.1 Missing columns in applications query

- **Issue:** The `student_applications` select in `useReports.ts` did not include `student_id` or `contract_id`. That could break:
  - Resolving student names/emails (empty profiles).
  - Building payment schedules for Overdue/Debtors (empty contract IDs).
- **Fix:** Added `student_id` and `contract_id` to the select list in `fetchReport()`.

### 2.2 Overdue Payments & Debtors – Stripe payments not counted

- **Issue:** “Paid” instalments were determined only from `manual_payments`. Instalments paid via Stripe (stored in `stripe_payments` with `metadata->>'instalment_id'`) were not considered, so students could appear as overdue or in debt after paying by card.
- **Fix:** In `useReports.ts`, when building paid instalments for Overdue/Debtors we now:
  - Query `stripe_payments` for `payment_type = 'instalment'` and `status IN ('succeeded','completed')`.
  - Add each `metadata->>'instalment_id'` that matches the report’s schedule IDs to the set of paid instalments.
  - Use the combined set (manual + Stripe) to mark schedule rows as paid.

---

## 3. Data Sources Summary

- **Awaiting Signatures / Awaiting Deposit / Overdue / Debtors:**  
  `student_applications` → profiles (names, phone), Edge Function `get-user-emails`, `contracts`, `studio_grades`, `studios`, `contract_payment_schedule`, `manual_payments`, `stripe_payments`, `application_cashbacks`, `partner_referrals`.

- **Occupancy:**  
  View `studio_status_by_academic_year` (optional academic year filter), then `student_applications` (confirmed, assigned studio in occupied list), profiles, emails, `studios`.

- **Studio Allocation:**  
  View `studio_allocation_report` (no academic year; global counts by grade and allocation type).

---

## 4. Recommendations

### 4.1 High priority (done)

- Include **Stripe-paid instalments** in Overdue and Debtors (implemented).
- Include **student_id** and **contract_id** in the applications select (implemented).

### 4.2 Medium priority

- **Academic year on list-style reports**  
  Add an optional Academic Year filter to **Awaiting Signatures**, **Awaiting Deposit**, **Overdue Payments**, and **Debtors** (filter by application’s contract `academic_year_id`), so reports align with how you run Occupancy and other year-scoped views.

- **Studio Allocation and academic year**  
  The `studio_allocation_report` view is global (all studios, no year). If you need “allocation for 2025/26 only”, consider either:
  - A new view or RPC that filters studios/applications by academic year, or  
  - Documenting that this report is intentionally global.

- **Skip unnecessary fetch for Occupancy / Studio Allocation**  
  When `selectedReport` is `occupancy` or `studio-allocation`, the hook still calls `fetchReport(reportType)`, which returns list data that the UI does not use (the page uses `occupancyReport` or `studioAllocationReport`). You can avoid that call by only running `useReport(selectedReport)` when `selectedReport` is one of `awaiting_signatures` | `awaiting_deposit` | `overdue_payments` | `debtors` (e.g. conditional query key or separate hooks).

### 4.3 Optional: New or expanded reports

- **Document expiry / expiring soon**  
  Report of students whose key documents (e.g. ID, visa) are missing or expiring in the next N days, if you store document metadata and expiry dates.

- **Applications by stage (pipeline)**  
  Counts or list by status (e.g. draft → awaiting_signature → awaiting_deposit → confirmed) with optional academic year and date range; useful for ops and forecasting.

- **Weekly payment summary (link or embed)**  
  You already have a **Weekly Payment Report** (Edge Function `weekly-payment-report`). Consider linking it from Operational Reports or from Accounting Reports so all “reports” entry points are discoverable.

- **Move-outs / contract end report**  
  List of confirmed bookings whose `contract_end` is in the next 7/14/30 days, to plan handovers and re-lets.

- **OTA vs direct allocation**  
  If you need to see “OTA bookings” vs “direct student bookings” in one place, a small report or filter (by booking source / allocation type) could sit here or under Sales.

---

## 5. Summary

- **All six Operational Reports are now pulling data as intended.**  
  The two critical fixes (applications select columns and Overdue/Debtors including Stripe-paid instalments) ensure correct student identity, contract linkage, and payment status.

- **Recommendations:**  
  Add optional academic year to list reports, optionally avoid fetching list data when showing Occupancy or Studio Allocation, and consider the optional new reports (document expiry, pipeline, weekly payment link, move-outs, OTA vs direct) as product priorities allow.
