# Custom contract sheet: inline plans, weeks-driven dates, auto installments

## Your idea (in short)

1. **Contract:** Enter **number of weeks** (e.g. 21) and **start date** → system **auto-calculates end date**.
2. **Installments:** Option to **create an instalment plan right in the sheet** (not only pick existing ones). Choose **number of instalments** (e.g. 5) → system **auto-generates** instalment dates (e.g. first before move-in, rest spread), with **editable** dates after generation.
3. Do it all in one place so staff don’t hop between Contract and Payment Plans.

You also want to know: how achievable is this, where you might be pushing beyond what’s reasonable, and how it fits the current system.

---

## How it fits your system

### Contract: weeks + start → end date

- **Schema:** `contracts` has `weeks`, `contract_start`, `contract_end`. You already derive `weeks` from dates in the UI; the inverse is trivial: given `weeks` + `contract_start`, set `contract_end = contract_start + (weeks × 7)` (or one day before for inclusive semantics).
- **Achievable:** Yes, straightforward. No schema change.
- **UX:** One field “Contract length (weeks)” (e.g. 21) and “Start date”. Show “End date” as **read-only** (auto) or **editable** so staff can nudge if needed (e.g. term end). Single source of truth can stay “weeks + start” with end derived, or “start + end” with weeks derived; pick one and show the other as computed/editable.

### Installments: where they live

- **Plans:** `payment_plans` belongs to an **academic year** (`academic_year_id`). Plans are shared across contracts in that year.
- **Installment rules:** `payment_plan_installments` stores per-instalment: `sequence`, `label`, `due_date_offset_days` or `due_date`, `amount_type` (percentage/fixed), `amount_value`. Deposit is **separate** (contract or plan `deposit_amount`); these rows are **rent** instalments.
- **Contract ↔ plan:** Contracts link to plans via `contract_payment_plans`. So “create an instalment plan for this custom contract” in the sheet means: **create a new payment plan** (same academic year as the contract) **with generated installments**, then **link that plan to the contract**. No new tables; you’re using existing `payment_plans` + `payment_plan_installments` + `contract_payment_plans`.

So: **achievable and aligned.** The sheet would create plan + installments (and optionally link to contract) in one flow; the rest of the app (student payments, reports, backfill) already works off plans and installments.

---

## What’s reasonable vs a bit much

### Reasonable

- **Weeks + start → auto end date:** Simple, clear, matches “21-week contract starting X”.
- **“Create instalment plan here”** with:
  - **Number of instalments** (e.g. 5).
  - **Auto-generate** due dates, e.g.:
    - First instalment: **X days before contract start** (e.g. 14).
    - Remaining: **spread from contract start** (e.g. every 4 weeks: 0, 28, 56, 84 days) or “evenly over contract length”.
  - **Amounts:** Auto as **percentage** of rent (e.g. 100% / N, last one absorbs rounding); system already handles that.
  - **Editable after generation:** Show a small table (label, due date or offset, amount %) and let staff tweak before save. Then insert into `payment_plan_installments`.
- **Deposit:** Stay as today (contract deposit; not part of the “instalment” count). So “first before move-in” is the **first rent instalment**, not the deposit.

### Where to draw the line (so the sheet doesn’t become “full plan builder”)

- **Keep the sheet a “quick generator”:** Fixed, simple rules (e.g. “first due N days before start”, “rest every M weeks” or “evenly spread”). Don’t replicate the full Payment Plans admin (every edge case, multiple amount types, fixed dates vs offsets in one go). Advanced tweaks stay in **Admin → Payment Plans**.
- **One new plan per “Create plan here”:** Either “use existing plan(s)” or “create **one** new plan with generated installments”. If they need two different plans for the same contract, they can do one in the sheet and add the other from Payment Plans, or create both in Payment Plans and attach in the sheet. That keeps the sheet UI manageable.

So: **inline creation of one auto-generated plan, with editable dates/amounts, is reasonable; full parity with the Payment Plans page inside the sheet is not.**

---

## Recommended workflow (aligned with your system)

### Step 1 – Contract & duration

- **Contract length (weeks):** number input (e.g. 21).
- **Start date:** date picker.
- **End date:** **read-only**, computed as start + (weeks × 7) days, **or** editable with a note “Usually auto from weeks”.
- Optional: show “Duration: 21 weeks” if you derive weeks from start/end instead.

### Step 2 – Pricing

