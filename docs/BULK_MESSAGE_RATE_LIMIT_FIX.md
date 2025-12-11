# Bulk Message Rate Limiting & Company Name Fix

**Date:** 2025-01-28  
**Issues:**
1. Company name not replacing in email templates
2. Rate limiting errors (429) when sending multiple emails - Resend allows only 2 requests/second

---

## Issue Analysis

### Issue 1: Company Name Not Replacing
- **Status:** Code looks correct, but may need verification
- **Possible causes:**
  - Template in database uses different format
  - Replacement happens but template doesn't have placeholder
  - Case sensitivity issues

### Issue 2: Rate Limiting (429 Errors)
- **Root Cause:** Resend API allows only 2 requests per second
- **Current Behavior:** Sends all emails immediately in a loop
- **Impact:** Only 2 emails succeed, rest fail with 429 errors
- **Required:** Queue emails and send at max 2 per second (500ms delay)

---

## Recommendations

### Option 1: Simple Rate Limiting (Quick Fix)
- Add 500ms delay between emails
- Handle 429 errors with retry
- **Time:** 10 minutes
- **Risk:** Low

### Option 2: Advanced Queue System (Best Practice)
- Implement proper queue with exponential backoff
- Handle rate limit headers from Resend
- Batch processing with progress tracking
- **Time:** 30-45 minutes
- **Risk:** Medium

### Option 3: Hybrid Approach (Recommended)
- Add rate limiting with delay
- Implement retry logic for 429 errors
- Add progress tracking
- **Time:** 20 minutes
- **Risk:** Low-Medium

---

**Recommendation:** Option 3 (Hybrid Approach)

