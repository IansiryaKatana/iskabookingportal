# DocuSign Template Management - Recommendations

## Current Problem

**Issue**: DocuSign templates are hardcoded as environment variables (`DOCUSIGN_TENANCY_TEMPLATE_ID` and `DOCUSIGN_GUARANTOR_TEMPLATE_ID`). When a new academic year is added, students still use the previous year's templates because the system doesn't know which templates belong to which academic year.

**Impact**: 
- All tenancy and guarantor agreements are different every year
- Cannot hardcode templates every year
- Risk of students signing wrong year's agreements

## Current Implementation

**Location**: `supabase/functions/docusign-envelopes/index.ts`

**Current Flow**:
1. Function receives `applicationId`
2. Fetches application with contract (which has `academic_year_id`)
3. **Uses hardcoded template IDs from environment variables** (lines 548, 623)
4. Creates envelopes with these templates

**Problem Lines**:
- Line 33-34: Templates loaded from env vars
- Line 548: `templateId: config.tenancyTemplateId` (hardcoded)
- Line 623: `templateId: config.guarantorTemplateId` (hardcoded)

## Recommended Solution

### Option 1: Database-Driven Template Management (RECOMMENDED)

Create a `docusign_templates` table to store template IDs per academic year.

#### 1. Database Schema

```sql
-- Migration: Create docusign_templates table
CREATE TABLE public.docusign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  template_type text NOT NULL CHECK (template_type IN ('tenancy', 'guarantor')),
  template_id text NOT NULL, -- DocuSign template ID (GUID)
  role_names jsonb, -- Store role names like {"student": "Tenant", "witness": "Witness", "guarantor": "Guarantor"}
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(academic_year_id, template_type)
);

-- Index for fast lookups
CREATE INDEX docusign_templates_academic_year_idx 
  ON public.docusign_templates(academic_year_id, template_type) 
  WHERE is_active = true;

-- RLS Policies
ALTER TABLE public.docusign_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active templates" ON public.docusign_templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "Staff manage templates" ON public.docusign_templates
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Trigger for updated_at
CREATE TRIGGER set_timestamp_docusign_templates
BEFORE UPDATE ON public.docusign_templates
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();
```

#### 2. Update Edge Function

Modify `supabase/functions/docusign-envelopes/index.ts`:

```typescript
// After fetching application (around line 294)
const academicYearId = application.contract?.academic_year_id;

if (!academicYearId) {
  return new Response(
    JSON.stringify({ error: "Application contract missing academic year" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Fetch templates for this academic year
const { data: templates, error: templatesError } = await supabaseAdmin
  .from("docusign_templates")
  .select("template_id, template_type, role_names")
  .eq("academic_year_id", academicYearId)
  .eq("is_active", true);

if (templatesError || !templates) {
  return new Response(
    JSON.stringify({ 
      error: "DocuSign templates not configured for this academic year. Please contact support." 
    }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

const tenancyTemplate = templates.find(t => t.template_type === 'tenancy');
const guarantorTemplate = templates.find(t => t.template_type === 'guarantor');

if (!tenancyTemplate) {
  return new Response(
    JSON.stringify({ error: "Tenancy template not found for this academic year" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Use dynamic role names if provided, otherwise fall back to config defaults
const roleNames = tenancyTemplate.role_names as any;
const tenancyStudentRole = roleNames?.student || config.tenancyStudentRole;
const tenancyWitnessRole = roleNames?.witness || config.tenancyWitnessRole;
const guarantorRole = guarantorTemplate?.role_names?.guarantor || config.guarantorRole;

// Update line 548 to use dynamic template
const tenancyBody = {
  templateId: tenancyTemplate.template_id, // Use from database
  status: "sent",
  emailSubject: `Urban Hub tenancy agreement – ${application.contract?.studio_grade?.name ?? "Urban Hub"}`,
  templateRoles: tenancyRecipients,
};

// Update line 623 to use dynamic template
if (requiresGuarantor) {
  if (!guarantorTemplate) {
    return new Response(
      JSON.stringify({ error: "Guarantor template not found for this academic year" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  const guarantorBody = {
    templateId: guarantorTemplate.template_id, // Use from database
    status: "sent",
    emailSubject: `Urban Hub guarantor agreement – ${studentName || "Student"}`,
    templateRoles: guarantorRecipients,
  };
  // ... rest of guarantor envelope creation
}
```

