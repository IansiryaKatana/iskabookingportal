# Email Branding & Custom SMTP Implementation Plan

## Overview
This document outlines the comprehensive plan to implement custom email branding, replace hardcoded company names, and make Resend credentials configurable from the admin settings.

## Current State Analysis

### 1. Hardcoded References Found
- **"Urban Hub" / "UrbanHub"**: Found in 134+ locations across:
  - Edge Functions (27 instances)
  - React Components (107+ instances)
  - Email templates (default templates)
  - Invoice generation
  - Footer/Header components

### 2. Current Email System
- Uses Resend API via `send-transactional-email` Edge Function
- Hardcoded `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in environment variables
- Default domain: `send.portal.urbanhub.uk` (needs update to `send.portal.iankatana.com`)
- Supabase sends confirmation emails automatically (needs to be disabled)

### 3. Database Structure
- `branding_settings`: Key-value store for branding (no `company_name` yet)
- `email_templates`: Template system exists but no confirmation email template
- No credentials table exists

## Implementation Recommendations

### Phase 1: Database Schema Updates

#### 1.1 Add Company Name to Branding Settings
**Migration**: `20251123_add_company_name_to_branding.sql`
```sql
-- Add company_name to branding_settings
INSERT INTO public.branding_settings (setting_key, setting_value, setting_type, description)
VALUES ('company_name', 'Urban Hub', 'text', 'Company name used throughout the system')
ON CONFLICT (setting_key) DO UPDATE 
SET setting_value = 'Urban Hub', updated_at = NOW();
```

#### 1.2 Create Credentials Table
**Migration**: `20251123_create_credentials_table.sql`
```sql
CREATE TABLE IF NOT EXISTS public.credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_key TEXT NOT NULL UNIQUE,
  credential_value TEXT NOT NULL, -- Encrypted or plain (based on security requirements)
  credential_type TEXT NOT NULL DEFAULT 'api_key', -- 'api_key', 'email', 'url', etc.
  description TEXT,
  is_encrypted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credentials_key ON public.credentials(credential_key);

-- RLS Policies
ALTER TABLE public.credentials ENABLE ROW LEVEL SECURITY;

-- Only staff can read credentials
CREATE POLICY "Staff can read credentials" ON public.credentials
  FOR SELECT USING (public.is_staff());

-- Only staff can manage credentials
CREATE POLICY "Staff can manage credentials" ON public.credentials
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Seed initial credentials (will be updated via UI)
INSERT INTO public.credentials (credential_key, credential_value, credential_type, description)
VALUES 
  ('resend_api_key', '', 'api_key', 'Resend API key for sending emails'),
  ('resend_from_email', 'noreply@send.portal.iankatana.com', 'email', 'Default from email address for Resend')
ON CONFLICT (credential_key) DO NOTHING;
```

**Security Consideration**: 
- Option A: Store plain text (simpler, but less secure)
- Option B: Use Supabase Vault for encryption (more secure, requires additional setup)
- **Recommendation**: Start with Option A, migrate to Option B if needed

#### 1.3 Add Confirmation Email Template Type
**Migration**: `20251123_add_confirmation_email_template.sql`
```sql
-- Update email_templates to include 'email_confirmation' type
ALTER TABLE public.email_templates 
DROP CONSTRAINT IF EXISTS email_templates_template_type_check;

