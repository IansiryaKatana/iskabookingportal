# Company Name Not Replacing in Bulk/Targeted Messages - Assessment & Fix

**Date:** 2025-01-28  
**Issue:** `{company_name}` placeholder not being replaced in bulk messages and targeted messages  
**Status:** Identified - Ready for Fix

---

## Problem Summary

When sending bulk messages or targeted messages, the `{company_name}` placeholder from branding settings is not being replaced in email templates. The company name is fetched from the database but not added to the template variable replacement list.

---

## Root Cause Analysis

### Issue Location: `supabase/functions/send-bulk-message/index.ts`

**Current Code Flow:**

1. **Line 389-395:** Company name is successfully fetched from `branding_settings` table
   ```typescript
   const { data: brandingSettings } = await supabaseClient
     .from("branding_settings")
     .select("setting_value")
     .eq("setting_key", "company_name")
     .single();
   const companyName = brandingSettings?.setting_value || "StudentStaySolutions";
   ```

2. **Line 497-507:** The `replacements` object is defined but **MISSING** `company_name`:
   ```typescript
   const replacements: Record<string, string> = {
     "{student_name}": studentName,
     "{title}": title,
     "{message}": message,
     "{date}": new Date().toLocaleDateString(),
     "{studio_number}": studioNumber,
     "{contract_start}": contractStart,
     "{contract_end}": contractEnd,
     "{application_id}": applicationId,
     "{portal_url}": portalUrl,
     // ❌ MISSING: "{company_name}": companyName,
   };
   ```

3. **Line 545:** `companyName` is only used for email "from" formatting, not template replacement:
   ```typescript
   const formattedFromEmail = fromEmail.includes("<") ? fromEmail : `${companyName} <${fromEmail}>`;
   ```

### Comparison with Working Functions

**`send-transactional-email/index.ts` (WORKING):**
- ✅ Fetches company name (line 90-96)
- ✅ Adds to variables object (line 164-165): `company_name: companyName`
- ✅ Uses comprehensive replacement function that handles `{variable}` and `[variable]` formats
- ✅ Supports case-insensitive replacement

**`send-confirmation-email/index.ts` (WORKING):**
- ✅ Fetches company name (line 70-82)
- ✅ Adds to variables object (line 246): `company_name: companyName`
- ✅ Uses comprehensive replacement function

**`send-bulk-message/index.ts` (BROKEN):**
- ✅ Fetches company name (line 389-395)
- ❌ **Does NOT add to replacements object**
- ❌ Uses simple replacement that only handles exact `{variable}` format

---

## Impact Assessment

### Affected Features:
1. **Bulk Messages** - All bulk messages sent to confirmed students
2. **Targeted Messages** - All targeted messages sent to specific students or filtered groups
3. **Email Templates** - Any template using `{company_name}`, `{COMPANY_NAME}`, or `[company_name]`

### User Experience:
- Email templates show literal `{company_name}` text instead of actual company name
- Unprofessional appearance in emails
- Inconsistent with other email functions that work correctly

---

## Recommendations

### Option 1: Quick Fix - Add Company Name to Replacements (RECOMMENDED)

**Pros:**
- ✅ Minimal code change
- ✅ Quick to implement
- ✅ Low risk
- ✅ Maintains current replacement logic

**Cons:**
- ⚠️ Doesn't improve replacement function (still only handles `{variable}` format)
- ⚠️ Doesn't match the more robust replacement used in other functions

**Implementation:**
```typescript
// In replaceVariables function, add to replacements object:
const replacements: Record<string, string> = {
  "{student_name}": studentName,
  "{title}": title,
  "{message}": message,
  "{date}": new Date().toLocaleDateString(),
  "{studio_number}": studioNumber,
  "{contract_start}": contractStart,
  "{contract_end}": contractEnd,
  "{application_id}": applicationId,
  "{portal_url}": portalUrl,
  "{company_name}": companyName,  // ✅ ADD THIS
  "{COMPANY_NAME}": companyName.toUpperCase(),  // ✅ ADD THIS (for uppercase variant)
};
```

**Estimated Time:** 5 minutes  
**Risk Level:** Low

---

### Option 2: Comprehensive Fix - Align with Other Functions (BEST PRACTICE)

**Pros:**
- ✅ Consistent with `send-transactional-email` and `send-confirmation-email`
- ✅ Supports multiple formats: `{variable}`, `[variable]`, case-insensitive
- ✅ More robust replacement (handles edge cases)
- ✅ Future-proof for additional variables
- ✅ Better maintainability

**Cons:**
- ⚠️ More code changes required
- ⚠️ Need to test all replacement scenarios

**Implementation:**
1. Replace the simple `replaceVariables` function with the comprehensive version from `send-transactional-email`
2. Add `company_name` to the variables object
3. Support both `{variable}` and `[variable]` formats
4. Add case-insensitive matching
5. Add multiple pass replacement for nested variables