#### 3. Admin Interface

Create admin page at `/admin/docusign-templates`:

**Features**:
- List all academic years with their templates
- Add/Edit templates per academic year
- Form fields:
  - Academic Year (dropdown)
  - Template Type (Tenancy / Guarantor)
  - DocuSign Template ID (text input with validation)
  - Role Names (optional JSON editor or separate fields)
    - Student Role (default: "Tenant")
    - Witness Role (default: "Witness")
    - Guarantor Role (default: "Guarantor")
- Validation:
  - Template ID must be valid GUID format
  - Can verify template exists in DocuSign (optional API call)
  - One template per type per academic year
- Display:
  - Show template status (active/inactive)
  - Show last updated date
  - Show who created/updated it

**UI Components Needed**:
- Table showing: Academic Year | Tenancy Template ID | Guarantor Template ID | Actions
- Add/Edit dialog with form
- Template ID validation
- Link to DocuSign dashboard to find template IDs

### Option 2: Fallback to Environment Variables

Keep environment variables as fallback for backward compatibility:

```typescript
// In edge function, after fetching from database:
const tenancyTemplateId = tenancyTemplate?.template_id || config.tenancyTemplateId;
const guarantorTemplateId = guarantorTemplate?.template_id || config.guarantorTemplateId;

// Log warning if using fallback
if (!tenancyTemplate) {
  console.warn(`No tenancy template found for academic year ${academicYearId}, using default from env`);
}
```

**Pros**: 
- Backward compatible
- Works if templates not configured for new year

**Cons**: 
- Can still use wrong templates if not configured
- Less explicit

### Option 3: Contract-Level Templates

Store templates directly on contracts table:

```sql
ALTER TABLE public.contracts 
  ADD COLUMN tenancy_template_id text,
  ADD COLUMN guarantor_template_id text;
```

**Pros**: 
- Most granular control
- Can have different templates per contract

**Cons**: 
- More complex
- Usually templates are per academic year, not per contract
- More fields to manage

## Recommended Implementation Steps

1. **Create Migration** (`supabase/migrations/YYYYMMDD_docusign_templates_per_academic_year.sql`)
   - Create `docusign_templates` table
   - Add RLS policies
   - Seed initial data from current env vars (optional)

2. **Update Edge Function**
   - Modify `docusign-envelopes/index.ts` to fetch templates from database
   - Add error handling for missing templates
   - Keep env vars as fallback (Option 2)

3. **Create Admin Interface**
   - New page: `src/pages/admin/DocuSignTemplates.tsx`
   - Add to admin navigation
   - CRUD operations for templates

4. **Testing**
   - Test with multiple academic years
   - Verify correct templates are used
   - Test error handling for missing templates

5. **Documentation**
   - Update `docs/INTEGRATION_CREDENTIALS.md`
   - Add instructions for setting up templates per academic year
   - Document admin interface usage

## Migration Strategy

1. **Phase 1**: Create table, keep env vars as primary source
2. **Phase 2**: Migrate existing templates to database
3. **Phase 3**: Update edge function to use database
4. **Phase 4**: Remove env vars (or keep as fallback)

## Example Admin UI Flow

1. Admin goes to "DocuSign Templates" page
2. Sees list of academic years
3. For each year, sees:
   - ✅ Tenancy Template: `abc-123-def-456` (Active)
   - ✅ Guarantor Template: `xyz-789-uvw-012` (Active)
4. Clicks "Edit" for 2026/2027
5. Updates template IDs if needed
6. Saves
7. Next student application for 2026/2027 uses new templates automatically

## Benefits

✅ **Dynamic**: Templates managed per academic year  
✅ **Scalable**: Easy to add new years  
✅ **Safe**: No risk of using wrong templates  
✅ **Maintainable**: Admin can update without code changes  
✅ **Auditable**: Track who changed templates and when  

## Next Steps

1. Review and approve this recommendation
2. Create database migration
3. Update edge function
4. Build admin interface
5. Test thoroughly
6. Deploy

