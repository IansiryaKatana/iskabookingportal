# Reassigning a Confirmed Application’s Studio – Ideation

**Focus:** Reassigning a student’s studio **after** they have a **fully successful confirmed application** – and how that affects **the contract they signed**.  
No implementation yet; this is for discussion and scoping.

---

## Recommendation for your use case

**Your use case:** You need to reassign a student to a different studio **after** they’ve already had a full successful confirmed application (contract signed, possibly deposit paid). You want to do this without breaking the link to the contract they signed and without causing operational or legal issues.

**Recommendation:**

1. **Same contract, same product (same or different room/grade)**  
   - Keep **payments and contract unchanged** (same `contract_id`, same price, same payment schedule).  
   - In the system: only update **assigned studio** (and studio statuses) as you do today.  
   - For the **contract they signed:**  
     - **If** your standard tenancy already says the landlord may reallocate an alternative room → **Option A:** no new document; **notify the student** and log the change. Optionally store a short internal “studio change” note/PDF.  
     - **If** you want a signed record of the room change → **Option B (addendum):** use a one-page variation (“Premises varied from Studio X to Studio Y as of [date]. All other terms unchanged.”). Student signs; you store it (DocuSign or upload) and show it in Documents. **Always notify the student** and, if you use an addendum, tell them to sign it.  
   - **Cross-grade:** You can allow reassigning to a studio in another grade (e.g. Silver contract, Gold room) in the same way: same contract and payments, only physical room changes. Extend the reassignment UI to “other grades” with a clear warning; same addendum/notification approach if legal requires it.

2. **Different product (e.g. move from Silver to Gold contract)**  
   - Treat that as a **separate “change contract”** flow (new contract, new pricing, payment adjustments). Do **not** try to do it via “reassign studio” alone. Build that later if needed.

3. **Implement in this order**  
   - Confirm with legal: **A (no new doc)** or **B (addendum)** for room-only changes.  
   - Then: (a) keep/use existing reassign mutation (DB + studio statuses + audit); (b) add **mandatory notification** to the student when studio is reassigned after confirmation; (c) if B: add “Send studio change addendum” (e.g. DocuSign template or upload) and show it in Documents.  
   - Optionally: allow “other grade” in reassignment dropdown with warning; ensure portal and reports treat assigned studio as the source of truth for the physical room.

**In one line:** For your use case, **recommend Option B (addendum)** unless your tenancy already allows reallocation (then Option A). Same contract and payments; only the room (and optionally grade) change; student is notified and, if you use an addendum, signs it so the contract trail stays clear.

---

## 1. Why this touches “the contract they sign”

When a student completes the journey they typically:

- Sign a **tenancy agreement** (e.g. via DocuSign or uploaded PDF).
- That document usually describes the **premises**: e.g. “Studio 101”, “Room 205, Silver Grade”, building/address.

If you **reassign** their studio (e.g. from 101 to 205) **after** they’ve signed:

- The **signed document on file** still says “Studio 101”.
- The **system** (and keys, housekeeping, check-in) says “Studio 205”.
- So there is a **mismatch** between:
  - **Legal / document:** what they signed (original studio).
  - **Operational:** where they actually live (new studio).

So yes: **reassigning a confirmed application does change the relationship between the signed contract and the actual room.** You need a clear legal and process answer for that; the system can then support it.

---

## 2. Can we achieve it? Yes – with a defined process

You can support studio reassignment after confirmation if you:

1. **Decide the legal/contractual approach** (see below).
2. **Implement or support that process** in the app (e.g. reassign + optional addendum/re-sign + notifications).
3. **Update data and docs** so the system and the document trail stay consistent.

The technical “reassign” (change `assigned_studio_id`, flip studio statuses) is already there. The **extra** work is: contract/document handling, notifications, and (if you want) restricting or guiding when reassignment is allowed (e.g. only for confirmed, with a warning and optional addendum step).

---

## 3. Legal/contractual options (you choose one with legal)

