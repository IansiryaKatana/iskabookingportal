# Contract Extensions for Custom Contracts – Analysis & Recommendations

## 1. Use case

**Scenario:** A student has a **custom contract** (e.g. 20 weeks, 3 installments). They decide to **extend** their stay by another period (e.g. 12 weeks, 4 installments).

**Requirements:**
- Support “extend contract” as a first-class workflow in the system.
- Preserve audit trail: original period vs extension period.
- Payment schedules: original installments remain; extension adds new weeks and new installments.
- Reports and payment logic must remain correct and not break.

---

## 2. What has been done so far (regarding extensions)

**Nothing specific to contract extensions has been implemented.**

### 2.1 What exists today

| Feature | Purpose | Relevant to extensions? |
|--------|---------|--------------------------|
| **Custom contracts** | Per-application contract with custom weeks/dates and/or custom installment schedule. Created via bulk import or “Customise schedule” on Application Detail (before any installment is paid). | Same student/room; custom = one contract per application. No “add more weeks” flow. |
| **`contracts.source_contract_id`** | Marks a contract as a clone of a template contract. | Not used for “extension of” relationship. |
| **`contracts.student_application_id`** | Ties a contract to a single application (custom = staff-only, not on portal). | One application → one contract. |
| **`contracts.extra_days`** | 0–6 extra days on top of `weeks` for effective-weeks calculation. | For small day adjustments, not for adding 12 weeks. |
| **Rebooking (`previous_application_id`)** | Links a **new** application (new academic year / new contract) to a previous one. Same student, different year/contract. | Different concept: new contract, new year. Extension = same tenancy, more weeks. |
| **`useCreateCustomContractFromApplication`** | Replaces application’s contract/plan with a new custom contract/plan (custom installments). Only allowed when **no** installment payments exist. | Not suitable for “add 12 weeks + 4 installments” after payments have started. |

### 2.2 Current data model (relevant parts)

- **`student_applications`**: `contract_id`, `selected_payment_plan_id`, `total_contract_value`, `previous_application_id` (rebooking only).
- **`contracts`**: `weeks`, `extra_days`, `contract_start`, `contract_end`, `source_contract_id`, `student_application_id`.
- **One application → one contract → one payment plan** (and one `contract_payment_schedule` / plan installments). All payment and reporting logic assumes this.

There is **no** column or table for:
- “This application is an extension of application X.”
- “This contract is an extension segment of contract Y.”
- Multiple “segments” (original + extension) under one booking.

So: **no extension-specific schema or workflows exist yet.**

---

## 3. Workflows and codebase impact

### 3.1 Payment and reporting

- **`get_payment_summary(p_application_id)`** – One application → one contract → one `total_due` / `remaining_balance`. Used everywhere (admin, portal, reports).
- **`get_installment_breakdown(p_application_id)`** – One application → one contract/plan → one list of installments (with waterfall allocation of unlinked payments). Used for payment schedule and manual payment dialog.
- **`calculate_contract_value(contract_id)`** – Used by trigger to set `student_applications.total_contract_value`.
- **Reports** (e.g. `useReports.ts`, sales views, occupancy) – Typically one row per application; contract name, dates, value, status.
- **Manual payment / Stripe** – Payments are linked to `application_id` and optionally `instalment_id` (contract_payment_schedule). One application = one schedule in practice.

Any extension design must keep “one application = one payment story” **or** explicitly define how multiple applications (e.g. original + extension) are aggregated and displayed.

### 3.2 Custom contract creation today

- **Bulk import:** `bulk_import_applications_custom_contracts` – One row → one custom contract + one custom payment plan + one application. No extension.
- **Application Detail:** “Customise schedule” (via `useCreateCustomContractFromApplication`) – New contract + plan with custom installment amounts; application is updated to point to them. Only allowed when there are **no** installment payments. Not used to add more weeks.

### 3.3 Rebooking vs extension

- **Rebooking:** New application, new contract (e.g. next academic year), new room/year. `previous_application_id` links to prior year’s application. No change to the original contract.
- **Extension:** Same tenancy, same room, same student; add more weeks and more installments. Either we change the existing contract/application or we add a second “extension” application linked to the first.

