# Staff-Created Applications (On-Behalf-of-Student) – Analysis & Recommendation

**Purpose:** Allow staff to create and complete a full application on behalf of students who refuse to use the system, using the same 6-step journey but with **upload of signed guarantor and tenancy agreements** instead of DocuSign.

**Scope:** Analysis only – no implementation. This document maps affected areas, risks, and a recommended approach so you can implement without breaking existing behaviour.

---

## 1. Current Behaviour (Summary)

### 1.1 Student journey today

1. **Start:** Student goes to a contract (e.g. `/contracts/:slug`), clicks “Enquire” → **ContractDetail.tsx** inserts into `student_applications` (`student_id = user.id`, `contract_id`, `studio_grade_id`, `status: 'draft'`) and navigates to `/portal/applications/:id/select-studio`.
2. **Studio:** **StudioSelection.tsx** – reserve/select studio, set `assigned_studio_id`, then navigate to `/portal/applications/:id` (wizard).
3. **Wizard:** **ApplicationWizard.tsx** – 6 steps:
   - Step 1: Personal info  
   - Step 2: Contact  
   - Step 3: Academic & additional  
   - Step 4: Documentation (uploads)  
   - Step 5: Payment plan & guarantor (deposit / manual payment verification, guarantor details, optional witness)  
   - Step 6: **Agreements & Signing** – “Send via DocuSign” → `docusign-envelopes` creates tenancy (+ optional guarantor) envelopes, rows in `docusign_envelopes`, application → `awaiting_signature`. Student/guarantor sign via DocuSign; webhook/check-status set envelope `status = 'completed'` and application → `awaiting_verification`.
4. **Completion:** Staff confirm in admin → application `confirmed`, studio allocated, etc.

### 1.2 Admin Applications today

- **Applications.tsx:** List, filters, “Record Payment”, “Review” (ApplicationDetail), **“Open journey”** → `navigate('/portal/applications/' + application.id)`.
- **ApplicationDetail.tsx:** View/edit application, assign studio, document verification, status changes, cashback/partner, manual payment, etc.
- **No “Create application”** button; no way to start an application for another student from admin.

### 1.3 Access control

- **Portal routes** used by the journey:
  - `/portal/applications/:applicationId/select-studio` → **allowedRoles: `["student", "superadmin"]`**
  - `/portal/applications/:applicationId` (wizard) → **allowedRoles: `["student", "superadmin"]`**
- So **staff cannot** open “Open journey” and reach the wizard today (they are redirected by ProtectedRoute).
- **RLS:** Staff already have full access to `student_applications`, `student_application_steps`, `student_documents`, `docusign_envelopes` (`is_staff()`). Students can only insert applications where `student_id = auth.uid()`.

---

## 2. What “staff create application” must do

- **Same journey:** Same 6 steps, same data (personal, contact, academic, docs, payment/guarantor, agreements).
- **Only difference at Step 6:** Instead of “Send via DocuSign”, staff get **“Upload signed tenancy agreement”** and **“Upload signed guarantor agreement”** (if guarantor required).
- **Outcome:** Application reaches `awaiting_verification` (and then can be confirmed) without any DocuSign envelopes; signed PDFs are stored and linked like DocuSign-signed PDFs where possible.

---

## 3. Affected Areas (Counts and List)

### 3.1 High-level count

| Layer              | Areas affected (estimate) | Nature of change                          |
|--------------------|---------------------------|-------------------------------------------|
| **Routing / auth** | 2–3                       | Allow staff on portal wizard/select-studio or add admin wizard route(s) |
| **Admin UI**       | 2–3                       | “Create application” entry + student/contract/studio picker            |
| **Wizard (Step 6)**| 1                         | Branch: DocuSign vs “upload signed” for staff                           |
| **Data / storage** | 2–3                       | How “uploaded” signed docs are stored and linked                       |
| **Status flow**    | 0–1                       | Reuse existing “all envelopes completed” → awaiting_verification        |
| **RLS / DB**       | 0                         | No RLS change needed (staff already can insert/update)                 |
| **Edge functions** | 0–1                       | Optional small helper for upload path or reuse check-status             |

So roughly **8–12 discrete areas**, with most work in **admin entry**, **route access**, and **Step 6 upload path**.

---

## 4. Detailed Affected Areas

### 4.1 Application creation (admin)

