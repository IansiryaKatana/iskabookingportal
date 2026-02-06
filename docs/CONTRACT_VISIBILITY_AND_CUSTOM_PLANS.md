# Contract visibility and custom payment plans – alignment

## Your mental model (aligned)

1. **Some students are on finance / late** → they get **custom payment plans** (e.g. 21 weeks, special instalments).
2. When **staff creates an application**, they should be able to use a **custom contract** that:
   - Does **not** show on the **frontend** (room grade detail page).
   - Is only used for those “on request” / finance / late clients.
3. You can already:
   - Create or add **contracts** to academic years.
   - Add **payment plans** anytime and link them to contracts via **contract_payment_plans**.
4. What’s **missing**:
   - A way to control **which contracts appear on the room grade detail page** (student-facing).
   - A clear split: **some contracts are for students to request** (visible on portal) and **some are staff-only** (custom/finance, not on portal but staff can pick them when creating an application).

---

## Current behaviour (codebase)

| Area | Behaviour |
|------|-----------|
| **Room grade detail page** (StudioGrade.tsx, useStudioGrade) | Loads **all active contracts** for that studio grade (`is_active = true`). No “visibility” filter. So every active contract currently shows to students. |
| **Staff create application** (Applications.tsx) | Uses **all contracts** from `useAdminContracts()` (no visibility filter). Staff can already pick any contract when creating an application. |
| **Contracts table** | Has `academic_year_id`, `studio_grade_id`, `slug`, `name`, `is_active`, etc. **No column** for “show on portal” or “staff only”. |
| **Payment plans** | Stored in `payment_plans` (per academic year), linked to contracts via `contract_payment_plans`. You can add contracts and plans independently. |

So today: **all active contracts** are both (a) shown on the room grade page and (b) available to staff. There is no way to have a contract that is “staff-only” or “custom for finance”.

---

## Desired behaviour (aligned)

- **Visible on room grade detail**  
  Contract appears on the studio grade page; students can click and start an application (current “normal” contracts).
- **Not visible on room grade / staff-only**  
  Contract does **not** appear on the frontend; only staff can select it when creating an application (e.g. “21 weeks custom”, “finance plan”, “late client”).
- **Create custom contract from Create application**  
  When staff are in the “Create application” flow, they can create a custom contract (with all needed fields and payment plans) **without leaving** that flow—via a **Sheet** (or Drawer on mobile) that contains the full contract form. The new contract is then pre-selected so they can finish creating the application.
- **Create application flow = Sheet (not dialog)**  
  The whole “Create application” flow is a **Sheet** on desktop and **Drawer** on mobile (not a dialog). That gives more room for student + contract (+ optional “Create custom contract”) + studio + booking source, and matches your preference for sheets/drawers for form-heavy flows.

---

## Proposed implementation

### 1. Database: one column on `contracts`

Add a column to control **where** the contract is shown:

- **Option A (simple boolean)**  
  - `visible_on_portal` (boolean, default `true`).  
  - `true` = show on room grade page (and students can open contract detail and apply).  
  - `false` = **do not** show on room grade page; **do** show in admin and in “Create application” contract dropdown (staff-only).

- **Option B (enum, if you want more cases later)**  
  - `visibility` or `contract_visibility`: e.g. `'public' | 'staff_only'`.  
  - `public` = same as `visible_on_portal = true`.  
  - `staff_only` = same as `visible_on_portal = false`.

Recommendation: **Option A** (`visible_on_portal`) is enough for “visible on room grade” vs “staff-only / custom” and keeps the model simple.

### 2. Frontend (room grade detail)

- When loading contracts for the **room grade detail page** (StudioGrade.tsx and useStudioGrade):
  - Filter: `is_active = true` **and** `visible_on_portal = true`.
- So only “portal-visible” contracts appear on the studio grade; staff-only/custom contracts never show there.

### 3. Admin

- **Contracts list / create / edit**  
  - Show **all** contracts (no filter by `visible_on_portal`).  
  - When creating or editing a contract, add a checkbox or toggle: **“Visible on room grade (student-facing)”** that sets `visible_on_portal` (e.g. unchecked for “Custom / finance / staff only”).
- **Create application** (Applications.tsx)  
  - Implemented as a **Sheet** (desktop) / **Drawer** (mobile). Same list as today: all contracts from `useAdminContracts()`. Staff can select **any** contract, including “staff-only” / custom ones, or create a custom contract from within the sheet.

### 4. Contract detail page (student)

- If a student somehow lands on a contract detail page for a staff-only contract (e.g. old link), you can either:
  - Hide the “Enquire” / apply action and show “Contact us” or “Not available for direct booking”, or
  - Return 404 for `visible_on_portal = false` when the viewer is not staff.

That keeps behaviour consistent with “this contract is not requestable by students on the portal”.

---

## Flow summary

| Contract type | Visible on room grade? | Staff can select when creating application? |
|---------------|------------------------|---------------------------------------------|
| Normal (e.g. 45 weeks, 51 weeks) | Yes | Yes |
| Custom / finance / late (e.g. 21 weeks) | No | Yes |