---

## 4. Options for implementing extensions

### Option A – In-place contract amendment (single contract, extend dates + schedule)

**Idea:** Keep one application, one contract. When staff “extends”:
- Update contract: `weeks` (e.g. 20 → 32), `contract_end`, `extra_days` if needed.
- Replace or append to payment plan installments (e.g. 3 → 7 or new “extension” installments).
- Backfill `contract_payment_schedule` for the new installments.

**Pros:**  
- No new application; one record for the whole stay.  
- Existing payment/reporting logic stays “one application = one contract.”

**Cons:**  
- Loses clear “original 20w/3 inst” vs “extension 12w/4 inst” in data (only in history/audit if you log changes).  
- If original installments are already paid, you must not overwrite them; only **append** new rows.  
- Contract value and schedule logic must handle “partially paid, then extended” (e.g. new installments only for the new 12 weeks).  
- Risk of breaking `get_installment_breakdown` / `get_payment_summary` if they assume a single contiguous schedule.  
- DocuSign/signed PDF was for the original period; extension may need a new agreement/supplement.

**Verdict:** Possible but brittle; mixes two phases in one contract and blurs audit trail. Not recommended as the primary design.

---

### Option B – Extension as a linked second application (recommended direction)

**Idea:** Introduce an **extension application** that is explicitly linked to the original:
- New column: `student_applications.extension_of_application_id` (nullable, FK to `student_applications.id`).
- Only one “level”: extension points to original (no chain). Optional: `application_type` or `is_extension` for clarity.
- Extension application has its **own** contract (e.g. 12 weeks, 4 installments) and payment plan, same student, same studio grade (and usually same studio).
- Original application unchanged. Reports can “group” original + extension(s) when needed (e.g. “Booking” = original + all extensions).

**Pros:**  
- Clear audit: original 20w/3 inst vs extension 12w/4 inst.  
- Each application has one contract, one schedule – **no change** to `get_payment_summary`, `get_installment_breakdown`, or manual payment logic.  
- Reuses existing custom-contract creation (e.g. create extension contract/plan like bulk import or a dedicated “Create extension contract” flow).  
- Same student can have multiple extensions over time (each extension is one application).  
- DocuSign: extension can have its own supplement/second agreement.  
- Reporting: occupancy/revenue can sum by “booking” (original + extensions) via `extension_of_application_id` and/or “root” application.

**Cons:**  
- Two (or more) applications per “booking” when extended.  
- UI and reports must show “Original” vs “Extension” and optionally aggregate (e.g. “Total for this booking”).  
- Need business rule: extension contract start date ≥ original contract end date (or allow overlap by policy).

**Verdict:** **Recommended.** Keeps current payment and reporting behaviour intact, adds minimal schema, and gives a clear, extensible model.

---

### Option C – Contract segments (one contract, multiple “periods”)

**Idea:** Add a **contract_segments** (or similar) table: each segment has weeks, start/end, installment count, and amounts. One contract has many segments; `get_installment_breakdown` and payment schedule merge segments into one logical schedule.

**Pros:**  
- Single contract, single application; “original” vs “extension” visible as segments.

**Cons:**  
- Large change: every place that reads “contract weeks”, “contract dates”, or “payment schedule” must understand segments (DB functions, frontend, reports).  
- High risk of regressions in payment summary, installment breakdown, manual payment, and reporting.  
- More complex than Option B for similar benefit.

**Verdict:** Not recommended unless you have a strong need for a single “contract” record with multiple segments and are willing to refactor widely.

---

## 5. Recommended approach: Option B (extension as linked application)

### 5.1 Schema (minimal)

- **`student_applications.extension_of_application_id`**  
  - `UUID NULL REFERENCES student_applications(id) ON DELETE SET NULL`.  
  - When set, this application is an “extension” of that application.  
  - Constraint: no cycles (extension_of_application_id → only “original” applications, i.e. where `extension_of_application_id IS NULL`).  
  - Index for “list extensions of application X” and “find root application.”

