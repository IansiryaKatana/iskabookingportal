# Xero Integration – System Analysis & Recommendation

This document analyses the STUCOMMS Booking Portal codebase and database to identify **where and how** a Xero integration would add value, and whether it is feasible to implement.

---

## 1. Executive Summary

**Verdict: Yes, a Xero integration is both helpful and feasible.** Your system already has the financial data, reporting, and structure that align well with Xero’s APIs. The main benefits would be: **single source of truth for accounting**, **automated sync of revenue and expenses**, **bank reconciliation support**, and **reduced manual CSV exports**. Implementation can be phased (e.g. payments → invoices → expenses) and built on top of existing views, credentials storage, and edge functions.

---

## 2. Where Xero Would Be Helpful (By Area)

### 2.1 Revenue & Payments (High Value)

| Current state | Xero benefit |
|---------------|--------------|
| **Stripe + manual payments** in `stripe_payments` and `manual_payments`, unified in `unified_payment_history`. | Push each **payment** (or batched bank deposits) to Xero as **Bank Transactions** or **Payments** against invoices so bank rec in Xero matches your portal. |
| **Revenue summary** via `get_revenue_summary()` (month/quarter, deposit vs instalment, Stripe vs manual, refunds). | Xero can hold the same breakdown in **Profit & Loss** by account; sync keeps figures aligned. |
| **Bank reconciliation report** (`bank_reconciliation_report` view) with payment date, amount, source, student, invoice number. | Reduces double entry: one reconciliation in Xero instead of portal + spreadsheet/Xero. |
| **Payment History** admin page with CSV export and invoice PDFs. | Optional: sync paid invoices to Xero so **Invoices** and **Payments** in Xero reflect the portal; PDFs can remain your internal record. |

**Relevant DB/API surface:**

- **Tables:** `stripe_payments`, `manual_payments`
- **View:** `unified_payment_history` (payment_id, student_application_id, amount_paid, currency, payment_date, payment_source, student_name, studio_number, studio_grade, contract_name, academic_year_name, payment_type, payment_metadata)
- **View:** `bank_reconciliation_report` (includes invoice_number, invoice_generated_at, payment_method, student_name, etc.)
- **Function:** `get_revenue_summary(p_start_date, p_end_date, p_group_by)` → period totals, refunds, net revenue

### 2.2 Invoicing (High Value)

| Current state | Xero benefit |
|---------------|--------------|
| **Invoice numbers** on `stripe_payments` and `manual_payments` (`invoice_number`, `invoice_generated_at`). | Use same number in Xero **Sales Invoice** to avoid duplicate or conflicting invoice references. |
| **Invoice PDFs** generated in-app (`generate-student-invoice-pdf` edge function, `invoicePdfGenerator.ts`) with company branding, student details, payment type (deposit/instalment), amount. | Xero can be source of “official” invoice; or you create/update **Invoice** in Xero when payment is recorded and optionally attach PDF. |
| **Branding** (company name, address, contact, VAT number, company number) in `branding_settings` and used in PDFs. | Matches **Organisation** and **Tax** settings in Xero; one place to maintain legal/financial identity. |

**Relevant DB/API surface:**

- **Tables:** `stripe_payments`, `manual_payments` (invoice_number, invoice_generated_at)
- **Branding:** `branding_settings` (company_name, contact_email, contact_phone, company_address, vat_number, company_number, etc.)
- **Student/contact:** `profiles`, `student_application_steps` (step 1 = name, step 2 = address), auth.users (email)
- **Edge function:** `generate-student-invoice-pdf` (payment + application + profile + branding → PDF + invoice number persistence)

**Mapping to Xero:**

- One **Contact** per student (or per application if you need multiple addresses).
- One **Sales Invoice** per payment (deposit or instalment) with line item description (e.g. “Deposit – Contract X”, “Instalment 2 – Contract X”), amount, date, your invoice number.
- **Payment** in Xero against that invoice when money is received (Stripe or manual).

### 2.3 Expenses (Medium Value)

| Current state | Xero benefit |
|---------------|--------------|
| **Utility/expenses** in `utility_payments` (academic_year_id, expense_category, amount, payment_date, vendor_name, invoice_number, receipt_path, notes). | Push as **Bills** or **Spend Money** transactions in Xero so P&L and bank rec include your categorised expenses. |
| **Expense summary** view `expense_summary_by_academic_year` (by category). | Mirrors how you might report in Xero by account/category. |