| Option | Idea | When to use | System implication |
|--------|------|-------------|--------------------|
| **A) Contract allows reallocation** | Original tenancy says the landlord may allocate an alternative room of equivalent standard (or similar). | You’re happy that the signed contract already permits a room change. | Reassign in system; **no new document**. Notify student and keep an audit log. Optional: store a short “studio change” note/PDF for records. |
| **B) Addendum / variation** | One-page document: “The premises are varied from Studio X to Studio Y as of [date]. All other terms unchanged.” Student (and you) sign. | You want a **new signed record** of the room change. | Reassign in system; **trigger or upload addendum**. E.g. DocuSign addendum template, or upload signed PDF. Link addendum to application/documents. Notify student. |
| **C) Re-sign full contract** | New tenancy agreement with the new studio; old one superseded/void. | You want one “current” contract that matches the room. | Reassign in system; **generate/send new full contract** (e.g. DocuSign) with new studio; mark previous envelope as superseded. Heavier (new envelope, new signing). |

**Recommendation to discuss with legal:**  
Often **B (addendum)** is a good balance: clear paper trail, student explicitly agrees to the new room, no need to re-sign the whole contract. **A** is simplest if your standard terms already allow reallocation.

---

## 4. All areas affected when we reassign after confirmation

When you change or reassign a student’s studio **after** a full successful confirmed application, these are the areas that are (or should be) affected.

### 4.1 Database and application state

| Area | What changes | Notes |
|------|----------------|------|
| **student_applications.assigned_studio_id** | Set to new studio. | Core of “reassign”. |
| **student_applications** (optional) | If you support cross-grade: you might set `studio_grade_id` to the new studio’s grade for consistency (see earlier “different grade” doc). For same-grade reassign, no change. | Only if you allow cross-grade and want app to reflect “actual” grade. |
| **studios** (old) | Status → `available`; clear reservation/allocation if any. | So the old room can be relet. |
| **studios** (new) | Status → `occupied`. | So it’s not double-booked. |
| **Reservation fields** | Clear `reserved_studio_expires_at` (and any temp reservation) on the application. | Confirmed application shouldn’t show “reservation expires”. |

**Unchanged on purpose (same product, same price):**  
`contract_id`, `studio_grade_id` (unless you explicitly do “change contract”), `selected_payment_plan_id`, payment schedule, deposit and instalments. So **payments stay as they are** for a simple “same contract, different room” reassign.

---

### 4.2 Contract and documents (the bit that “changes the contract they sign”)

| Area | Effect | What you might do |
|------|--------|--------------------|
| **Signed tenancy (DocuSign / PDF)** | The **existing** signed document still describes the **old** studio. So the “contract they signed” (wording) does not automatically update. | Choose A, B, or C above. If B or C: send addendum or new contract, then store it (DocuSign envelope or uploaded PDF) and link to application. |
| **DocuSign envelopes** | Today you may have one “completed” envelope per application. | If addendum: either a second envelope (e.g. “Studio change addendum”) or a separate “document” record (e.g. uploaded PDF). If re-sign: new envelope, mark old as superseded. |
| **Portal “Documents”** | Student sees their contracts/documents. | Show original contract **and** addendum (or new contract) so the trail is clear: “Tenancy agreement” + “Studio change addendum (Studio 101 → 205)”. |
| **Audit / compliance** | You need a record that the room was changed and, if required, that the student agreed (addendum/re-sign). | Activity log already has “reassign” from/to studio. Add: “Addendum sent” / “Addendum signed” / “Student notified” as needed. |

So **yes** – reassigning does affect the **alignment** between signed contract and reality; you fix that by your **legal choice** (A, B, or C) and then supporting it in **documents and audit**.

---

### 4.3 Payments

| Area | Effect | What you do |
|------|--------|-------------|
| **Contract and payment schedule** | If you **only** change studio (same contract, same product): contract_id and schedule stay. | Nothing. Total due, deposit, instalments unchanged. |
| **Stripe / manual payments** | Already recorded against the application/contract. | No change. |
| **get_payment_summary, remaining balance** | Driven by contract and schedule. | No change for same-contract reassign. |
| **Refunds / top-ups** | Only if you also **change contract** (e.g. different grade/product). | That’s a separate “change contract” flow, not “reassign studio” on its own. |

So for **same-contract** reassignment, **no payment changes** are required.

---

### 4.4 Student-facing (portal and comms)