Optional but useful:
- **`student_applications.is_extension`**  
  - Boolean, derived or stored: `true` when `extension_of_application_id IS NOT NULL`.  
  - Simplifies filtering in admin and reports.

Do **not** reuse `previous_application_id`: that is for rebooking (different year/contract). Keep extension separate.

### 5.2 Workflow

1. **Eligibility**  
   - Only applications in a suitable status (e.g. `confirmed`, or as per policy) and with a **custom** contract (e.g. `contracts.student_application_id IS NOT NULL`) might be extendable.  
   - Business rule: e.g. “Extension allowed only if original contract end date is in the future or just passed” (configurable).

2. **Create extension**  
   - Staff chooses “Extend contract” on the **original** application.  
   - System creates a **new** application:  
     - `student_id`, `studio_grade_id`, `assigned_studio_id` copied from original (or selected).  
     - `contract_id` and `selected_payment_plan_id`: new custom contract (e.g. 12 weeks, 4 installments) with start date = original end date (or next day).  
     - `extension_of_application_id` = original application id.  
     - Status e.g. `draft` or `awaiting_deposit` (depending on whether you require new deposit for extension).  
   - New custom contract/plan can be created the same way as today (e.g. clone + adjust weeks/dates/installments, or a dedicated “extension contract” builder).

3. **Payments**  
   - Original application: unchanged; existing installments and payment history stay as-is.  
   - Extension application: its own deposit/installments; existing `get_payment_summary` and `get_installment_breakdown` work per application.  
   - No change to manual payment or Stripe flow.

4. **Reporting**  
   - Where you need “one booking”: define “root” application (where `extension_of_application_id IS NULL`) and include extensions via `extension_of_application_id`.  
   - Occupancy / revenue: can sum by root + extensions for the same studio/period.  
   - Existing per-application reports remain valid; add optional “Booking” view that groups original + extensions.

### 5.3 UI

- **Application Detail (original):**  
  - Show “Extensions” section: list applications where `extension_of_application_id = this application`.  
  - Button: “Create extension” → new application + new contract/plan, link set.

- **Application Detail (extension):**  
  - Show “Extension of” with link to original application (and optionally contract/period summary).  
  - Hide or simplify steps that are already satisfied from original (e.g. same studio, same student details).

- **Contracts / Applications list:**  
  - Filter or badge “Extensions” so staff can see extension applications.  
  - Optional “Booking” view: group by root application.

### 5.4 What stays unchanged

- `get_payment_summary(application_id)` – still one application, one contract.  
- `get_installment_breakdown(application_id)` – unchanged.  
- Manual payment dialog – still selects application → sees that application’s schedule.  
- Stripe – still per application.  
- Rebooking – still uses `previous_application_id` only.  
- Custom contract creation (bulk or from application) – unchanged; extension just uses it to create the “extension” contract.

---

## 6. Summary

| Question | Answer |
|----------|--------|
| **What has been done for extensions?** | **Nothing.** No schema, no workflows, no UI for “extend custom contract.” |
| **What exists that’s related?** | Custom contracts (one per application), rebooking (different year), customise schedule (before any installment). None of these implement “add more weeks + more installments” to an existing custom contract. |
| **Recommended approach?** | **Option B:** Extension = second application linked by `extension_of_application_id`, with its own contract (e.g. 12w, 4 installments) and plan. Keeps all existing payment and reporting logic intact; adds minimal schema; clear audit and room for multiple extensions. |
| **What to avoid?** | Reusing `previous_application_id` for extensions (that’s rebooking). Avoid in-place contract amendment (Option A) as the main design—mixes two phases and risks breaking payment/reporting. Avoid contract segments (Option C) unless you are ready for a large refactor. |

Next concrete steps would be: (1) add `extension_of_application_id` (and optional `is_extension`) in a migration, (2) add “Create extension” flow on Application Detail that creates new application + new custom contract/plan and sets the link, and (3) extend UI and reports to show and optionally aggregate extensions. If you want, the next step can be a short implementation checklist (DB migration, RLS, and UI touchpoints) based on this design.
