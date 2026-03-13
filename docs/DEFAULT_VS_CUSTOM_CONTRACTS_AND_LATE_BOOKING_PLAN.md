# Default vs custom contracts & late booking – analysis and concrete plan

This document aligns your ideas (past-due defaults, custom duration card, dynamic behaviour) with the current codebase and database, and recommends a single concrete plan that bolsters the system without breaking it.

---

## 1. Current state (codebase & database)

### 1.1 Academic years and default contracts

| Concept | Where it lives | Notes |
|--------|----------------|--------|
| **Academic year** | `academic_years` | `name`, `start_date`, `end_date`, `is_active`. E.g. 2025/2026 with start Sept, end July/Aug. |
| **Default contracts (45 & 51 weeks)** | `contracts` | One row per (academic_year, studio_grade, duration). Fixed `contract_start` (e.g. 5 Sept), `contract_end` (45w → ~17 July, 51w → ~28 Aug). Identified by `weeks` (45 or 51) and typically slug like `*-45-week-*` / `*-51-week-*`. No dedicated `contract_type` column. |
| **Custom contracts** | `contracts` | Same table; `visible_on_portal = false`. Created by staff (CreateCustomContractSheet, or from ApplicationDetail). Do **not** appear on room grade detail (filter: `visible_on_portal = true`). |

### 1.2 Room grade detail page (student-facing)

- **Route:** `/studios/:year?/:slug` (e.g. `/studios/2025-2026/gold`).
- **Data:** `StudioGrade.tsx` calls `loadStudioGrade(slug, year)` which:
  - Loads contracts with `is_active = true`, `visible_on_portal = true`, and optionally `academic_year_id` when `year` is in the URL.
- **UI:** `ContractShowcase` lists each contract with an "Enquire" button that goes to `/contracts/:slug`. There is **no** date-based gating: all visible contracts show an active Enquire button.
- **Contract detail:** `ContractDetail.tsx` shows "Start Booking Journey" for portal-visible contracts; staff-only contracts show "Not available for direct booking" for non-staff users. There is **no** "past due" or "booking window closed" logic.

### 1.3 Student application flow

- Application **always** has a `contract_id` (FK not null). There is no "application without a contract" or "request only" row.
- Student flow: choose contract → Enquire → create `student_applications` row (draft) → studio selection → wizard (profile, docs, payment, signing) → staff approve.
- Staff can create an application from admin (Applications.tsx) by choosing **any** contract (including custom / `visible_on_portal = false`) and optionally a studio.

### 1.4 Relevant docs already in repo

- **CONTRACT_VISIBILITY_AND_CUSTOM_PLANS.md** – `visible_on_portal` is implemented; custom contracts are staff-only and do not show on room grade.
- **STAFF_CREATE_APPLICATION_ANALYSIS.md** – Staff create application flow (contract + student + optional studio).

---

## 2. Your ideas (summary)

1. **Default 45/51 past due**  
   After the contract’s start date (e.g. 5 Sept) has passed, students should **not** be able to book that fixed 45/51 week contract. Either show the contract with Enquire **inactive** and a "Past due" (or similar) message, or hide it and show something else.

2. **Custom duration card on room grade**  
   A **new card** for "Custom duration" (or "Flexible stay") so students can request a stay for any period between "now" and the academic year end (e.g. 10 Sept → 28 Aug). Same workflow as staff creating an application: student submits, staff approve and (in practice) create/assign the custom contract.

3. **Dynamic default contracts (alternative)**  
   Instead of keeping 45/51 visible but disabled, make them "linear and dynamic": when their fixed start dates pass, **hide** the fixed 45/51 contracts and show **new dynamic** options (e.g. "any number of weeks/days from booking date to 28 August"). So the offering adapts over the year.

---

## 3. Alignment and recommendation

All three ideas can be combined into one coherent behaviour:

- Treat **default 45/51** as fixed-date products: once their start date has passed, do **not** allow new bookings (Enquire inactive + "Past due").
- Add a single **Custom duration** path for the rest of the academic year (student requests start/end, staff create contract and approve as today).
- Optionally **hide** past-due default contracts on the room grade page and show only the Custom duration card when we’re past the default start (dynamic feel without generating many contract rows).

Below is a concrete plan that implements this without breaking existing flows.

---

## 4. Concrete plan

### 4.1 Define "default" vs "custom" for behaviour