**Relevant DB/API surface:**

- **Table:** `utility_payments` (id, academic_year_id, expense_category, description, amount, payment_date, vendor_name, invoice_number, receipt_path, notes, created_by, etc.)
- **View:** `expense_summary_by_academic_year`
- **UI:** Admin **Expenses** page and `useUtilityPayments` hook

**Mapping to Xero:**

- **Contact** for vendor (vendor_name).
- **Bill** or **Spend Money** with category mapped from `expense_category` to a Xero **Account Code** (e.g. electricity, water, insurance).

### 2.4 Refunds (Medium Value)

| Current state | Xero benefit |
|---------------|--------------|
| **Refunds** in `refunds` (application_id, student_id, amount_pence/amount_gbp, status, processed_at). | Create **Credit Note** or **Refund** in Xero so revenue and AR stay correct and bank rec matches. |
| **Revenue summary** already subtracts refunds (`get_revenue_summary` → total_refunds, net_revenue). | Xero P&L can show same net if refunds are synced as credit/refund transactions. |

**Relevant DB/API surface:**

- **Table:** `refunds` (id, application_id, student_id, payment_intent_id, stripe_refund_id, amount_pence, amount_gbp, reason, status, processed_at)
- **Revenue:** `get_revenue_summary` includes refund_data and net_revenue

### 2.5 Accounts Receivable & Outstanding Balances (High Value)

| Current state | Xero benefit |
|---------------|--------------|
| **Accounts receivable** view `accounts_receivable_report` (application, student, contract, total_due, total_paid, outstanding_balance, payment_status). | Sync **outstanding balances** as **Invoices** (or single “statement” invoice) so Xero **Aged Receivables** matches your portal. |
| **Outstanding balances** view `outstanding_balances_report` (days_overdue, oldest_unpaid_due_date). | Supports dunning and reporting in Xero (e.g. overdue reports). |

**Relevant DB/API surface:**

- **Views:** `accounts_receivable_report`, `outstanding_balances_report`
- **Function:** `get_payment_summary(p_application_id)` (total_due, total_paid, remaining_balance, payment_status)

### 2.6 Financial Forecasting (Lower Priority for Xero)

| Current state | Xero benefit |
|---------------|--------------|
| **Financial forecasts** in `financial_forecasts` and `financial_forecast_breakdowns` (target vs current revenue, contract breakdown). | Forecasting stays in your app; Xero is the source of **actual** revenue/expenses. You could (later) pull actuals from Xero into the portal for comparison. |

Xero integration here is optional and typically a later phase (e.g. read-only “actuals” from Xero).

### 2.7 Company Identity & Credentials (Enabler)

| Current state | Xero benefit |
|---------------|--------------|
| **Company details** in `branding_settings` (company_name, contact, address, vat_number, company_number). | Same details used in Xero organisation; keeps invoices and legal identity consistent. |
| **Credentials** table (`credentials`) for API keys (e.g. Resend), secured with RLS (staff only). | Store **Xero OAuth2** or API credentials (e.g. `xero_client_id`, `xero_client_secret`, or refresh token) the same way; edge functions can call `get_credential_value` (with service role where needed) to talk to Xero. |

**Relevant DB/API surface:**

- **Table:** `credentials` (credential_key, credential_value, credential_type, description)
- **Migration:** `20260218_get_credential_value_allow_service_role.sql` (if present) for edge-function access to credentials
- **Branding:** `branding_settings`

---

## 3. How a Xero Integration Could Work (Technical)

### 3.1 Authentication

- **Xero OAuth 2.0** (recommended): Authorise once (e.g. via admin Settings “Connect to Xero”), store **refresh_token** securely (e.g. in `credentials` or Supabase secrets). Edge functions use refresh_token to get access_token and call Xero APIs.
- **Scope suggestions:** `openid profile email accounting.transactions accounting.settings offline_access` (and optionally `accounting.contacts` if you manage contacts from the portal).

### 3.2 What to Sync (Recommended Order)

