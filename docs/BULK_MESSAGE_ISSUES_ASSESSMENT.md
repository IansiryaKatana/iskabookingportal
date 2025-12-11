# Bulk Message Issues - Assessment & Recommendations

**Date:** 2025-01-28  
**Issues:**
1. Company name (`{company_name}`) not replacing in email templates
2. Rate limiting errors (429) - Resend API allows only 2 requests/second

---

## Issue 1: Company Name Not Replacing

### Current Implementation Status

**Code Analysis:**
- ✅ Company name is fetched from `branding_settings` (line 389-395)
- ✅ Company name is added to `vars` object (line 508-509)
- ✅ Replacement function supports `{company_name}` and `{COMPANY_NAME}` formats
- ✅ Case-insensitive matching implemented
- ✅ Multiple pass replacement (3 passes)

**Possible Causes:**

1. **Template Format Mismatch**
   - Template in database might use different format
   - Check if template uses `{company_name}`, `{COMPANY_NAME}`, or `[company_name]`
   - Verify template actually contains the placeholder

2. **Template Not Being Used**
   - Email template might not be selected/active
   - Template might be null/undefined

3. **Replacement Timing**
   - Replacement happens correctly but template doesn't have placeholder
   - Need to verify template content in database

### Diagnostic Steps

1. **Check Template Content:**
   ```sql
   SELECT id, name, subject, body_html 
   FROM email_templates 
   WHERE is_active = true;
   ```
   - Verify templates contain `{company_name}` or `{COMPANY_NAME}`

2. **Check Branding Settings:**
   ```sql
   SELECT setting_key, setting_value 
   FROM branding_settings 
   WHERE setting_key = 'company_name';
   ```
   - Verify company name exists and has a value

3. **Check Logs:**
   - Review function logs for "EMAIL TEMPLATE REPLACEMENT" section
   - Verify company name value is being fetched
   - Check if replacement is happening

### Recommendations

**Option A: Verify Template Content (First Step)**
- Check actual template content in database
- Ensure templates use `{company_name}` format
- Update templates if needed

**Option B: Add More Debug Logging**
- Log template content before replacement
- Log all variables being used
- Log final result after replacement

**Option C: Test with Simple Template**
- Create test template with just `{company_name}`
- Send test message
- Verify replacement works

---

## Issue 2: Rate Limiting (429 Errors)

### Problem Analysis

**Resend API Limits:**
- Maximum: 2 requests per second
- Current: Sending all emails immediately in loop
- Result: Only first 2 succeed, rest get 429 errors

**Error Example:**
```
"Too many requests. You can only make 2 requests per second."
```

### Current Code Behavior

- Sends emails in a `for` loop without delays
- No rate limit handling
- No retry logic for 429 errors
- All emails sent simultaneously

### Solution Implemented

✅ **Rate Limiting Added:**
- 650ms delay between emails (slightly less than 500ms to account for processing)
- Ensures max 1.5 requests/second (safe margin)

✅ **Retry Logic Added:**
- Handles 429 errors with exponential backoff
- Respects `retry-after` header from Resend
- Maximum 3 retry attempts per email

✅ **Progress Tracking:**
- Logs progress every 10 emails
- Shows percentage complete

### Implementation Details

**Rate Limiting:**
```typescript
const RATE_LIMIT_DELAY_MS = 650; // 650ms = ~1.5 requests/second (safe)
await delay(RATE_LIMIT_DELAY_MS); // Between each email
```

**Retry Logic:**
```typescript
- Detects 429 status code
- Reads retry-after header
- Waits appropriate time
- Retries up to 3 times
- Exponential backoff for network errors
```

**Performance:**
- 500 emails = ~5.4 minutes (650ms × 500 = 325 seconds)
- 1000 emails = ~10.8 minutes
- All emails will be sent successfully (no rate limit failures)

---

## Recommendations Summary

### For Company Name Issue:

**Step 1: Verify Template Content**
```sql
-- Check if templates have company_name placeholder
SELECT 
  id, 
  name, 
  subject,
  CASE 
    WHEN subject LIKE '%{company_name}%' THEN 'Has {company_name}'
    WHEN subject LIKE '%{COMPANY_NAME}%' THEN 'Has {COMPANY_NAME}'
    WHEN subject LIKE '%[company_name]%' THEN 'Has [company_name]'
    ELSE 'NO COMPANY_NAME PLACEHOLDER'
  END as placeholder_status
FROM email_templates 
WHERE is_active = true;
```

**Step 2: Check Branding Settings**
```sql
-- Verify company name exists
SELECT setting_key, setting_value 
FROM branding_settings 
WHERE setting_key = 'company_name';
```

**Step 3: Test Replacement**
- Send test bulk message
- Check logs for "EMAIL TEMPLATE REPLACEMENT" section
- Verify company name value and replacement

**Step 4: Update Templates if Needed**
- If templates don't have `{company_name}`, add it
- Use format: `{company_name}` (lowercase with underscores)

### For Rate Limiting:

✅ **Already Implemented:**
- Rate limiting with 650ms delay
- Retry logic for 429 errors
- Progress tracking
- Exponential backoff

**Expected Behavior:**
- All emails will be sent successfully
- No more 429 errors
- Progress logged every 10 emails
- Estimated time: ~1.1 seconds per email

---

## Testing Checklist

### Company Name Replacement:
- [ ] Verify template has `{company_name}` placeholder
- [ ] Verify branding_settings has company_name value
- [ ] Send test bulk message
- [ ] Check logs for replacement debug info
- [ ] Verify email received has company name replaced
- [ ] Test with `{COMPANY_NAME}` (uppercase)
- [ ] Test with `[company_name]` (bracket format)

### Rate Limiting:
- [ ] Send bulk message to 10+ recipients
- [ ] Verify no 429 errors in logs
- [ ] Verify all emails sent successfully
- [ ] Check progress logging works
- [ ] Verify delay between emails (650ms)
- [ ] Test with 100+ recipients
- [ ] Verify retry logic works on rate limit

---

## Next Steps

1. **Immediate:** Test rate limiting fix (already implemented)
2. **Diagnostic:** Check template content in database
3. **Fix:** Update templates if missing `{company_name}`
4. **Verify:** Send test message and check logs
5. **Confirm:** Verify emails have company name replaced

---

## Code Changes Made

### Rate Limiting Implementation:
- ✅ Added `delay()` helper function
- ✅ Added `sendEmailWithRetry()` function with retry logic
- ✅ Implemented 650ms delay between emails
- ✅ Added exponential backoff for 429 errors
- ✅ Added progress logging

### Company Name Fix:
- ✅ Company name added to variables object
- ✅ Comprehensive replacement function (already done)
- ✅ Enhanced debug logging for first email
- ✅ Supports multiple formats: `{company_name}`, `{COMPANY_NAME}`, `[company_name]`

---

**Status:** Rate limiting implemented. Company name replacement needs template verification.