ALTER TABLE public.email_templates
ADD CONSTRAINT email_templates_template_type_check 
CHECK (template_type IN (
  'welcome',
  'application_received',
  'deposit_reminder',
  'payment_reminder',
  'overdue_payment',
  'application_confirmed',
  'document_approved',
  'document_rejected',
  'signature_reminder',
  'email_confirmation', -- NEW
  'password_reset', -- NEW (for future use)
  'custom'
));
```

### Phase 2: Edge Functions

#### 2.1 Create `send-confirmation-email` Edge Function
**File**: `supabase/functions/send-confirmation-email/index.ts`

**Features**:
- Fetches branding settings (company name, logo, colors)
- Fetches email confirmation template from `email_templates`
- Generates confirmation link using Supabase Admin API
- Sends via Resend with full branding
- Handles both new user confirmation and password reset flows

**Key Functions**:
```typescript
1. Get branding settings (company_name, logo_path, etc.)
2. Get email template (or use default)
3. Generate confirmation token via Supabase Admin API
4. Replace template variables ({company_name}, {confirmation_link}, etc.)
5. Fetch Resend credentials from database
6. Send email via Resend API
7. Log success/failure
```

#### 2.2 Update Existing Edge Functions
Update all functions that use hardcoded "Urban Hub":
- `send-transactional-email/index.ts`
- `send-bulk-message/index.ts`
- `stripe-webhook/index.ts`
- `docusign-envelopes/index.ts`
- `create-payment/index.ts`

**Pattern**: Fetch `company_name` from `branding_settings` and use it instead of hardcoded values.

### Phase 3: Frontend Updates

#### 3.1 Add Credentials Management to Settings Page
**File**: `src/pages/admin/Settings.tsx`

**New Section**: "Email Credentials"
- Resend API Key input (masked, with show/hide toggle)
- Resend From Email input
- Test connection button
- Save button
- Status indicator (connected/disconnected)

**Security Features**:
- Mask API key input (show as `••••••••`)
- Validate email format
- Test connection before saving
- Show last updated timestamp

#### 3.2 Update Branding Settings Page
**File**: `src/pages/admin/Branding.tsx`

**Add Field**: Company Name
- Text input for company name
- Preview of how it appears in emails
- Save button

#### 3.3 Create Helper Function for Company Name
**File**: `src/hooks/useBranding.ts`

**New Hook**: `useCompanyName()`
```typescript
export const useCompanyName = () => {
  return useQuery({
    queryKey: ['branding', 'company_name'],
    queryFn: async () => {
      const { data } = await supabase
        .from('branding_settings')
        .select('setting_value')
        .eq('setting_key', 'company_name')
        .single();
      return data?.setting_value || 'Urban Hub';
    },
  });
};
```

### Phase 4: Replace Hardcoded References

#### 4.1 Edge Functions (Priority: High)
Files to update:
1. `supabase/functions/send-transactional-email/index.ts`
2. `supabase/functions/send-bulk-message/index.ts`
3. `supabase/functions/stripe-webhook/index.ts`
4. `supabase/functions/docusign-envelopes/index.ts`
5. `supabase/functions/create-payment/index.ts`

**Pattern**:
```typescript
// Before
const companyName = "Urban Hub";

// After
const { data: branding } = await supabase
  .from('branding_settings')
  .select('setting_value')
  .eq('setting_key', 'company_name')
  .single();
const companyName = branding?.setting_value || 'Urban Hub';
```

#### 4.2 React Components (Priority: Medium)
Files to update (sample):
1. `src/components/Footer.tsx`
2. `src/components/Navigation.tsx`
3. `src/components/WhatsAppButton.tsx`
4. `src/pages/admin/EmailTemplates.tsx`
5. `src/utils/invoicePdfGenerator.ts`
6. `src/components/invoice/InvoiceTemplate.tsx`

**Pattern**:
```typescript
// Before
const companyName = "Urban Hub";

// After
const { data: branding } = useBrandingSettings();
const companyName = branding?.company_name || 'Urban Hub';
```

#### 4.3 Email Templates (Priority: High)
**File**: `src/pages/admin/EmailTemplates.tsx`

Update default template generation to use `{company_name}` variable instead of hardcoded "Urban Hub".

### Phase 5: Domain Updates

#### 5.1 Update Domain References
**Files to update**:
1. `supabase/functions/send-transactional-email/index.ts`: `send.portal.urbanhub.uk` → `send.portal.iankatana.com`
2. `supabase/functions/send-bulk-message/index.ts`: Same update
3. Default credential value in migration

### Phase 6: Supabase Configuration

#### 6.1 Disable Supabase Auto-Emails
**Action Required**: Manual configuration in Supabase Dashboard

1. Go to **Authentication** → **Email Templates**
2. For each template (Confirmation, Password Reset, etc.):
   - Toggle "Enable email" to OFF
   - Or set custom SMTP (if using Supabase SMTP)

**Alternative**: Use Supabase webhooks to intercept and replace with custom emails

#### 6.2 Update Auth Configuration
**In Supabase Dashboard**:
- Set `Site URL` to `https://portal.iankatana.com`
- Set `Redirect URLs` to include:
  - `https://portal.iankatana.com/portal/reset-password`
  - `https://portal.iankatana.com/portal/login`

