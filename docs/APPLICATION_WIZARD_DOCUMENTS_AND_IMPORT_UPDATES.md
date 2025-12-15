## Application Wizard – UCAS & Documentation Updates (2025-12-15)

**Scope**: Student Application Wizard (Steps 1 & 4), student documents, bulk application import, and admin review UI.  
**Goal**: Make UCAS ID and key documentation mandatory, align bulk import + storage, and surface the student photo clearly for operations/check-in.

---

### 1. Step 1 – Personal Information (UCAS ID)

- **Field**: `ucas_id`
- **Location**: `src/pages/portal/ApplicationWizard.tsx`
- **Behaviour**:
  - Now **required** (previously optional).
  - Validation: non-empty string, trimmed, max length **32**.
  - Label text: **“UCAS ID”** (no “(optional)”).
  - User cannot continue past Step 1 without a UCAS ID.
- **Admin view**:
  - `src/pages/admin/ApplicationDetail.tsx` Step 1 card shows `UCAS ID` value from step 1 payload as before; new requirement guarantees a value for new submissions.

---

### 2. Step 4 – Documentation (New Required Uploads)

**Schema**: `documentationSchema` in `ApplicationWizard.tsx` now includes:

- `uk_citizen: "yes" | "no"` (unchanged, still required).
- `passport_document: string | ""` (optional passport scan / ID document).
- `visa_document: string | ""` (required only when `uk_citizen === "no"`).
- **New – required for all students**:
  - `passport_photo: string` – **Student Passport Photo** (profile-style check‑in photo).
  - `student_proof: string` – **Student Proof Document** (UCAS confirmation, uni letter, etc.).

**Defaults / hydration**:

- Step 4 defaults now read from:
  - `student_application_steps` step 4 payload, or
  - `rebookingData.step4_data` for rebookings.
- Both `passport_photo` and `student_proof` hydrate like existing fields so editing an existing application repopulates them.

**UI (Step 4)**:

- Uses shared `renderUploadCard` in `ApplicationWizard.tsx`.
- Upload cards order:
  1. **Student Passport Photo** (`passport_photo`) – required.
  2. **Student Proof Document** (`student_proof`) – required.
  3. **Passport (Scan)** (`passport_document`) – optional but encouraged.
  4. **Visa** (`visa_document`) – only visible/required when `uk_citizen === "no"`.

---

### 3. Allowed File Types & Validation

**Applies to**:
- All Step 4 documentation uploads.
- Step 5 guarantor uploads (utility bill, ID, bank statement) via the same upload helper.

**Allowed types**:
- Extensions: `png`, `jpg`, `jpeg`, `webp`, `pdf`, `docx`.
- MIME types:
  - `image/png`
  - `image/jpeg`
  - `image/webp`
  - `application/pdf`
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

**Implementation**:

- `handleUploadClick` in `ApplicationWizard.tsx`:
  - `input.accept` is restricted to the MIME types above.
  - On file selection:
    - Reads extension and MIME type.
    - Rejects any file that doesn’t match the allowed list.
    - Shows a destructive toast: “Please upload a PNG, JPG, WEBP, PDF, or DOCX file.”
- Preview behaviour:
  - Only image types render as thumbnail previews.
  - `pdf/docx` are stored and shown as uploaded but only downloadable (no inline image preview).

---

### 4. Student Documents – Database & Sync

**Storage**:

- Bucket: `documents` (private, RLS‑protected; see `STORAGE_BUCKET_SETUP_INSTRUCTIONS.md`).
- Path format (unchanged):
  - `documents/{user_id}/{application_id}/{key}-{uuid}-{filename}`

**`student_documents` table**:

- Key `document_type` values now include:
  - `passport` – from `passport_document`.
  - `visa` – from `visa_document`.
  - **`passport_photo`** – from `passport_photo` (Step 4).
  - **`student_proof`** – from `student_proof` (Step 4).
  - `utility_bill`, `id_document`, `bank_statement` – from Step 5 fields.

**Step 4 submission logic** (`handleDocumentationSubmit`):

