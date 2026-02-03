# Reassigning a Student to a Different Studio Grade – Analysis & Recommendation

**Context:** You sometimes need to reassign a student’s studio to one in a **different studio grade** (e.g. from Silver to Gold). Today, the Admin → Application Detail “Assign/Reassign Studio” dropdown only shows studios in the **same** grade as the application. This document analyses what changing that would entail and recommends a safe approach for a live system.

---

## 1. Current behaviour (same grade only)

- **Application** has: `contract_id`, `studio_grade_id`, `assigned_studio_id`.
- On creation, `studio_grade_id` is set from the **contract** (contract is tied to one studio grade).
- **Reassignment** (Application Detail):
  - Studios are loaded with `useAdminStudios({ gradeId: application?.studio_grade_id, status: "available" })` → **same grade only**.
  - On “Reassign Studio”, the mutation:
    - Updates `student_applications.assigned_studio_id` to the new studio.
    - Sets **old** studio status to `available`, **new** studio status to `occupied`.
    - Writes an activity log entry.
  - **No** change to `contract_id`, `studio_grade_id`, payment plan, or pricing.

So today: **reassignment = same contract, same grade, different unit**. Contract and pricing stay fixed.

---

## 2. What “reassign to a different studio grade” can mean

Two possible intents:

- **A) Cross-grade studio only (physical unit change)**  
  “Same contract and pricing; we just assign a studio from another grade (e.g. Silver contract, Gold studio).”  
  → Only `assigned_studio_id` (and studio statuses) change; `contract_id` and `studio_grade_id` stay as they are.

- **B) Full move to another grade/contract**  
  “Student is now on a Gold contract (different product, pricing, payment plan).”  
  → Requires changing `contract_id`, `studio_grade_id`, and `assigned_studio_id`, and handling payments/plans/documents.

The system today is built around **one application = one contract = one studio grade**. So (B) is a larger “change contract” feature; (A) is a smaller “allow cross-grade studio” change but introduces a **data inconsistency** (see below).

---

## 3. Option A – Allow cross-grade studio only (no contract change)

**Idea:** In the reassignment UI, allow picking a studio from **any** grade (e.g. “Show other grades” or a second dropdown). On save, only update `assigned_studio_id` (and studio statuses) as today. Leave `contract_id` and `studio_grade_id` unchanged.

**Data inconsistency:**

- `application.studio_grade_id` = contract’s grade (e.g. Silver).
- `application.assigned_studio_id` → studio in another grade (e.g. Gold).
- So: **application “grade” (Silver) ≠ assigned studio’s grade (Gold)**.

**What stays correct:**

- **Pricing & payments:** All driven by `contract_id` (payment schedule, deposit, installments, get_payment_summary, manual payments). Contract unchanged → no impact.
- **Manual payments, Stripe, payment summary:** Unchanged.
- **DocuSign / tenancy:** Contract name/terms still match the application’s contract; only the physical unit (studio) changes.

**What can go wrong or be confusing:**

1. **Portal “Select studio” step**  
   Uses `application.studio_grade_id` to load studios (`useStudios(studioGradeId)`). So the student would still see studios for the **contract** grade (e.g. Silver), not the newly assigned Gold studio’s grade. If they already have an assigned studio, they see “Reserved by you” for that studio only when it’s in the same grade; if we assigned a Gold studio, the portal would still list Silver studios and the assigned Gold studio would not appear in that list (because it’s a different grade). So **portal behaviour would be inconsistent** with the assigned studio unless we also change how the portal resolves “which studio is mine” (e.g. show assigned studio even when from another grade).

2. **Reports & analytics**  
   Anything that groups or filters by `application.studio_grade_id` (e.g. “applications by grade”, “revenue by grade”) would still reflect the **contract** grade, not the **assigned studio’s** grade. So “Silver” would still be counted even though the student is in a Gold unit. If you want “physical unit by grade”, those reports would need to use `assigned_studio.studio_grade_id` (or similar) and be audited.

3. **Admin studio list / Application Detail**  
   After reassignment to another grade, “Currently Assigned” would show the new studio (from `assigned_studio`). The dropdown would still be driven by `application.studio_grade_id` (same grade) unless we change it to “all grades” or “other grades”. So either we extend the UI to show studios from other grades (with clear labels) or add a separate “Other grade” flow.

4. **Housekeeping, maintenance, booking calendar**  
   These use `assigned_studio_id` (or the studio record). So the **correct physical studio** would be used; no functional bug, but the “grade” shown might come from application vs studio depending on the screen.

5. **Fully booked / availability**  
   “Occupied” is set on the new studio; “available” on the old one. Same as today. No extra risk.

**If you implement Option A:**