**Code Changes:**
```typescript
// Replace the entire replaceVariables function with:
const replaceVariables = (text: string, studentId: string): string => {
  if (!text) return "";
  
  let result = text;
  const studentName = studentNameMap.get(studentId) || "Student";
  const application = applicationMap.get(studentId);
  const studioNumber = application?.studios?.studio_number || "TBA";
  const contractStart = application?.contracts?.start_date 
    ? new Date(application.contracts.start_date).toLocaleDateString()
    : "TBA";
  const contractEnd = application?.contracts?.end_date
    ? new Date(application.contracts.end_date).toLocaleDateString()
    : "TBA";
  const applicationId = application?.id || "";
  const portalUrl = Deno.env.get("PORTAL_URL") || 
    `${Deno.env.get("SUPABASE_URL")?.replace("/rest/v1", "") || "https://iskabookingportal.netlify.app"}/portal`;

  // Build comprehensive variables object
  const vars: Record<string, string> = {
    student_name: studentName,
    title: title,
    message: message,
    date: new Date().toLocaleDateString(),
    studio_number: studioNumber,
    contract_start: contractStart,
    contract_end: contractEnd,
    application_id: applicationId,
    portal_url: portalUrl,
    company_name: companyName,  // ✅ ADD THIS
    COMPANY_NAME: companyName.toUpperCase(),  // ✅ ADD THIS
    current_year: new Date().getFullYear().toString(),
  };

  // Comprehensive replacement function (from send-transactional-email)
  for (let pass = 0; pass < 3; pass++) {
    Object.entries(vars).forEach(([key, value]) => {
      const stringValue = String(value || "").trim();
      if (!stringValue) return;
      
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Replace {variable} format - case insensitive, global replace
      result = result.replace(new RegExp(`\\{${escapedKey}\\}`, "gi"), stringValue);
      
      // Replace [variable] format - case insensitive, global replace
      result = result.replace(new RegExp(`\\[${escapedKey}\\]`, "gi"), stringValue);
    });
  }
  
  return result;
};
```

**Estimated Time:** 15-20 minutes  
**Risk Level:** Low-Medium (requires testing)

---

### Option 3: Hybrid Approach - Add Company Name + Improve Replacement

**Pros:**
- ✅ Adds company name immediately (quick fix)
- ✅ Improves replacement function for better consistency
- ✅ Supports multiple variable formats
- ✅ Balances speed and quality

**Cons:**
- ⚠️ More changes than Option 1
- ⚠️ Still requires testing

**Implementation:**
1. Add `company_name` to current replacements (quick fix)
2. Enhance replacement function to support case-insensitive matching
3. Add support for `[variable]` format
4. Keep current structure but improve robustness

**Estimated Time:** 10-15 minutes  
**Risk Level:** Low

---

## Additional Considerations

### Variable Format Support

**Current Implementation:**
- Only supports exact `{variable}` format
- Case-sensitive
- Single pass replacement

**Recommended Support:**
- `{company_name}` - lowercase
- `{COMPANY_NAME}` - uppercase
- `{Company_Name}` - title case
- `[company_name]` - bracket format
- Case-insensitive matching

### Other Missing Variables

While fixing this, consider adding:
- `{current_year}` - Current year (2025)
- `{portal_url}` - Already present ✅
- `{logo_url}` - Already handled separately ✅

### Testing Checklist

After implementing the fix:
1. ✅ Test bulk message with `{company_name}` in subject
2. ✅ Test bulk message with `{company_name}` in body
3. ✅ Test targeted message with `{company_name}`
4. ✅ Test with `{COMPANY_NAME}` (uppercase)
5. ✅ Test with `[company_name]` (bracket format)
6. ✅ Verify company name is correctly fetched from branding_settings
7. ✅ Verify fallback to "StudentStaySolutions" if not found
8. ✅ Test with special characters in company name

---

## Recommended Solution

### **Option 2: Comprehensive Fix (BEST PRACTICE)**

**Reasoning:**
1. **Consistency:** Aligns with other email functions (`send-transactional-email`, `send-confirmation-email`)
2. **Robustness:** Handles multiple variable formats and edge cases
3. **Maintainability:** Easier to add new variables in the future
4. **User Experience:** Supports various template formats users might use
5. **Future-Proof:** Better foundation for additional features

**Implementation Steps:**
1. Update `replaceVariables` function in `send-bulk-message/index.ts`
2. Add `company_name` and `COMPANY_NAME` to variables object
3. Implement comprehensive replacement logic (3 passes, case-insensitive, multiple formats)
4. Test with various template formats
5. Verify with actual bulk/targeted message sending

---

## Alternative: Quick Fix First, Then Comprehensive

If you need an immediate fix:

1. **Phase 1 (5 min):** Add `{company_name}` to replacements object (Option 1)
2. **Phase 2 (15 min):** Upgrade to comprehensive replacement (Option 2)

This approach:
- ✅ Fixes the immediate issue quickly
- ✅ Allows for proper testing of comprehensive solution
- ✅ Minimizes risk of breaking existing functionality

---

## Code Location

**File:** `supabase/functions/send-bulk-message/index.ts`
- **Line 389-395:** Company name fetching (working)
- **Line 478-514:** `replaceVariables` function (needs update)
- **Line 497-507:** `replacements` object (missing company_name)

---

## Related Files

- `supabase/functions/send-transactional-email/index.ts` - Reference implementation (working)
- `supabase/functions/send-confirmation-email/index.ts` - Reference implementation (working)
- `src/pages/admin/BulkMessages.tsx` - UI for bulk messages
- `src/pages/admin/TargetedMessages.tsx` - UI for targeted messages

---

## Decision Matrix

| Option | Time | Risk | Consistency | Robustness | Recommendation |
|--------|------|------|-------------|------------|----------------|
| **Option 1: Quick Fix** | 5 min | Low | Low | Low | ⚠️ Temporary |
| **Option 2: Comprehensive** | 15-20 min | Low-Med | High | High | ✅ **BEST** |
| **Option 3: Hybrid** | 10-15 min | Low | Medium | Medium | ✅ Good |

---

**Status:** Ready for implementation decision

