# DocuSign Envelope Creation - Debugging Guide

## Understanding the Flow

### When Envelopes Are Created
- **Envelopes are created when Step 5 is submitted** (Payment Plan & Guarantor step)
- The `docusign-envelopes` function is called at this point
- Data should be populated into the document at this time

### When "Sign Tenancy Agreement" Button is Clicked
- This button **only opens an existing signing URL**
- It calls `docusign-recipient-view` function (NOT `docusign-envelopes`)
- **No new envelope is created** - it just opens the existing one
- **No data is populated** at this point - data was already set when envelope was created

---

## The Problem

If you click "Sign tenancy agreement" and the document loads but has no data, it means:
- The envelope was already created (from Step 5 submission)
- The data wasn't populated correctly when the envelope was created
- You need to check the logs from **when Step 5 was submitted**, not when you clicked the button

---

## How to Debug

### Step 1: Check Logs from Step 5 Submission

1. Go to **Supabase Dashboard** → **Edge Functions** → **`docusign-envelopes`**
2. Click **"Logs"** tab
3. Look for logs from **when you submitted Step 5** (not when you clicked "Sign tenancy agreement")
4. Look for these log entries:
   - `"DocuSign data calculation results"` - Shows if data was calculated
   - `"DocuSign tabs structure"` - Shows what tabs were sent
   - `"Sending DocuSign envelope"` - Shows the final payload

### Step 2: Verify Data Was Calculated

In the logs, check `"DocuSign data calculation results"`:
```json
{
  "weeklyRate": 205,           // Should be a number
  "depositAmount": 99,         // Should be a number
  "totalContractValue": 9225,  // Should be a number
  "planSummary": "...",        // Should have payment details
  "textTabsCount": 9,          // Should be 9 tabs
  "textTabs": [...]            // Should show all tab labels and values
}
```

**If any values are `null` or `undefined`**, that's the problem.

### Step 3: Verify Tabs Were Sent

In the logs, check `"DocuSign tabs structure"`:
```json
{
  "roleName": "Tenant",
  "textTabs": [
    { "label": "academic_year", "value": "26/27" },
    { "label": "weekly_rate", "value": "£205.00" },
    // ... etc
  ]
}
```

**If `textTabs` is empty or missing tabs**, that's the problem.

---

## Solutions

### Solution 1: Recreate the Envelope (Recommended)

Since the envelope was created without data, you need to recreate it:

1. **Delete the existing envelope** (if possible) OR
2. **Go back to Step 5** and resubmit it
3. This will create a new envelope with the correct data

**Note:** You may need to:
- Cancel the current application and start over, OR
- Manually delete the envelope from DocuSign, OR
- Have an admin delete the envelope record from the database

### Solution 2: Check Template Tab Labels

Even if data is being sent, it won't appear if:
- Tab labels don't match exactly (case-sensitive)
- Tabs aren't assigned to the Tenant role
- Tabs aren't pre-placed in the template

**Verify in your DocuSign template:**
- All tabs have exact labels: `academic_year`, `weekly_rate`, etc.
- All tabs are assigned to **Tenant** role
- All tabs are **Text** type (except signature/date)

### Solution 3: Check Function Logs for Errors

Look for any errors in the logs:
- Database query errors
- Calculation errors
- DocuSign API errors

---

## Testing Steps

1. **Create a new test application:**
   - Complete through Step 4
   - Go to Step 5
   - Fill in payment plan and guarantor details
   - **Submit Step 5** (this creates the envelope)

2. **Immediately check Supabase logs:**
   - Go to Edge Functions → `docusign-envelopes` → Logs
   - Look for the most recent log entry
   - Check `"DocuSign data calculation results"`

3. **Verify data was calculated:**
   - All values should be numbers/strings (not null)
   - `textTabsCount` should be 9
   - All tab labels should be present

4. **Go to Step 6:**
   - Click "Sign tenancy agreement"
   - Check if data appears in the document

---

## Common Issues

### Issue 1: Data Not Calculated
**Symptoms:** Logs show `null` or `undefined` values
**Causes:**
- Contract data not loaded correctly
- Payment plan not selected
- Studio grade prices not configured

**Fix:** Check database - ensure:
- Contract has `weekly_price_override` or `studio_grade_prices` has `weekly_price`
- Payment plan has `deposit_amount`
- Application has `selected_payment_plan_id`

### Issue 2: Tabs Not Sent
**Symptoms:** Logs show empty `textTabs` array
**Causes:**
- All values filtered out (empty strings)
- Calculation failed

**Fix:** Check calculation logic - ensure values are formatted correctly

### Issue 3: Tabs Sent But Not Appearing
**Symptoms:** Logs show tabs being sent, but document is empty
**Causes:**
- Tab labels don't match template
- Tabs not assigned to Tenant role
- Tabs not pre-placed in template

**Fix:** Verify template setup - check tab labels and role assignments

---

## Quick Checklist

Before testing:
- [ ] Contract has weekly price (override or from studio_grade_prices)
- [ ] Payment plan has deposit amount
- [ ] Application has selected_payment_plan_id
- [ ] Template has all tabs with exact labels
- [ ] All tabs assigned to Tenant role
- [ ] Tabs are pre-placed (not just anchor text)

When testing:
- [ ] Submit Step 5 (creates envelope)
- [ ] Check Supabase logs immediately
- [ ] Verify data calculation results
- [ ] Verify tabs structure
- [ ] Go to Step 6 and check document

---

## Need Help?

If data still doesn't appear:
1. **Share the Supabase function logs** from Step 5 submission
2. **Share a screenshot** of your DocuSign template showing tab labels
3. **Verify** the envelope was created with data (check logs)

The key is: **Check logs from Step 5 submission, not from clicking the button!**