| Area | Effect | What you do |
|------|--------|-------------|
| **Portal – “Your studio”** | Should show the **new** studio (from `assigned_studio_id`). | Already the case once DB is updated. |
| **Portal – Documents** | Should show original contract + addendum (or new contract) if you use B or C. | Need to list/link addendum or new envelope in Documents. |
| **Portal – Payments** | Unchanged (same contract). | No change. |
| **Notifications** | Student must know the room changed. | **Always** send a clear notification: “Your studio has been changed from [X] to [Y]. [If addendum: Please sign the addendum sent to your email.]” |
| **Check-in / move-in info** | Keys, address, instructions should be for the **new** studio. | Any check-in or move-in copy that derives from `assigned_studio` will automatically use the new one once reassigned. |

---

### 4.5 Operations (housekeeping, maintenance, calendar)

| Area | Effect | What you do |
|------|--------|-------------|
| **Housekeeping** | Tasks/rosters are per studio. | They should use the **new** studio (application’s `assigned_studio_id`). After reassign, new tasks = new studio. Old studio drops off. |
| **Maintenance** | Requests/history can be per studio or per application. | “Current” studio for the application is the new one. Existing requests for the **old** studio stay as history (no automatic move). |
| **Booking / occupancy calendar** | Calendar shows which studio is occupied by which application. | Entry should **move** from old studio to new studio (driven by `assigned_studio_id`). |
| **Keys / front desk** | Who gets keys to which room. | Ops use the new studio; no code change if they read from your system. |

So operations are aligned **as long as** everything reads “current studio” from the application’s **current** `assigned_studio_id`.

---

### 4.6 Reporting and analytics

| Area | Effect | What you do |
|------|--------|-------------|
| **Occupancy by studio** | Old studio becomes available, new one occupied. | Correct if studio statuses are updated (which reassign already does). |
| **Applications by grade / revenue by grade** | If you keep same contract (and grade): no change. If you ever allow cross-grade reassign and update grade on the application, reports that show “physical unit by grade” should use the assigned studio’s grade. | For same-grade reassign: no change. For cross-grade: see earlier “different grade” doc. |

---

### 4.7 Edge cases and safety

| Topic | Suggestion |
|-------|------------|
| **Who can reassign?** | Only admin (or specific role). Already the case if only staff see Application Detail reassign. |
| **When can they reassign?** | You could allow only for status = confirmed (and maybe “not yet checked in” if you track that). Optional: soft warning “Student has already signed; ensure addendum/process is followed.” |
| **Double reassign** | If someone reassigns twice quickly, ensure each run uses “current” assigned_studio_id as the “old” one and updates to the new one. Your current mutation already does that. |
| **DocuSign in progress** | If an envelope is still “sent” (not completed), reassigning might confuse the document (it might still have old studio). Consider blocking reassign while envelope is outstanding, or only allowing after “completed”. |

---

## 5. Summary: can we achieve it, and how?

- **Yes, you can achieve it**, by:
  1. **Choosing** the legal approach (A: contract allows reallocation; B: addendum; C: re-sign).
  2. **Implementing** reassign as today (DB + studio statuses + audit log), plus:
     - **If B or C:** a way to send and store the addendum or new contract (DocuSign or upload), and show it under Documents.
     - **Always:** a clear **notification** to the student that their studio has changed and what (if anything) they need to sign.
  3. **Leaving payments unchanged** for same-contract, same-product reassignments.
  4. **Relying** on existing use of `assigned_studio_id` for operations (housekeeping, calendar, check-in) so they follow the new studio automatically.

- **Areas affected** when you reassign a confirmed application’s studio:
  - **DB:** assigned_studio_id, old/new studio status, optional reservation cleanup.
  - **Contract/documents:** the signed contract no longer matches the room; you fix that with your legal process (A/B/C) and document storage.
  - **Payments:** unchanged for same contract.
  - **Portal:** shows new studio; documents should show original + addendum if applicable.
  - **Comms:** must notify student.
  - **Operations:** automatically use new studio if they read from `assigned_studio_id`.
  - **Reporting:** correct if statuses and (if relevant) grade logic are as above.

Next step is to **decide A, B, or C with legal**, then we can design the exact flows (e.g. “Reassign” button → confirm → update DB → “Send addendum?” → notify student) and any new DocuSign template or document types.