- **Where:** Admin Applications page (and optionally ApplicationDetail).
- **Current:** No “Create application” action.
- **Change:**
  - Add a **“Create application”** (or “Start application on behalf of student”) button.
  - **Student picker:** Need to choose the student (e.g. from `profiles` where `role = 'student'`, with search by name/email). Student must exist in `auth.users` + `profiles` (no creating users here; use existing students or existing “invite student” flows).
  - **Contract (+ studio) selection:** Same as student: contract implies `studio_grade_id`; then either:
    - Reuse **StudioSelection** (staff goes to select-studio then wizard), or
    - In the “create application” flow, pick contract and optionally studio in one dialog and create the application with `assigned_studio_id` set (then open wizard at step 1).
- **Insert:** Same as ContractDetail: `student_applications` row with `student_id` = chosen student, `contract_id`, `studio_grade_id`, `status: 'draft'`, optional `assigned_studio_id`. Staff already have INSERT via “Staff manage applications” RLS.
- **Risk:** Duplicate applications (same student + contract). Mitigation: same check as ContractDetail – before insert, `select id from student_applications where student_id = ? and contract_id = ?`; if exists, navigate to that application instead of inserting again.

**Files / components:**  
`src/pages/admin/Applications.tsx`, new dialog or page for “Create application” (student + contract + optional studio), and possibly a small hook or RPC to resolve contract/studio.

---

### 4.2 Route access (wizard + select-studio)

- **Where:** `App.tsx` – ProtectedRoute for:
  - `/portal/applications/:applicationId/select-studio`
  - `/portal/applications/:applicationId` (ApplicationWizard)
- **Current:** `allowedRoles={["student", "superadmin"]}` → staff (and staff sub-roles) cannot open these URLs.
- **Change:** Either:
  - **Option A:** Add `"staff"` (and any staff sub-roles that should complete applications, e.g. `operations_manager`, `reservationist`, `accountant`, `front_desk`) to these two routes so “Open journey” works for staff and they go through the **same** portal wizard; or
  - **Option B:** New admin route(s), e.g. `/admin/applications/new` (create + redirect) and `/admin/applications/:id/journey` (wizard in admin layout), and reuse the same wizard component with a prop/context like `isStaffOnBehalf={true}` so Step 6 shows upload UI.
- **Recommendation:** **Option A** is simpler and keeps one wizard codebase; only Step 6 content and navigation (e.g. “Return to dashboard” → admin) differ by role, which the wizard already does for “Return to dashboard”. So: **extend allowedRoles** on the two portal routes above to include staff (and desired sub-roles).

**Files:** `src/App.tsx` (and optionally `route_permissions` if you use DB-driven permissions for these paths).

---

### 4.3 Wizard context (staff vs student)

- **Where:** `ApplicationWizard.tsx` – uses `useAuth()` (user, profile, role) and `useParams('applicationId')`; loads application by id; no check that `application.student_id === user.id`.
- **Current:** Wizard works for whoever can open the URL; RLS ensures only the owning student or staff can read/update. Email sync in step 2 only runs when `application.student_id === user.id`, so staff filling on behalf won’t change the student’s auth email (correct).
- **Change:** Use **role** (and optionally a flag like `created_by_staff` if you add it later) to decide Step 6 content:
  - If **staff/superadmin** and you want “upload path” for this application: show “Upload signed tenancy” / “Upload signed guarantor” instead of “Send via DocuSign”.
  - You can make this configurable per application later (e.g. “Signatures via upload” checkbox when staff creates the application); for a first version, “staff in wizard ⇒ show upload path” is enough.
- **Risk:** Minimal; wizard already branches on role for “Return to dashboard” (admin vs portal).

**Files:** `src/pages/portal/ApplicationWizard.tsx` (Step 6 branch and new upload UI).

---

### 4.4 Step 6 – Upload path (UI + behaviour)

- **Where:** Step 6 in `ApplicationWizard.tsx` – currently: deposit paid → “Send agreements” → `docusign-envelopes` → envelopes created → “Sign tenancy agreement” / guarantor email.
- **Change for staff (upload path):**
  - **Do not** call `docusign-envelopes`.
  - Show two upload controls (and labels):
    - “Upload signed tenancy agreement” (required).
    - “Upload signed guarantor agreement” (required if `requiresGuarantor`).
  - On upload (e.g. PDF):
    1. Upload file to **storage** (see 4.5).
    2. Insert or update **`docusign_envelopes`** row(s) for this application:
       - `envelope_type`: `'tenancy'` or `'guarantor'`
       - `status`: `'completed'`
       - `envelope_id`: `null` (no DocuSign envelope)
       - `signed_document_path`: path in storage (e.g. `contracts/{application_id}/uploaded-tenancy-{timestamp}.pdf`)
    3. After **both** required envelopes are present and `status = 'completed'`, trigger application status update to `awaiting_verification` (see 4.6).
  - **Step 6 “complete”:** Reuse existing logic: `allSignaturesCompleted` is derived from `docusign_envelopes` with `isEnvelopeCompleted(status)` (`status === 'completed'`). So once both tenancy and guarantor (if required) rows exist with `status = 'completed'`, the wizard already considers Step 6 complete. No change to `isEnvelopeCompleted` needed.
