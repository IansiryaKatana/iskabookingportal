# Bulk OTA Booking Upload – Analysis & Recommendations

## Executive Summary

This document analyses what is required to implement bulk upload of OTA (Online Travel Agency) bookings and provides recommendations to minimise risk and avoid breaking existing behaviour.

---

## 1. Current OTA Bookings System

### 1.1 Schema (`ota_bookings`)

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `external_ref` | TEXT | Yes | Booking reference from channel |
| `channel` | TEXT | Yes | `airbnb`, `booking`, `agoda`, `expedia`, `other` |
| `guest_name` | TEXT | Yes | |
| `guest_phone` | TEXT | No | |
| `guest_email` | TEXT | No | |
| `studio_id` | UUID | No | References `studios.id`; nullable until allocated |
| `check_in` | DATE | Yes | |
| `check_out` | DATE | Yes | Must be > check_in |
| `status` | TEXT | Yes | Default `arriving`. Allowed: `arriving`, `expected_arrivals`, `pre_check_in`, `checked_in`, `in_house_guest`, `day_use`, `checked_out`, `expected_departures`, `departing`, `no_show`, `cancelled` |
| `notes` | TEXT | No | |
| `internal_notes` | TEXT | No | Staff-only |
| `price_per_night` | DECIMAL | No | |
| `commission_amount` | DECIMAL | No | |
| `currency` | TEXT | No | Default `GBP` |
| `number_of_nights` | INTEGER | Auto | Calculated from check_in/check_out by trigger |
| `total_revenue` | DECIMAL | Auto | Calculated by trigger when price/commission set |
| `created_by` | UUID | No | Set by system from auth |
| `created_at` | TIMESTAMPTZ | Auto | |
| `updated_at` | TIMESTAMPTZ | Auto | |

**Unique constraint:** `UNIQUE(external_ref, channel)` — duplicate `(external_ref, channel)` will fail on insert.

### 1.2 Triggers & Side Effects

1. **`ota_bookings_calculate_financials_trigger`**  
   - Fires on INSERT/UPDATE of `check_in`, `check_out`, `price_per_night`, `commission_amount`.  
   - Calculates `number_of_nights` and `total_revenue`.  
   - No change needed for bulk import.

2. **`sync_ota_status_to_housekeeping`**  
   - When `studio_id` is set and status in `checked_in`, `in_house_guest`, `day_use` → sets housekeeping to `occupied`.  
   - When status `checked_out` → sets housekeeping to `dirty`.  
   - Respects out-of-order; out of order takes precedence.  
   - Runs automatically on insert/update. No code changes needed.

3. **`ota_bookings_updated_at`**  
   - Maintains `updated_at`. No change needed.

### 1.3 RLS

- `ota_bookings` is staff-only via `public.is_staff()`.  
- Bulk import will use the service role client, which bypasses RLS. No RLS changes required.

### 1.4 UI & Hooks

- **OTABookingsDashboard** – list, filter, create, update bookings.  
- **OTABookingChartPage** – calendar view.  
- **OTAStudioAllocationPage** – allocate studios to bookings. Uses studios with `allocation = 'OTA'`.  
- **OTAFinancePage** – finance view.  
- **useOTABookings**, **useCreateOTABooking**, **useUpdateOTABooking** – existing hooks; bulk upload will not call these.

---

## 2. Dependencies & Integrations

### 2.1 Studios

- `studio_id` in `ota_bookings` references `studios.id`.
- CSV will likely use `studio_number` (e.g. `"101"`, `"A-02"`); we must resolve to `studios.id`.
- Studios must exist; lookup by `studio_number` is unique per grade.
- Studio allocation (`allocation = 'OTA'`) is independent of the booking; allocation is set on the studio, not via the booking. Bulk import can leave `studio_id` null and staff can allocate later, or allocate during import if the studio exists.

### 2.2 Housekeeping

- Trigger updates `housekeeping_status` when a booking with `studio_id` is inserted/updated and status is in `checked_in`, `in_house_guest`, `day_use`, or `checked_out`.
- No extra logic needed for bulk upload.

### 2.3 Activity Log

- Trigger inserts activity when OTA status or studio changes.
- Bulk import will generate activity for each row that triggers sync. Acceptable for bulk imports.

---

## 3. Bulk Import Patterns in the Codebase

### 3.1 DataImport Page (`src/pages/admin/DataImport.tsx`)

- User selects import type, uploads CSV, optionally downloads a template.
- Calls `bulk-import-data` edge function with `import_type` and CSV content.
- Uses `ImportResultsDialog` to show success/failure summary.

### 3.2 bulk-import-data Edge Function

- Supports: `academic_years`, `studio_grades`, `studios`, `studio_grade_prices`, `payment_plans`, `payment_plan_installments`, `contracts`, `partners`, `cashback_campaigns`, `applications`.
- Parses CSV, validates rows, inserts via Supabase client (service role).
- For applications: uses RPC `bulk_import_student_applications` because of complex logic and user creation.
- Options: `validate_only`, `skip_duplicates`, `dry_run`, `create_users`, `send_welcome_email`.

### 3.3 csvTemplateGenerator

- Generates templates with headers and optional example rows for each import type.
- Uses `getTemplateGenerator()` and `downloadCSV()`.

---

## 4. Implementation Options

### Option A: Extend bulk-import-data Edge Function (Recommended)

**Idea:** Add `ota_bookings` as a new `import_type` and handle it inside the existing edge function.

**Pros:**

- Reuses existing upload UI and flow.
- Single place for CSV parsing and validation.
- Matches other import types.
- No new pages or routes.

**Cons:**

- Edge function becomes larger.
- Need to parse and validate OTA-specific fields.

**Effort:** Medium.

### Option B: Dedicated RPC + Edge Function