- **Default contract (for UI logic):**  
  A contract that represents the standard 45- or 51-week product for that academic year and studio grade. In the DB you don’t need a new column if you’re happy to infer it: e.g. `visible_on_portal = true` **and** `weeks IN (45, 51)` **and** slug pattern or naming convention. Optionally add a boolean `is_default_contract` (default false) and set it for existing 45/51 portal-visible contracts so behaviour is explicit and stable.
- **Custom contract:**  
  Any contract with `visible_on_portal = false` (staff-only), or any contract used for "Custom duration" (see below). No change to current definition.

### 4.2 Past-due behaviour for default 45/51 contracts

**Room grade page (ContractShowcase):**

- When rendering each contract, compute whether **today > contract_start** (use contract’s `contract_start` and current date in the correct timezone).
- If **default** (45 or 51 weeks, portal-visible) and **past due**:
  - **Option A (recommended):** Still show the card but with Enquire **disabled** and short text: e.g. "Past due – this fixed start date has passed. Use Custom duration below for flexible dates."
  - **Option B:** Hide the card on the room grade page when past due (so only Custom duration remains).

**Contract detail page (`ContractDetail.tsx`):**

- If the contract is default (45/51) and past due:
  - Disable "Start Booking Journey" and show an alert: e.g. "Booking for this fixed contract has closed. For stays starting after [contract_start], please use the Custom duration option on the studio page."
  - Optionally allow deep links to still show the page (for transparency) but with no active CTA.

**Implementation details:**

- Use `contract.contract_start` and `contract.contract_end` (already on contract).
- "Today" = start of day in a consistent timezone (e.g. Europe/London). Compare as dates (no time).
- Helper: e.g. `isContractPastDue(contract)` → true when `today >= contract_start` for default contracts; use it in both StudioGrade (show inactive + message) and ContractDetail (disable button + message).

### 4.3 Custom duration card and flow (student-initiated)

**Goal:** One card on the room grade page that lets students request a stay for a custom period (e.g. from booking date to academic year end), with the same approval flow as a normal application (staff approve and, in practice, assign/create the custom contract).

**Constraint:** Applications must have a `contract_id`. So we don’t create "contract-less" applications.

**Recommended approach: placeholder "Custom duration" contract**

1. **Per (academic_year, studio_grade):** Create one **placeholder** contract, e.g. name "Custom duration (flexible dates)", `visible_on_portal = true`, with generic dates (e.g. academic year `start_date` → `end_date`), `weeks` = 0 or a sentinel (e.g. 1) and a clear slug like `{grade-slug}-custom-duration-{year-slug}`. Attach one payment plan (e.g. "To be confirmed") so the system is valid. This contract is only used to start an application; staff will replace it with the real custom contract.
2. **Room grade page:** In addition to (or instead of, when past due) the 45/51 cards, show **one** "Custom duration" card:
   - Same layout as other contracts but label like "Custom duration" / "Flexible stay".
   - Copy: e.g. "Choose your own start and end dates within the academic year. We’ll confirm availability and pricing."
   - Enquire → same flow as today: create application with this placeholder contract, then redirect to application journey.
3. **Application journey:** In the wizard (e.g. early step or a small extra step when contract is the placeholder), ask for **preferred start date** and **preferred end date** (within academic year). Store them on the application:
   - Add to `student_applications`: e.g. `requested_contract_start date`, `requested_contract_end date` (nullable). Only used when application was started from the Custom duration contract.
4. **Staff:** In ApplicationDetail, when the application uses the placeholder contract and has requested dates, staff see them and use **existing** "Create custom contract" (or "Create custom contract from application") to create the real contract with those dates, then assign it to the application (and payment plan). After that, the rest of the flow (deposit, signing, approval) is unchanged.

**Alternative (no placeholder contract):** Introduce a `custom_duration_requests` table (student_id, academic_year_id, studio_grade_id, requested_start, requested_end, status). Student submits the form; staff see requests in admin and "Convert to application" by creating a custom contract + application. This is cleaner conceptually but requires new table, new admin UI, and a different student path. The placeholder-contract approach reuses the full application journey and only adds two columns and one contract per grade per year.

**Recommendation:** Use the **placeholder contract** approach for minimal change and one consistent "application" path for both fixed and custom duration.

### 4.4 Dynamic behaviour (optional)