- **Risk:** Validation (e.g. PDF only, max size) and clear error messages; otherwise straightforward.

**Files:** `src/pages/portal/ApplicationWizard.tsx` (Step 6 conditional UI + upload handlers + storage + `docusign_envelopes` insert).

---

### 4.5 Storage for uploaded signed documents

- **Where:** DocuSign-signed PDFs are stored in the **contracts** bucket (see `docusign_envelopes.signed_document_path` and `download-signed-document`).
- **Current:** `download-signed-document` and DocuSign webhook write to that bucket (service role or backend). Students don’t upload directly to contracts bucket for signing; they trigger DocuSign.
- **Change:**
  - **Option A:** Staff upload from browser to a **storage path** under the contracts bucket, e.g. `contracts/{application_id}/uploaded-tenancy-{timestamp}.pdf` and `contracts/{application_id}/uploaded-guarantor-{timestamp}.pdf`, using Supabase Storage API from the client (with RLS allowing staff to insert/update for that application). You need a storage policy that allows authenticated staff to upload under `contracts/{application_id}/*` (and optionally read for their own uploads / for application context). If the bucket today is private and only backend writes to it, add a policy for staff (e.g. `is_staff()` and path prefix by application_id).
  - **Option B:** New edge function “upload-signed-document” that accepts multipart/form (file) + `applicationId` + `envelopeType` (‘tenancy’ | ‘guarantor’), uses service role to write to contracts bucket, inserts/updates `docusign_envelopes`, and returns the path. Then frontend only calls that function; no direct storage upload from client. This centralises validation and keeps bucket access server-side.
- **Recommendation:** **Option B** is safer and keeps storage and `docusign_envelopes` in one place; it also makes it easy to enforce file type/size and to run the application status update (or call `docusign-check-status` with `applicationId` only) after the second upload.

**Files:** New edge function (e.g. `upload-signed-document`) and/or storage policies; `ApplicationWizard.tsx` (call the function or upload + insert).

---

### 4.6 Application status after uploads

- **Where:** Today, when all DocuSign envelopes are `completed`, `docusign-check-status` (and webhook) call `updateApplicationStatus(applicationId)`, which sets application to `awaiting_verification` if it was `awaiting_signature` / `awaiting_deposit` / `draft`.
- **Change:** After staff uploads the **second** required signed document (tenancy + guarantor if required):
  - Either call existing **`docusign-check-status`** with body `{ applicationId }`. It will not find any `envelope_id` for your uploaded rows (they are null), so it won’t call DocuSign API; it still runs **`updateApplicationStatus(applicationId)`**, which reads all `docusign_envelopes` for that application, sees all `status === 'completed'`, and moves application to `awaiting_verification`. No code change in `docusign-check-status` needed.
  - Or add a tiny RPC/function that only runs the same “if all envelopes completed then set awaiting_verification” logic and call that from the upload flow (slightly clearer intent; optional).
- **Risk:** None if you reuse `updateApplicationStatus`; just ensure both envelope rows exist with `status = 'completed'` before calling.

**Files:** `ApplicationWizard.tsx` or `upload-signed-document` (invoke check-status or RPC after second upload).

---

### 4.7 Download / view of uploaded signed docs

- **Where:** Portal Contracts, ApplicationDetail, and `download-signed-document` edge function (used when envelope has `envelope_id` and DocuSign PDF).
- **Current:** Download uses `envelope_id` and DocuSign API, or `signed_document_path` if present (see `download-signed-document` and migration `signed_document_path`).
- **Change:** For rows with `envelope_id` null and `signed_document_path` set, any existing flow that uses `signed_document_path` to serve the PDF from storage should work. Verify that `download-signed-document` (or the place that generates “Download” links) supports “no envelope_id, use signed_document_path only” for staff-uploaded files; if not, add that branch.
- **Risk:** Low; one conditional in download logic.

