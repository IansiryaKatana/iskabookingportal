# Custom contract & instalment updates – what to maintain

After the custom contract and instalment (amounts vs percentages) changes, keep these in mind when updating the system.

## 1. Supabase types (optional)

- Run **`npx supabase gen types typescript`** (or your usual command) so generated types include:
  - `contracts.source_contract_id`, `contracts.student_application_id`
  - `payment_plans.source_payment_plan_id`, `payment_plans.student_application_id`
- The app works without regenerating (we use casts where needed); regeneration avoids `any` and improves autocomplete.

## 2. Queries that embed `contracts` from `student_applications`

- Any new **embed** of `contracts` when querying from `student_applications` must use the FK hint so PostgREST knows which relationship to use:
  - Use **`contract:contracts!contract_id(...)`** (not `contract:contracts(...)`).
- If you add new hooks or pages that select applications with contract, follow the same pattern.

## 3. Contract delete behaviour

- **Custom contracts** (where `contracts.student_application_id IS NOT NULL`) cannot be deleted via the admin delete button; the mutation throws a clear error.
- Deleting by ID (e.g. API or SQL) can still remove a custom contract and orphan the application. To prevent that at the DB layer you could add a trigger that blocks `DELETE` when `student_application_id IS NOT NULL`, or keep the guard only in the app (current behaviour).

## 4. Payment plan create/update

- **Create Custom Contract** (Step 3) and **Payment Plans** admin support both **percentage** and **fixed (£)** instalments.
- When all instalments are **fixed**, their sum should equal the contract total (Create Custom Contract validates this; Payment Plans shows “Sum of fixed amounts” for reference).
- Backend (`payment_plan_installments.amount_type`, `amount_value`) and `backfill_contract_payment_schedule_for_contract` already support both; no backend change needed for new UI.

## 5. Application review – customise schedule

- **Customise payment schedule** on the application review page creates a **new** contract and payment plan (with optional fixed amounts) and points the application to them. The original contract/plan are never modified.
- Only allowed when the application has **no** instalment payments yet (manual or Stripe). If you add other payment sources, consider including them in `applicationHasInstalmentPayments`.

## 6. Reports and exports

- Reports that join **student_applications → contracts** work unchanged; they just see the contract the application points to (template or custom).
- Any report that lists “contracts” and should exclude per-application ones can filter with `contracts.student_application_id IS NULL`. The admin Contracts list does this by default and optionally shows custom contracts via “Show custom (per-application) contracts”.

## 7. RLS and permissions

- No RLS changes were required for the new columns; existing policies allow staff to read/update contracts and payment plans. If you add stricter RLS later, ensure staff can still insert/update rows with `student_application_id` / `source_*` set when creating custom contracts from the application review or Create Custom Contract flow.

---

**Summary:** Regenerate types when convenient; use `contracts!contract_id` for new application→contract embeds; rely on the existing delete guard and validation for custom contracts and fixed-amount plans.
