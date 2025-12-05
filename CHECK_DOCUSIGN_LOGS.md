# How to Check DocuSign Logs for Data Population

## What to Look For

When you submit Step 5, you should see **THREE important log entries** in this order:

### 1. "DocuSign data calculation results"
This shows if the data was calculated correctly.

**What to check:**
```json
{
  "academicYear": "26/27",              // Should have a value
  "weeklyRate": 205,                     // Should be a number (not null)
  "weeklyRateFormatted": "£205.00",     // Should be formatted
  "depositAmount": 99,                   // Should be a number (not null)
  "depositAmountFormatted": "£99.00",   // Should be formatted
  "totalContractValue": 9225,           // Should be a number (not null)
  "totalRent": "£9,225.00",             // Should be formatted
  "tenantNameForDoc": "John Smith",      // Should have a value
  "roomNumber": "Studio 101",            // Should have a value
  "tenancyPeriod": "05 Sept 2026 – 17 July 2027 (45 weeks)",
  "planSummary": "Payment 1: £3,075.00 22 Aug 2026; ...",
  "textTabsCount": 9,                    // Should be 9 (or more)
  "textTabs": [
    { "label": "academic_year", "value": "26/27" },
    { "label": "weekly_rate", "value": "£205.00" },
    // ... etc
  ]
}
```

**If you see `null` or `undefined` values**, that's the problem!

### 2. "DocuSign tabs structure"
This shows what tabs were actually sent to DocuSign.

**What to check:**
```json
{
  "applicationId": "...",
  "roleName": "Tenant",                  // Should match your template role
  "textTabs": [
    { "label": "academic_year", "value": "26/27", "locked": null },
    { "label": "weekly_rate", "value": "£205.00", "locked": null },
    { "label": "tenant_name", "value": "John Smith", "locked": null },
    { "label": "room_number", "value": "Studio 101", "locked": null },
    { "label": "deposit_amount", "value": "£99.00", "locked": null },
    { "label": "tenancy_period", "value": "...", "locked": null },
    { "label": "total_rent", "value": "£9,225.00", "locked": null },
    { "label": "plan_summary", "value": "...", "locked": null },
    { "label": "print_name", "value": "John Smith", "locked": "true" }
  ],
  "signHereTabs": [
    { "label": "signature", "anchor": "{{signature}}" }
  ],
  "dateSignedTabs": [
    { "label": "date_signed", "anchor": "{{date_signed}}" }
  ]
}
```

**If `textTabs` is empty or missing tabs**, that's the problem!

### 3. "DocuSign envelope created"
This is what you already found - it just confirms the envelope was created.

---

## How to Find These Logs

### In Supabase Dashboard:

1. Go to **Supabase Dashboard** → **Edge Functions** → **`docusign-envelopes`**
2. Click **"Logs"** tab
3. Look for logs with timestamp around when you submitted Step 5
4. Scroll through the logs to find:
   - `"DocuSign data calculation results"`
   - `"DocuSign tabs structure"`
   - `"DocuSign envelope created"` (you already found this)

### Filtering Logs:

- Look for logs with `level: "info"` or `level: "log"`
- The logs should be in chronological order
- Look for the most recent execution (when you submitted Step 5)

---

## What Each Log Tells You

### If "DocuSign data calculation results" shows null values:
**Problem:** Data isn't being calculated correctly
**Possible causes:**
- Contract doesn't have weekly price
- Payment plan doesn't have deposit amount
- Application doesn't have selected_payment_plan_id
- Studio grade prices not configured

**Fix:** Check your database - ensure all required data is present

### If "DocuSign tabs structure" shows empty textTabs:
**Problem:** Tabs aren't being sent to DocuSign
**Possible causes:**
- All values are empty/null
- Values are being filtered out

**Fix:** Check the calculation results - ensure values are not null

### If "DocuSign tabs structure" shows tabs but document is empty:
**Problem:** Tabs are being sent but not matching template
**Possible causes:**
- Tab labels don't match exactly (case-sensitive)
- Tabs not assigned to Tenant role
- Tabs not pre-placed in template

**Fix:** Verify template setup - check tab labels and role assignments

---

## Quick Checklist

When checking logs:
- [ ] Find "DocuSign data calculation results" log
- [ ] Verify all values are calculated (not null)
- [ ] Find "DocuSign tabs structure" log
- [ ] Verify textTabs array has 9 items
- [ ] Verify all tab labels match your template
- [ ] Verify roleName matches your template role ("Tenant")

---

## Next Steps

1. **Find the "DocuSign data calculation results" log** - Check if values are null
2. **Find the "DocuSign tabs structure" log** - Check if tabs are being sent
3. **Share these logs** if you need help interpreting them

The key is: **Check the logs from Step 5 submission, not from clicking the button!**