**Files:** `supabase/functions/download-signed-document/index.ts` (and any UI that builds the download link).

---

### 4.8 Student picker and contract/studio selection (admin)

- **Where:** New “Create application” flow in admin.
- **Change:**
  - **Student:** List/search students (`profiles` + maybe `auth.users` for email). Use existing patterns (e.g. Students page, ManualPaymentDialog student selector) so you don’t duplicate logic.
  - **Contract:** List active contracts (with academic year / studio grade) and on select set `contract_id` and `studio_grade_id`. Optionally in the same flow, **studio:** list studios for that grade (available or all) and set `assigned_studio_id` so staff can skip select-studio and go straight to wizard step 1.
- **Risk:** Duplicate application check (student + contract) as in ContractDetail.

**Files:** New dialog or page under admin (e.g. `Applications.tsx` + new component or `CreateApplicationDialog.tsx`).

---

### 4.9 Navigation and “Return to dashboard”

- **Where:** Wizard “Return to dashboard” and any “Back” from wizard.
- **Current:** Wizard already uses `profile?.role` to send staff to `/admin` and students to `/portal`.
- **Change:** None if you use Option A (staff on portal routes). If you add admin wizard route (Option B), ensure “Return to dashboard” and any “Back” go to `/admin/applications` or `/admin` for staff.

**Files:** Already correct in `ApplicationWizard.tsx` for role-based dashboard.

---

### 4.10 Triggers and downstream behaviour

- **Application confirmation:** When application moves to `confirmed`, existing trigger (e.g. studio allocation, notifications) runs; it doesn’t care whether the application was created by student or staff. No change.
- **DocuSign webhook / check-status:** They only update envelopes that have `envelope_id`; they won’t touch your uploaded rows. `updateApplicationStatus` only reads envelope status; it doesn’t care if status came from DocuSign or from your insert. No change.
- **Bulk import / data management:** Existing bulk import and “delete application” flows that touch `student_applications` and related tables will include staff-created applications; no special case needed.

**Files:** None.

---

### 4.11 RLS and permissions

- **student_applications:** Staff already have full access (select/insert/update/delete) via `is_staff()`. Students can only insert with `student_id = auth.uid()`. No change.
- **student_application_steps, student_documents, docusign_envelopes:** Staff already have full access. No change.
- **route_permissions:** If you use DB-driven permissions for `/portal/applications/:id` and select-studio, add entries for `staff` (and any sub-roles) with `allowed = true` for those paths, or rely on `allowedRoles` in App.tsx only.

**Files:** Optional `route_permissions` inserts; no RLS migration required.

---

### 4.12 Edge functions

- **docusign-envelopes:** Not called in staff upload path; no change.
- **docusign-recipient-view:** Not used when staff upload; no change.
- **docusign-check-status:** Reused to run `updateApplicationStatus` after both uploaded envelopes are saved; no change (optional: document that it’s safe to call with only `applicationId`).
- **upload-signed-document (new):** Optional but recommended: accepts file + `applicationId` + `envelopeType`, writes to contracts bucket, inserts/updates `docusign_envelopes`, and optionally calls `updateApplicationStatus` or triggers check-status so application moves to `awaiting_verification` when both tenancy and guarantor (if required) are uploaded.

**Files:** New function `upload-signed-document` (recommended); others unchanged.

---

## 5. Recommendation Summary

### 5.1 Approach

1. **Admin entry**
   - Add “Create application” on Applications page.
   - Dialog (or small flow): pick **student** (existing), **contract** (sets `studio_grade_id`), optionally **studio** (sets `assigned_studio_id`).
   - Check for existing application (student + contract); if exists, open that instead of creating a new one.
   - Insert `student_applications` with `student_id`, `contract_id`, `studio_grade_id`, optional `assigned_studio_id`, `status: 'draft'`.
   - Navigate to `/portal/applications/:id/select-studio` if no studio chosen, else `/portal/applications/:id`.

2. **Route access**
   - Allow **staff** (and desired sub-roles) on:
     - `/portal/applications/:applicationId/select-studio`
     - `/portal/applications/:applicationId`
   so “Open journey” and the new “Create application” flow both use the same wizard.

