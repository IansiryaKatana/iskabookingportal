# Studio change: upload new signed contract (your idea) – advice and recommendations

**Your idea:** When staff change a student’s studio, require staff to **upload a new signed copy of the contract** instead of sending the student through the DocuSign/signing process again. You’re also considering the case where **room grade changes** as well, so payment schedules and totals would be different.

**No implementation yet** – this is advice and recommendations only.

---

## 1. What I think of the approach

**Overall: it’s a good fit for your use case**, provided you:

- Get legal confirmation that a **staff-uploaded signed copy** is acceptable (no need for DocuSign/re-signing for this change).
- When **grade (and contract) changes**, update the **system** so payment schedules and totals match the new contract; the uploaded document is then the legal record of what was agreed.

Below is how to do that cleanly and what to watch for.

---

## 2. Upload instead of re-signing – pros and one caution

**Pros**

- **Simpler for the student:** No DocuSign link, no “please sign again”. You and the student can sign on paper (or in person), then staff upload the signed PDF.
- **Flexible:** Works for “studio only” and for “studio + grade (new contract)”. The uploaded file is whatever the new contract is.
- **One document:** You can treat the upload as the new contract (or the variation). No need to juggle “original + addendum” in the UI if you prefer a single “current contract” per change.
- **Fits real workflows:** If you sometimes get a signed copy by email or in person, upload is a natural step.

**One caution**

- **Verification:** With DocuSign you have an audit trail (sent, viewed, signed). With upload you have “staff uploaded a file” – you’re relying on the **content of the PDF** (and your process) to prove it’s the correct, signed contract. So:
  - **Recommendation:** Confirm with legal that “signed contract uploaded by staff after studio [and optionally grade] change” is acceptable for your context.
  - In the system: make it clear *what* was uploaded (e.g. document type “Studio change – signed contract”), who uploaded it, when, and optionally a short staff confirmation (“I confirm this is the signed contract for the new studio [and new grade if applicable]”). That keeps an audit trail even without e-sign.

---

## 3. When only the studio changes (same grade, same contract)

- **Payments:** No change. Same contract, same price, same schedule.
- **System:** Reassign studio only (`assigned_studio_id` + studio statuses). No change to `contract_id`, `studio_grade_id`, or payment schedule.
- **Upload:** The uploaded document is typically an addendum/variation (“Premises varied from Studio X to Studio Y…”) or a replacement tenancy that only changes the room. You store it and show it in Documents.
- **Student:** Notify them that their studio has changed and that the new signed contract (or variation) has been recorded.

**Recommendation:** Treat this as “reassign studio + upload signed variation/new contract”. No payment or schedule logic needed.

---

## 4. When studio and grade (and contract) change – schedules and totals

You’re right that **if the room grade changes, payment schedules and totals are different** (e.g. Silver → Gold: different price, different plan). So:

- The **new signed contract** the student signs will reflect the new grade, new price, and new payment terms.
- The **system must match that**. If it doesn’t, you’ll have a mismatch between what’s on file (uploaded PDF) and what the portal/reports show (old schedule, old totals).

**Recommendation:**

1. **Treat “studio + grade change” as one flow**
   - Staff selects:
     - **New contract** (grade/product) and
     - **New studio** (within that grade or, if you allow, from another grade).
   - System updates:
     - `contract_id`, `studio_grade_id`, `assigned_studio_id`
     - Payment plan and schedule from the **new** contract (new totals, new due dates).
   - Staff uploads the **new signed contract** (the one that matches this new deal).
   - Student is notified that their studio and contract have been updated and that the new signed contract has been recorded.

2. **Already-paid amounts**
   - You need a **policy**: e.g.
     - **A)** Payments already made count toward the new contract (e.g. deposit and any instalments credited; new schedule for the remainder), or  
     - **B)** Old payments stay on the old “deal” for accounting; new contract has its own schedule from zero (student might have a credit or top-up separately), or  
     - **C)** Something in between (e.g. deposit transfers, instalments reallocated).
   - **Recommendation:** Decide A/B/C with finance/legal, then implement the system behaviour (recalculate remaining balance, new schedule, and optionally “credits” or “transfers”) so that **totals and schedule in the system match the uploaded contract**. The upload is the legal record; the system should reflect it.

3. **Don’t leave schedule/totals out of sync**
   - If the uploaded contract says “Gold, £X total, schedule Y”, the application’s payment schedule and total due/remaining balance in the system should match. So when grade changes, **do** change payment schedules and totals in the system; the upload is not a substitute for updating the system – it’s the proof of what was agreed, and the system should be updated to match.

---

## 5. Recommendations summary

| Topic | Recommendation |
|-------|----------------|
| **Upload instead of re-signing** | **Good idea.** Get legal sign-off that staff-uploaded signed contract (or variation) is acceptable. Add clear document type, who/when in audit log, and optional staff confirmation when uploading. |
| **Studio only (same grade)** | Reassign studio in system; staff uploads signed variation/new contract; no payment/schedule change; notify student. |
| **Studio + grade change** | Update system to new contract (contract_id, studio_grade_id, assigned_studio_id, **and** payment plan/schedule/totals). Define policy for already-paid amounts (credit/transfer/reallocate). Staff uploads new signed contract. System totals and schedule must **match** the uploaded contract. Notify student. |
| **Document type** | Use a clear label/type for the upload, e.g. “Studio change – signed contract” or “Contract variation – [date] – Studio [X] → [Y] [and new grade if applicable]” so it’s obvious in Documents and for audits. |
| **Student notification** | Always notify when studio (and if applicable contract) has changed and that the new signed contract has been recorded. If grade changed, mention that payment schedule and totals have been updated to match the new contract. |

---

## 6. One-line summary

**Your approach (require staff to upload a new signed contract instead of re-signing) works well:** use it for both “studio only” and “studio + grade change”. For **studio only**, leave payment schedules and totals as they are. For **studio + grade change**, **do** update payment schedules and totals in the system to match the new contract, decide a policy for already-paid amounts, and keep the uploaded PDF as the legal record of what was agreed.