- **Creating a “custom” contract (e.g. 21 weeks):**  
  - Create contract with **both** weekly price and deposit (both required), plus academic year, studio grade, dates, weeks, name, slug.  
  - Attach payment plans via contract_payment_plans.  
  - Set **“Visible on room grade” = false** (or `visibility = staff_only`).  
  - It won’t show on the frontend but will appear in the admin contract list and in the “Create application” contract dropdown.

No change to how payment plans or contract_payment_schedule work; only **where** each contract is shown (portal vs staff-only) is controlled.

---

## Create application = Sheet (and Drawer on mobile)

The **Create application** flow is implemented as a **Sheet** on desktop and **Drawer** on mobile (not a dialog). That gives:

- More room for the form (student, contract, studio, booking source).
- Consistency with your preference for sheets/drawers for form-heavy flows and “forms enter from bottom” on mobile.

Inside the Create application Sheet:

- **Student**: existing or new (same as today).
- **Contract**: select from dropdown **or** “Create custom contract” (opens a **sub-sheet / sub-drawer** with the full contract form).
- **Studio** (optional), **Booking source**.
- Submit creates the application (and if they just created a custom contract in the sub-sheet, that contract is used / pre-selected).

When staff click “Create custom contract”, a **second** Sheet (or Drawer on mobile) opens on top with the full contract form. On submit: create contract with `visible_on_portal = false`, close the sub-sheet, refresh the contract list, and pre-select the new contract in the parent Create application Sheet. Staff then complete studio/booking source and submit.

### Will this break my system?

**No.** Changing from Dialog to Sheet (and Drawer on mobile) is a **container/layout change only**:

- Same **state**: student (existing or new), contract id, studio id, booking source.
- Same **mutations**: create student (if new), create application with `contract_id`, `studio_grade_id`, etc.
- Same **validation** and **navigation** (e.g. redirect to application journey after create).

Only the UI component wrapping the form changes (Dialog → Sheet on desktop, Drawer on mobile). No change to API calls, RLS, or database behaviour. Existing behaviour (create application, open journey) stays the same.

### What the “Create custom contract” Sheet must include (everything needed)

So that staff don’t have to go to the Contracts page, the Sheet should include **all** fields required to create a valid contract and attach payment plans:

| Field | Required | Notes |
|-------|----------|--------|
| Academic year | Yes | Select from list (same as Contracts page). |
| Studio grade | Yes | Select from list. |
| Contract name | Yes | e.g. “Gold 21 weeks (custom)”. |
| Start date | Yes | contract_start. |
| End date | Yes | contract_end (weeks derived for display/DB). |
| **Weekly price** | **Yes** | weekly_price_override. **Both** weekly price **and** deposit are required (not either/or). |
| **Deposit** | **Yes** | deposit_override. **Both** deposit **and** weekly price are required (not either/or). |
| Payment plans | Yes (at least one recommended) | Checkboxes + order for plans in the selected academic year (from `contract_payment_plans`). Same data as Contracts page. |
| Display order | Optional | Default e.g. 999 so custom contracts sort last. |
| Summary | Optional | For internal use. |
| Visible on room grade | Fixed | **Off** (not editable in this flow). Show short note. |

**Contract pricing:** Every contract needs **both** a **weekly price** and a **deposit**. They are not optional and not either/or—both are required for the contract (and for the custom contract form) to be valid.

After create: **invalidate** admin contracts query so the dropdown in the Create application Sheet refreshes and shows the new contract; set `createContractId` to the new contract’s id so it’s pre-selected.

---

## Next steps (when you want to implement)

### Phase 1: Visibility and staff-only contracts

1. Add migration: `ALTER TABLE public.contracts ADD COLUMN visible_on_portal boolean NOT NULL DEFAULT true;`
2. Update **room grade** contract queries (StudioGrade.tsx loader and useStudioGrade) to filter `visible_on_portal = true`.
3. Update **Admin Contracts** UI: add “Visible on room grade (student-facing)” toggle; include it in create/update payload.
4. (Optional) Contract detail page: restrict or hide apply for staff-only contracts for non-staff users.

### Phase 2: Create application as Sheet + Create custom contract sub-sheet

5. **Create application** (Applications.tsx): replace the current **Dialog** with a **Sheet** (desktop) / **Drawer** (mobile). Same content: student, contract dropdown, studio, booking source. Add a “Create custom contract” action next to the Contract dropdown.
6. Implement **Create custom contract** as a **sub-sheet** (and sub-drawer on mobile):
   - Reuse or mirror the contract form from Contracts.tsx: academic year, studio grade, name, dates, **both** weekly price **and** deposit (required), payment plans (with order).
   - Fix `visible_on_portal = false` and show a short note that the contract is staff-only.
   - On submit: call `useCreateContract` (or same mutation logic), invalidate `["admin-contracts"]`, pass new contract id back to the parent; parent sets `createContractId` and closes the sub-sheet so the Create application Sheet shows the new contract selected.
7. Ensure **useCreateContract** (and API) accept `visible_on_portal` so the custom-contract sheet can create staff-only contracts.

Implementation order: Phase 1 first (visibility column + room grade filter + Contracts page toggle), then Phase 2 (Create application as Sheet/Drawer + custom contract sub-sheet).