1. **Phase 1 – Payments to Xero**
   - **Source:** `unified_payment_history` (or `bank_reconciliation_report`) for a date range.
   - **Target:** Xero **Payments** (and optionally **Invoices** if you create them first).
   - **Flow:** New or updated rows (e.g. `payment_date` today or since last sync) → create/update Payment (and Invoice if needed) in Xero. Store `xero_invoice_id` / `xero_payment_id` in your DB (new columns or a `xero_sync_log` table) to avoid duplicates.
   - **Idempotency:** Key by (payment_id, payment_source) or invoice_number so re-runs don’t create duplicates.

2. **Phase 2 – Invoices in Xero**
   - When a payment is recorded (Stripe webhook or manual entry), create a **Sales Invoice** in Xero (if not already created) with your `invoice_number`, contact (student), line items (e.g. “Deposit” or “Instalment N”), amount, date. Then create **Payment** against it.
   - Reuse data already used by `generate-student-invoice-pdf` (payment, application, profile, branding).

3. **Phase 3 – Expenses**
   - On create/update of `utility_payments`, create **Bill** or **Spend Money** in Xero; map `expense_category` to Xero account code. Store `xero_bill_id` or similar for idempotency.

4. **Phase 4 – Refunds**
   - When a refund is recorded, create **Credit Note** or **Refund** in Xero linked to the original invoice/payment.

5. **Optional – Contacts**
   - Create/update **Contact** in Xero when a student is created or when first invoice is generated (from profiles + application steps + auth email).

### 3.3 Where to Implement

- **Supabase Edge Functions** (recommended): e.g. `xero-sync-payments`, `xero-create-invoice`, `xero-sync-expense`, `xero-refund`. Call from:
  - **Stripe webhook** (`sync-payment-from-stripe`) after inserting into `stripe_payments`.
  - **Manual payment entry** (after insert into `manual_payments`).
  - **Scheduled job** (e.g. daily sync of yesterday’s payments) or “Sync to Xero” button on Payment History / Accounting Reports.
- **Credentials:** Store Xero client id, client secret, and refresh_token in `credentials` (or Supabase secrets). Use existing `get_credential_value` from edge functions (with service role if required).
- **Idempotency / state:** Add columns e.g. `xero_invoice_id`, `xero_payment_id` on `stripe_payments` and `manual_payments` (or a single `xero_sync_log` table with entity_type, entity_id, xero_id, synced_at).

### 3.4 Data Mapping Summary

| Your system | Xero entity | Notes |
|-------------|------------|--------|
| `unified_payment_history` row (per payment) | **Invoice** + **Payment** | One invoice per payment (deposit/instalment); invoice number = your invoice_number. |
| Student (profile + application steps + email) | **Contact** | Name, email, address. |
| `utility_payments` row | **Bill** or **Spend Money** | Vendor = vendor_name; account = map expense_category. |
| `refunds` row | **Credit Note** or **Refund** | Link to original invoice. |
| `branding_settings` (company, VAT, etc.) | **Organisation** (read-only or reference) | Used when creating invoices; no need to write back. |
| `get_revenue_summary` | **Profit & Loss** (by period) | Sync payments/refunds; P&L is derived in Xero. |
| `bank_reconciliation_report` | **Bank reconciliation** | Payments in Xero match this list; reconcile in Xero. |

---

## 4. Feasibility Checklist

| Requirement | Status in your system |
|-------------|------------------------|
| **Structured payment data** | ✅ `stripe_payments`, `manual_payments`, `unified_payment_history`. |
| **Invoice numbers** | ✅ On both payment tables; generated in PDF flow. |
| **Customer/contact data** | ✅ Profiles, application steps, auth email. |
| **Company/branding** | ✅ `branding_settings` (name, address, VAT, etc.). |
| **Expenses** | ✅ `utility_payments` with category, vendor, amount, date. |
| **Refunds** | ✅ `refunds` with amount_gbp, status, processed_at. |
| **Secure credential storage** | ✅ `credentials` table + RLS; edge functions can use get_credential. |
| **Server-side API calls** | ✅ Edge functions already used for Stripe, PDF, emails. |
| **Idempotency / sync state** | ⚠️ To be added (e.g. xero_invoice_id, xero_payment_id or sync log table). |

**Conclusion:** The system is well-aligned with what Xero expects. The only new pieces are: Xero OAuth flow (or app-only auth), mapping logic, and storing Xero IDs for idempotency.