- Weekly price (£), Deposit (£). Unchanged.

### Step 3 – Payment plan(s)

- **Option A – Use existing plan(s):** Current behaviour: pick from plans for that academic year, set order. No change.
- **Option B – Create a new plan here:**
  - **Plan name:** e.g. “21-week 5 inst” (default from contract name + “5 inst” or similar).
  - **Number of instalments:** e.g. 5.
  - **First instalment due:** “X days **before** contract start” (e.g. 14). Ensures “before move-in” (deposit is separate).
  - **Remaining instalments:** e.g. “Every N weeks from contract start” (e.g. 4) or “Spread evenly from start to end”.
  - **Generate:** Build a list of installments (label, `due_date_offset_days` or `due_date`, amount %). Last instalment can be “remainder” so percentages don’t have to sum to 100.
  - **Editable table:** Show rows (label, due offset or date, amount %). Staff can change offset/date or amount, then save.
  - On save: **create** `payment_plans` row (academic_year_id from contract, name, deposit_amount from contract if you want), **create** `payment_plan_installments` rows, **create** `contract_payment_plans` link to the new plan. Then create contract as today (with weeks from Step 1, end date, prices). Order of operations: contract first, then plan, then installments, then link; or plan + installments first, then contract, then link. Both work.

### After save

- Contract exists, plan exists, installments exist, contract ↔ plan linked. Existing logic (student choice of plan, payment summary, backfill `contract_payment_schedule`, reports) keeps working. No change needed there.

---

## Achievability summary

| Piece | Achievable? | Notes |
|-------|-------------|--------|
| Weeks + start → auto end date | Yes | Simple calc; optional editable end date. |
| “Create instalment plan” in sheet | Yes | Create `payment_plans` + `payment_plan_installments` + `contract_payment_plans`; re-use existing create/link logic. |
| Auto-generate N instalments (first before move-in, rest spread) | Yes | Formula: first = -14 (or configurable) days; rest = 0, 28, 56, … or spread evenly; store as `due_date_offset_days` (and optionally convert to `due_date` for display/edit). |
| Editable after generation | Yes | Table of rows; on save write to `payment_plan_installments`. |
| Deposit separate from instalments | Yes | Already how the system works; deposit on contract (or plan); instalments are rent only. |

---

## Where you’re not being unreasonable

- Wanting **one place** (sheet) to define a 21-week contract and its instalment plan is reasonable.
- **Weeks-driven + start** is simpler for staff than “pick two dates and hope the weeks look right.”
- **Auto-generated instalment dates** with a simple rule (first before move-in, rest spread) plus **editable** is a good balance between speed and control.
- Doing this **without** turning the sheet into a full clone of Payment Plans is the right boundary.

---

## Where to be a bit careful

- **Complex rules:** If you later want “first 2 before move-in, then 3 at term dates,” that’s still doable with offsets or fixed dates in the generated list and edit step. Don’t promise every possible pattern in the first version; start with “first due X days before start, rest every N weeks” (or “spread evenly”).
- **Plan reuse:** The new plan lives in the same academic year. Other contracts can pick it. If you want “this plan only for this contract,” you can still do that by only linking it to this contract; the schema allows reuse but doesn’t require it.

---

## Suggested implementation order

1. **Contract:** Add “Contract length (weeks)” and derive end date from start + weeks; show end date (read-only or editable). Keep sending `weeks` and `contract_end` to the API as today.
2. **Sheet steps + progress bar:** As in the previous alignment (e.g. 3 steps, progress bar at top, no scroll).
3. **Step 3 – Plan source:** Radio or toggle: “Use existing plan(s)” (current) vs “Create a new plan here.”
4. **“Create a new plan here” block:**
   - Plan name (default from contract name + “ N inst”).
   - Number of instalments.
   - First instalment: “Due … days before contract start” (number input, e.g. 14).
   - Remaining: “Every … weeks from contract start” (number input) or “Spread evenly from start to end.”
   - Button “Generate instalments” → build list (label, due_date_offset_days, amount_type percentage, amount_value).
   - Editable table: allow changing offset (or show computed date) and amount %; last row can be “Remainder.”
   - On submit: create contract (if not already), create plan, create installments, link plan to contract. Invalidate admin contracts and payment plans so lists stay in sync.

This keeps everything inline with your use case, uses the existing schema and behaviour, and keeps the sheet from becoming unreasonable in scope.