**Idea:** Add `bulk_import_ota_bookings(p_rows JSONB, p_options JSONB)` RPC and call it from `bulk-import-data` for `ota_bookings`.

**Pros:**

- Validation and inserts in the database.
- One transaction for the whole import.
- Easier to handle conflicts and duplicates in SQL.

**Cons:**

- Extra migration.
- More moving parts.

**Effort:** Medium–High.

### Option C: Standalone OTA Bulk Upload Page

**Idea:** New page under OTA (e.g. `/admin/ota-bookings/bulk-upload`) with its own upload and parsing.

**Pros:**

- Keeps OTA logic separate.
- Can add OTA-specific validation and UX.

**Cons:**

- Different pattern from DataImport.
- Duplicate CSV parsing and template generation if not shared.
- More surface area for bugs.

**Effort:** Higher.

---

## 5. Recommendations

### 5.1 Recommended Approach: Option A (Extend bulk-import-data)

1. Add `ota_bookings` to `IMPORT_TYPES` in `DataImport.tsx`.
2. Add `generateOTABookingsTemplate()` to `csvTemplateGenerator.ts`.
3. Extend `bulk-import-data` to handle `import_type: "ota_bookings"`:
   - Parse CSV rows.
   - Validate required fields and enums.
   - Resolve `studio_number` → `studio_id` where provided.
   - Handle duplicates via `skip_duplicates` (ON CONFLICT DO NOTHING or skip row).
   - Insert rows with `created_by` from caller (staff).
4. Add `ota_bookings` to `getTemplateGenerator()`.
5. Document CSV format and validation rules.

### 5.2 CSV Format

Proposed headers (order flexible; headers used as column names):

- `external_ref` (required)
- `channel` (required) – `airbnb` | `booking` | `agoda` | `expedia` | `other`
- `guest_name` (required)
- `guest_phone` (optional)
- `guest_email` (optional)
- `studio_number` (optional) – resolved to `studio_id`; ignored if invalid or not found
- `check_in` (required) – `YYYY-MM-DD`
- `check_out` (required) – `YYYY-MM-DD`; must be after `check_in`
- `status` (optional) – default `arriving` if empty
- `notes` (optional)
- `internal_notes` (optional)
- `price_per_night` (optional)
- `commission_amount` (optional)
- `currency` (optional) – default `GBP`

### 5.3 Duplicate Handling

- Unique constraint: `(external_ref, channel)`.
- **Recommendation:** Support `skip_duplicates: true` to skip rows that would violate the constraint (or use `ON CONFLICT DO NOTHING`).
- When `skip_duplicates: false`, treat duplicate `(external_ref, channel)` as an error for that row.
- Report skipped/error rows in the result summary.

### 5.4 Studio Resolution

- If `studio_number` is provided:
  - Look up `studios` by `studio_number` (must be unique).
  - If found, set `studio_id`; if not found, either leave `studio_id` null and continue, or optionally mark row as warning (recommended: leave null and continue).
- Do not change `studios.allocation` during import; allocation is managed separately.

### 5.5 Date Validation

- `check_in` and `check_out` must be valid dates.
- `check_out` must be strictly after `check_in`.
- Reject invalid rows and include them in the error report.

### 5.6 Safeguards to Avoid Breaking Behaviour

1. **No changes to existing triggers or RLS** – triggers already handle inserts correctly.
2. **No changes to existing OTA UI or hooks** – bulk import is additive.
3. **Validate before insert** – fail fast per row; do not partially apply invalid data.
4. **Dry run / validate_only** – support the same options as other imports for safe testing.
5. **Studio resolution** – only read studios; never update them during OTA import.
6. **Ids** – use `gen_random_uuid()` for new rows; do not accept or generate conflicting IDs.

---

## 6. Risk Assessment

| Risk | Mitigation |
|------|------------|
| Duplicate `(external_ref, channel)` | Implement `skip_duplicates` and/or ON CONFLICT; clear error messages |
| Invalid dates | Validate before insert; reject row and report |
| Invalid channel/status | Validate against allowed enum values; reject row and report |
| Invalid studio_number | Lookup; if not found, set `studio_id` null and optionally warn; do not fail whole import |
| Performance for large files | Process in batches (e.g. 50–100 rows); consider streaming if needed |
| Trigger load | Triggers run per row; acceptable for typical OTA import size (e.g. &lt;500 rows) |
| Housekeeping sync | Triggers handle it; ensure no unexpected housekeeping states from bulk data |

---

## 7. Suggested Implementation Order

1. Add `generateOTABookingsTemplate()` and wire into `getTemplateGenerator()`.
2. Add `ota_bookings` to `IMPORT_TYPES` in `DataImport.tsx`.
3. Implement `ota_bookings` handler in `bulk-import-data`:
   - Parse and validate.
   - Resolve `studio_number` → `studio_id`.
   - Handle duplicates.
   - Insert with `created_by`.
4. Add tests or manual checks for:
   - Valid import.
   - Duplicate handling.
   - Invalid dates.
   - Invalid channel/status.
   - Unknown studio_number.
5. Document CSV format and options.

---

## 8. Out of Scope (For Later)

- Updating existing OTA bookings from CSV (upsert by `external_ref` + `channel`).
- Automatically setting `studios.allocation = 'OTA'` when a studio is used in an OTA booking.
- API/Channel Manager integrations (Airbnb, Booking.com APIs).

---

## 9. Summary

Implementing bulk OTA booking upload via Option A (extend `bulk-import-data`) is the most consistent and lowest-risk approach. It reuses existing patterns, avoids changes to triggers/RLS/UI, and can be implemented incrementally with validation, duplicate handling, and clear error reporting. Studio resolution by `studio_number` and optional allocation can be added without altering core OTA or housekeeping behaviour.