---

## 5. Recommendations

### 5.1 Do It If…

- You (or your accountant) use or plan to use **Xero** for bookkeeping, VAT, and bank reconciliation.
- You want to **stop manually exporting CSVs** from Payment History / Accounting Reports and re-entering in Xero.
- You want **one place** (Xero) for official financial statements and tax reporting, with the portal as the operational source of payments and invoices.

### 5.2 Phasing

1. **Phase 1:** Sync **payments** (and optionally create **invoices**) to Xero when they occur (Stripe + manual), with a “Sync to Xero” or scheduled job for backfill.
2. **Phase 2:** Sync **expenses** from `utility_payments` to Xero as bills/spend money.
3. **Phase 3:** Sync **refunds** as credit notes/refunds.
4. **Phase 4 (optional):** Two-way – e.g. read actuals from Xero for comparison with your financial forecasts.

### 5.3 Cost & Complexity

- **Xero API** is free for normal accounting usage (rate limits apply; sufficient for a booking portal).
- **Build:** 1–2 edge functions for OAuth + sync, new columns or sync log table, and admin UI for “Connect to Xero” and “Sync now”. Complexity is **medium**: mapping and idempotency matter more than new infrastructure.
- **Libraries:** Use Xero’s REST API from Deno (fetch) or a small Xero SDK if available for Deno/Node; no need for paid third-party middleware if you keep the scope to sync only.

### 5.4 Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Duplicate invoices/payments in Xero | Store xero_invoice_id / xero_payment_id; before create, check if already synced. |
| Token expiry | Use refresh_token and refresh in edge function before each run. |
| Different chart of accounts | Map your payment types (deposit/instalment) and expense categories to Xero account codes (config in DB or env). |
| Manual edits in Xero | Decide one source of truth (e.g. portal = source; Xero = downstream). Avoid editing synced invoices in Xero if you re-sync. |

---

## 6. Next Steps (If You Proceed)

1. **Register a Xero app** (https://developer.xero.com), get client id and client secret; configure redirect URI for your admin “Connect to Xero” page.
2. **Add credentials:** e.g. `xero_client_id`, `xero_client_secret` in `credentials`; after OAuth, store `xero_refresh_token` (and optionally tenant id).
3. **Add sync state:** e.g. `xero_invoice_id`, `xero_payment_id` on `stripe_payments` and `manual_payments`, or a `xero_sync_log` table.
4. **Implement edge function** “xero-sync-payment” (and optionally “xero-create-invoice”) called from Stripe webhook and manual payment flow; add “Sync to Xero” in Admin → Payment History or Accounting Reports.
5. **Test** with a Xero demo company: create a payment in the portal, run sync, verify invoice + payment in Xero.
6. **Extend** to expenses and refunds in later phases.

---

## 7. References in Your Codebase

- **Payments & history:** `src/hooks/useUnifiedPayments.ts`, `src/pages/admin/PaymentHistory.tsx`, `supabase/migrations/20251118_unified_payment_history.sql`, `20260219_unified_payment_history_student_studio_names.sql`
- **Accounting reports:** `supabase/migrations/20250125_accounting_reports.sql`, `src/pages/admin/AccountingReports.tsx`, `src/hooks/useAccountingReports.ts`
- **Invoice PDF:** `supabase/functions/generate-student-invoice-pdf/index.ts`, `src/utils/invoicePdfGenerator.ts`
- **Invoice numbers:** `supabase/migrations/20250125_add_invoice_numbers.sql`
- **Manual payments:** `supabase/migrations/20250318_manual_payments.sql`
- **Refunds:** `supabase/migrations/20250322_refunds_table.sql`, `20250128_update_revenue_summary_subtract_refunds.sql`
- **Expenses:** `supabase/migrations/20251210_utility_payments_system.sql`, `src/pages/admin/Expenses.tsx`, `src/hooks/useUtilityPayments.ts`
- **Credentials:** `supabase/migrations/20251123_add_company_name_and_credentials.sql`, `supabase/functions/_shared/get-credential.ts`
- **Branding:** `branding_settings` (company_name, vat_number, company_number, etc.)

If you want to proceed, the next concrete step is to add the Xero OAuth flow in admin Settings and a minimal “sync one payment to Xero” edge function, then expand from there.