3. **Wizard Step 6**
   - If current user is **staff/superadmin**, show the **upload path** in Step 6:
     - “Upload signed tenancy agreement” (required).
     - “Upload signed guarantor agreement” (if guarantor required).
   - On each upload: store file (via new edge function or client upload with policy), insert/update `docusign_envelopes` with `envelope_type`, `status: 'completed'`, `signed_document_path`, `envelope_id: null`.
   - When both required envelopes are completed, call `docusign-check-status` with `{ applicationId }` so `updateApplicationStatus` runs and application moves to `awaiting_verification`.

4. **Storage and download**
   - Prefer a small edge function `upload-signed-document` that writes to the contracts bucket and updates `docusign_envelopes`.
   - Ensure download flow (e.g. `download-signed-document` or UI) supports envelopes with no `envelope_id` and only `signed_document_path`.

5. **No RLS or trigger changes**
   - Rely on existing staff policies and existing confirmation/studio allocation behaviour.

### 5.2 Order of implementation (suggested)

1. **Route access** – extend `allowedRoles` for the two portal routes so staff can open the journey.
2. **Step 6 upload path** – in ApplicationWizard, branch by role; add upload UI and storage + `docusign_envelopes` insert; after second upload call `docusign-check-status`.
3. **Storage/edge function** – implement `upload-signed-document` (or equivalent) and wire Step 6 to it; add/verify storage policy for contracts bucket for staff uploads.
4. **Download** – ensure envelopes with only `signed_document_path` are downloadable.
5. **Admin “Create application”** – student + contract + optional studio picker, duplicate check, insert, then redirect to select-studio or wizard.

### 5.3 What to avoid

- **Do not** change RLS to allow students to insert applications with a different `student_id`; keep that strict.
- **Do not** mix “upload path” and “DocuSign path” in the same step without a clear branch (e.g. by role or by a flag); avoid showing both “Send via DocuSign” and “Upload signed” to the same user for the same application unless you define rules (e.g. “if staff, only upload”).
- **Do not** skip deposit/payment and guarantor data for staff-created applications; keep Steps 1–5 the same so the application has full data for contracts, payments, and reporting.

---

## 6. Risk Overview

| Risk | Mitigation |
|------|------------|
| Staff opens another student’s application by URL | RLS already restricts; only staff and owning student can read. Staff are trusted. |
| Duplicate applications (same student + contract) | Check before insert in “Create application” and redirect to existing if found. |
| Uploaded file type/size | Validate in edge function or client; restrict to PDF and a max size. |
| Step 6 “complete” without both envelopes | Reuse `allSignaturesCompleted`; only set envelope rows to `completed` when file is successfully stored and linked. |
| Download broken for uploaded docs | Verify `download-signed-document` (or equivalent) handles `envelope_id` null + `signed_document_path` set. |
| Confusion between DocuSign and upload path | Show only one path per application/role (e.g. staff ⇒ upload only in Step 6). |

---

## 7. Doc references

- **Architecture:** `docs/architecture-spec.md` – student journey (4.4), agreements (4.5), DocuSign.
- **DocuSign assessment:** `docs/CUSTOM_SIGNING_SOLUTION_ASSESSMENT.md` – confirms DocuSign remains; this feature is “upload instead of send” for staff only.
- **RLS:** `supabase/migrations/20250312_student_portal_rls.sql` – student_applications, steps, documents, signatures; staff have full access.
- **Envelopes:** `supabase/migrations/20250316_docusign_envelopes.sql`, `20260129_docusign_envelopes_signed_document_path.sql` – `signed_document_path` already exists for storage path.
- **Status update:** `supabase/functions/docusign-check-status/index.ts` – `updateApplicationStatus` uses all envelopes for the application; no `envelope_id` required for a row to count as completed.

---

## 8. Conclusion

Implementing staff-created applications with “upload signed tenancy and guarantor” instead of DocuSign is **contained and low-risk** if you:

- Reuse the **same 6-step wizard** and only change Step 6 for staff to an upload UI.
- Reuse **`docusign_envelopes`** with `status: 'completed'` and `signed_document_path` for uploaded PDFs, and **`docusign-check-status`** to move the application to `awaiting_verification`.
- Add **admin “Create application”** with student + contract (+ optional studio) and a duplicate check.
- Allow **staff** on the existing portal wizard and select-studio routes (or add equivalent admin routes and reuse the same wizard component).

No RLS or trigger changes are required. The main work is: route access, Step 6 branch and upload UI, storage/edge upload path, download verification, and the create-application flow in admin. This keeps the student journey unchanged and avoids breaking existing DocuSign or confirmation behaviour.