### Phase 7: Email Template Creation

#### 7.1 Create Confirmation Email Template
**Template Type**: `email_confirmation`

**Variables**:
- `{company_name}` - Company name from branding
- `{student_name}` - User's first name
- `{confirmation_link}` - Link to confirm email
- `{logo_url}` - Company logo URL
- `{support_email}` - Support email from branding

**Design**:
- Match existing email template design
- Include logo at top
- Clear call-to-action button
- Professional footer with company info

## Implementation Questions & Decisions Needed

### Question 1: Credentials Storage Security
**Options**:
- **A) Plain text in database** (simpler, faster to implement)
- **B) Supabase Vault encryption** (more secure, requires setup)
- **C) Environment variables only** (most secure, but not configurable via UI)

**Recommendation**: Start with **Option A** for MVP, migrate to **Option B** for production if security is a concern.

### Question 2: Email Template Defaults
**Options**:
- **A) Create default confirmation template in migration** (ensures it exists)
- **B) Generate template on first use** (dynamic creation)
- **C) Use hardcoded fallback if template missing** (simpler)

**Recommendation**: **Option A** - Create a beautiful default template in migration, allow customization via UI.

### Question 3: Company Name Fallback
**Options**:
- **A) Hardcoded fallback "Urban Hub"** (safe, but defeats purpose)
- **B) Require company name to be set** (strict, better UX)
- **C) Use domain-based fallback** (e.g., "Portal" from portal.iankatana.com)

**Recommendation**: **Option A** for now, with admin warning if not set.

### Question 4: Update Strategy for Hardcoded References
**Options**:
- **A) Update all at once** (comprehensive, but large PR)
- **B) Update incrementally by priority** (safer, but longer timeline)
- **C) Update only critical paths first** (fastest, but incomplete)

**Recommendation**: **Option B** - Update by priority:
1. Edge Functions (emails)
2. Email templates
3. Invoice generation
4. UI components

### Question 5: Resend Domain Verification
**Action Required**: 
- Verify `send.portal.iankatana.com` domain in Resend dashboard
- Update DNS records if needed
- Test email delivery

## Implementation Order

### Week 1: Foundation
1. ✅ Database migrations (company_name, credentials table)
2. ✅ Create confirmation email template
3. ✅ Update domain references
4. ✅ Create `send-confirmation-email` Edge Function

### Week 2: Integration
5. ✅ Update Settings page with credentials management
6. ✅ Update Branding page with company name
7. ✅ Update `send-transactional-email` to use branding
8. ✅ Test confirmation email flow

### Week 3: Hardcoded References
9. ✅ Update Edge Functions (high priority)
10. ✅ Update email templates
11. ✅ Update invoice generation
12. ✅ Update UI components (medium priority)

### Week 4: Testing & Polish
13. ✅ End-to-end testing
14. ✅ Update documentation
15. ✅ Disable Supabase auto-emails
16. ✅ Production deployment

## Testing Checklist

- [ ] Company name updates reflect in all emails
- [ ] Confirmation email sends with correct branding
- [ ] Credentials can be updated via Settings page
- [ ] API key validation works
- [ ] Email delivery works with new domain
- [ ] All hardcoded "Urban Hub" references replaced
- [ ] Invoice generation uses dynamic company name
- [ ] Footer/Header use dynamic company name
- [ ] Email templates use {company_name} variable
- [ ] Fallback works if company name not set

## Security Considerations

1. **API Key Storage**: Consider encryption for production
2. **RLS Policies**: Ensure credentials table is properly secured
3. **Audit Logging**: Log credential changes
4. **Rate Limiting**: Prevent abuse of email sending
5. **Domain Verification**: Ensure Resend domain is verified

## Success Metrics

- ✅ Zero hardcoded "Urban Hub" references in codebase
- ✅ All emails use branding from database
- ✅ Credentials configurable via UI
- ✅ Confirmation emails work end-to-end
- ✅ Domain updated to `send.portal.iankatana.com`

## Next Steps

1. **Review this plan** and provide feedback on questions
2. **Approve implementation order** and timeline
3. **Confirm domain verification** status for Resend
4. **Decide on credentials storage** approach (A/B/C)
5. **Begin Phase 1** implementation

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-23  
**Status**: Awaiting Approval