- After successful zod validation and sanitisation:
  - If `passport_document` is set → insert/update `student_documents` with `document_type = "passport"`.
  - If `passport_photo` is set → insert/update with `document_type = "passport_photo"`.
  - If `student_proof` is set → insert/update with `document_type = "student_proof"`.
  - If `visa_document` is set **and** `uk_citizen !== "yes"` → `document_type = "visa"`.
  - Existing dedupe logic uses `storage_path` to avoid duplicates when resaving the step.

**Portal Documents sync** (`src/pages/portal/Documents.tsx`):

- When the student clicks “Sync Documents”, the system:
  - Loads each application’s `student_application_steps` 4 & 5 payloads.
  - Builds `documentsToSave` including, now:
    - `passport_photo` → `document_type = "passport_photo"`.
    - `student_proof` → `document_type = "student_proof"`.
  - Skips any document whose `storage_path` already exists in `student_documents` for that application.

---

### 5. Bulk Application Import – CSV & SQL

**Database function**: `bulk_import_student_applications`  
**File**: `supabase/migrations/20251125_bulk_import_applications.sql`

- New internal variables:
  - `v_passport_photo_path TEXT`
  - `v_student_proof_path TEXT`
- Step 4 payload now built as:
  - `uk_citizen`, `passport_document`, `visa_document` (existing).
  - `passport_photo` from `passport_photo_path` (CSV).
  - `student_proof` from `student_proof_path` (CSV).
- Document creation:
  - Creates `student_documents` rows when paths are present for:
    - `passport` (existing).
    - `visa` (existing).
    - **`passport_photo`** (new).
    - **`student_proof`** (new).
    - `utility_bill`, `id_document`, `bank_statement` (existing).
  - All imported docs:
    - `status = 'approved'`
    - `uploaded_by = p_imported_by`
    - `verified_by = p_imported_by`

**CSV Template Generator**: `generateApplicationsTemplate`  
**File**: `src/utils/csvTemplateGenerator.ts`

- Headers extended:
  - Documents section now has **8** path columns:
    - `passport_path`
    - `visa_path`
    - `passport_photo_path`
    - `student_proof_path`
    - `utility_bill_path`
    - `id_document_path`
    - `bank_statement_path`
    - `contract_pdf_path`
- Total columns increased from **43 → 45** to account for the two new document paths.
- Example rows:
  - Demo data fills `passport_photo_path` and `student_proof_path` using the existing placeholder path constant used for other doc paths.
- Export from live data:
  - For `passport_photo_path`:
    - Prefers `student_documents.passport_photo` if present, otherwise Step 4 `passport_photo`.
  - For `student_proof_path`:
    - Prefers `student_documents.student_proof`, otherwise Step 4 `student_proof`.

---

### 6. Admin Application Review – Student Photo Preview

**File**: `src/pages/admin/ApplicationDetail.tsx`

- **Step 1 card header**:
  - Shows “Student Photo” on the right with:
    - Avatar sourced from `student_documents` record where `document_type = 'passport_photo'` and `storage_path` has an image extension (`png/jpg/jpeg/webp`).
    - If found:
      - Creates a signed URL from the `documents` bucket.
      - Uses that URL as `AvatarImage`.
      - Displays a small “Click to preview” hint under “Student Photo”.
    - If not found or non-image:
      - Falls back to `AvatarFallback` with initials from Step 1 (first/last name).
- **Clickable preview dialog**:
  - Clicking the avatar when a `passportPhotoUrl` exists:
    - Opens a `Dialog` titled **“Student Photo”**.
    - Shows a large preview image (`img`) with:
      - `max-height: ~70vh`
      - Rounded corners and shadow.
  - When there’s no image (e.g., only PDF/DOCX), clicking does nothing and no dialog is shown.

---

### 7. Behaviour Summary (End‑to‑End)

- **Students**:
  - Must provide UCAS ID in Step 1.
  - Must upload:
    - A student passport photo (image recommended).
    - A proof-of-student-status document.
  - Optional additional uploads: passport scan and visa (conditional).
  - Can view/sync all documents, including new ones, on the Documents page.

- **Admins / Operations**:
  - Bulk import can seed:
    - `passport_photo` and `student_proof` via `passport_photo_path` and `student_proof_path`.
  - `student_documents` provides consistent document records for all doc types.
  - Application Review:
    - Step 1 clearly shows UCAS and a visual **Student Photo** with click‑to‑preview.
    - Documents card lists all document types with their statuses for verification.