- **UI:** Extend reassignment to allow selecting a studio from another grade (e.g. “Same grade” vs “Other grade” with grade selector, or one list “All available studios” with grade label per studio). Keep one “Reassign Studio” action that only updates `assigned_studio_id` + studio statuses.
- **Portal:** Decide and implement: either (i) show the assigned studio even when its grade ≠ `application.studio_grade_id` (e.g. in StudioSelection or dashboard), or (ii) document that cross-grade assignment is admin-only and the student may see “Silver” studios while actually assigned to a Gold unit.
- **Reporting:** Audit reports that use `studio_grade_id`; where “physical unit grade” matters, use `assigned_studio.studio_grade_id` and document the difference.
- **Warnings:** In the reassignment UI, show a clear warning when the selected studio’s grade ≠ application’s grade (e.g. “This studio is in [Gold]. The application contract remains [Silver]. Pricing and contract terms will not change.”).
- **Audit:** Keep logging the reassignment (from/to studio and grade) so you can trace cross-grade moves.

**Risks for a live system:**

- Low risk for **payments and contract logic** (no change).
- Medium risk for **portal and reporting** if not adjusted (confusing or wrong figures).
- Risk is contained if you treat cross-grade as an **exception** and document it; avoid doing it at scale until behaviour and reports are aligned.

---

## 4. Option B – Full move to another grade/contract (change contract)

**Idea:** “Reassign to another studio grade” means the student is **moving to a different product** (e.g. from Silver 45 weeks to Gold 45 weeks). Then we must:

- Pick a **new contract** (same academic year / weeks if possible) for the new grade.
- Update `contract_id`, `studio_grade_id`, and `assigned_studio_id`.
- Revisit **payment plan** (new contract’s plans), **pricing** (new contract’s price), **existing payments** (already paid for old contract), **contract_payment_schedule** / installments, and **DocuSign** (new contract = new document).

This is a **change-of-contract** feature, not a small reassignment tweak. It would entail:

- New or updated screens: choose new contract (and possibly new payment plan).
- Rules for existing payments (transfer vs refund vs leave as-is).
- Possible new RPC or migration to update application + optionally schedule + payments in a consistent way.
- DocuSign / tenancy: new envelope or at least clear communication that the contract has changed.

**Recommendation:** Do **not** implement Option B as part of “reassign studio”. Handle it as a separate “Change contract / grade” project with proper scope and testing.

---

## 5. Recommendation (summary)

- **If the business need is “same contract, different physical unit (sometimes in another grade)”:**  
  Implement **Option A** (allow cross-grade studio in reassignment, update only `assigned_studio_id` and studio statuses). Then:
  - Extend reassignment UI to allow selecting a studio from another grade, with a clear warning.
  - Adjust portal (and any “my studio” views) so the assigned studio is correct even when its grade ≠ `application.studio_grade_id`.
  - Audit reports that use grade; use `assigned_studio.studio_grade_id` where “physical unit grade” is intended.
  - Document and log cross-grade reassignments.

- **If the business need is “move the student to a different product/contract (different grade)”:**  
  Treat that as **Option B** and build a dedicated “Change contract / grade” flow (contract + studio_grade_id + assigned_studio_id + payments/documents). Do not try to do it by only changing the studio dropdown.

- **To avoid issues on a live system:**
  - Implement Option A in small steps: first UI + backend (reassign to any available studio, with warning when grade differs), then portal, then report audits.
  - Keep contract and payment logic untouched for Option A.
  - Add feature flags or permissions if you want to limit “reassign to other grade” to certain roles until you’re confident.

---

## 6. Areas to audit if you implement Option A

| Area | Uses | Action |
|------|------|--------|
| Application Detail reassignment | `application.studio_grade_id` for studio list | Extend to load studios from other grades (or “all grades”) and show grade label; warn when grade ≠ application. |
| Portal StudioSelection | `application.studio_grade_id` for which studios to show | Ensure assigned studio is shown and correct even when its grade ≠ application.studio_grade_id (e.g. by including assigned_studio in the list or resolving “my studio” from assigned_studio_id). |
| Payment schedule / deposit / installments | `application.contract_id` | No change. |
| get_payment_summary | `application.contract_id`, contract’s studio_grade_id for pricing | No change. |
| Reports (sales, occupancy, by grade) | Often `application.studio_grade_id` or contract | Where “physical unit by grade” matters, switch to assigned_studio.studio_grade_id and document. |
| Booking calendar / housekeeping / maintenance | assigned_studio_id / studio | No change (already correct). |
| Activity log | Reassignment already logged | Add “from_grade” / “to_grade” in payload for cross-grade moves. |

---

*Document generated for product/tech decision. No code changes applied.*