- **Option A:** Keep 45/51 cards visible but past-due as above (inactive + message). Always show the Custom duration card.
- **Option B (dynamic feel):** When **all** default 45/51 for that grade/year are past due, **hide** their cards on the room grade page and show **only** the Custom duration card (and any other non-default portal-visible contracts). So "default contracts disappear and new dynamic one appears" is achieved by hiding past-due defaults and showing the single Custom duration option.

Recommendation: **Option B** for a cleaner UX: after the fixed start dates, the room grade page only offers "Custom duration" (and no confusing disabled 45/51 cards unless you prefer to keep them for clarity).

### 4.5 Academic year boundaries

- Use **academic year** `end_date` (and optionally `start_date`) from `academic_years` for:
  - Valid range for "Custom duration" requested start/end (e.g. requested_start ≥ year.start_date, requested_end ≤ year.end_date, and requested_start &lt; requested_end).
  - Copy on the Custom duration card: e.g. "From your chosen start date up to [year.end_date]."
- 45-week end (e.g. 17 July) vs 51-week end (28 Aug): the **latest** end for the year is the 51-week end (or the academic year `end_date`). Custom duration should allow any end up to that date.

---

## 5. Implementation checklist (high level)

1. **Past-due logic**
   - Add helper `isContractPastDue(contract)` (and optionally `isDefaultContract(contract)` if not inferring from weeks/slug).
   - **ContractShowcase:** For each contract, if default and past due: either hide card (Option B) or show with disabled Enquire + "Past due" message (Option A).
   - **ContractDetail:** If default and past due: disable "Start Booking Journey", show short explanation and point to Custom duration.

2. **Custom duration (placeholder contract)**
   - DB: Add nullable `requested_contract_start`, `requested_contract_end` to `student_applications`.
   - For each (academic_year, studio_grade) where you want Custom duration: create one placeholder contract (name, slug, generic dates, one payment plan, `visible_on_portal = true`). Optionally add `is_custom_duration_placeholder` boolean on `contracts` to identify it in code.
   - Room grade: Include this contract in the list (from existing query); optionally show it in a separate section "Flexible stay" or always list it with others. When all defaults are past due, you can show only this one (Option B).
   - Application wizard: If `application.contract` is the placeholder, show a small step or fields for "Preferred start date" and "Preferred end date"; validate against academic year; save to `requested_contract_start` / `requested_contract_end`.
   - ApplicationDetail (admin): When contract is placeholder and requested dates exist, show them prominently and keep existing "Create custom contract" flow so staff create the real contract with those dates and assign to application.

3. **Dynamic display (optional)**
   - On room grade, if you chose Option B: when every portal-visible default (45/51) for that grade/year is past due, filter out those contracts for display (or don’t render their cards), so only Custom duration (and any other non-default portal contracts) remain.

4. **No breaking changes**
   - Existing applications and contracts unchanged.
   - Staff create application and Create custom contract flows unchanged; only the student-facing room grade and contract detail get past-due and Custom duration behaviour.
   - Rebooking and other features that depend on `contract_id` continue to work.

---

## 6. Summary table

| Scenario | What students see (room grade) | What happens on Enquire / Apply |
|----------|--------------------------------|----------------------------------|
| Before default start (e.g. before 5 Sept) | 45w and 51w cards active; Custom duration card available | Can book 45/51 or start Custom duration application. |
| After default start (e.g. March 2026) | Option A: 45/51 cards visible but "Past due", Enquire disabled; Custom duration card active. Option B: Only Custom duration card. | Only Custom duration can be started (placeholder contract). |
| Contract detail (45/51 past due) | Page still visible; CTA disabled, message: use Custom duration. | No new booking for that contract. |
| Custom duration application | Same 6-step journey; preferred start/end captured; staff create real custom contract and assign. | Same approval flow as any other application. |

This aligns your thoughts into one plan: **default contracts become linear in time** (past due → no new bookings, optionally hidden), **Custom duration is the single dynamic option** (one card, same application + approval flow, staff assign real custom contract), and **no need to generate many dynamic contract rows**—just one placeholder per grade per year and two optional columns on applications.

If you want to proceed, the next step is to implement §4.2 (past-due) and §4.3 (placeholder contract + requested dates + wizard step + admin display) in that order, then add §4.4 (dynamic hide) if you choose Option B.
