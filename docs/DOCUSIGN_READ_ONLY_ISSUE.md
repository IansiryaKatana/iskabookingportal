# DocuSign Read Only Fields Issue

## The Problem

If fields are marked as **"Read Only"** in your DocuSign template, DocuSign's API **might not populate them** when creating envelopes from templates.

## The Solution

### Option 1: Remove "Read Only" from Data Fields (Recommended)

For data fields that need to be populated by the API:

1. **Open your DocuSign template**
2. **Click on each data field** (academic_year, weekly_rate, etc.)
3. **Uncheck "Read Only"** checkbox
4. **Keep "Read Only" checked ONLY for:**
   - `print_name` (this one should stay read-only)
5. **Save the template**

### Option 2: Keep "Read Only" but Ensure Fields Are Unlocked

Alternatively, you can:
1. Keep "Read Only" checked
2. But ensure the fields are **not locked** in the template settings
3. Some DocuSign versions allow API population of read-only fields if they're not "locked"

## Why This Happens

DocuSign's API behavior with read-only fields:
- **Read Only + Locked**: API cannot populate (field is protected)
- **Read Only + Not Locked**: API might populate (depends on DocuSign version)
- **Not Read Only**: API can always populate ✅

## Quick Fix Steps

1. **Open DocuSign template**
2. **For each data field:**
   - academic_year
   - weekly_rate
   - tenant_name
   - deposit_amount
   - tenancy_period
   - total_rent
   - plan_summary
   - student_phone
   
   **Uncheck "Read Only"**

3. **Keep "Read Only" checked for:**
   - print_name (this should stay read-only)

4. **Save template**
5. **Test with new application**

## Alternative: Check Field Lock Status

If you want to keep "Read Only":
1. Check if there's a "Locked" option separate from "Read Only"
2. Ensure fields are **not locked**
3. Some DocuSign templates have both "Read Only" and "Locked" as separate options

## Testing

After making changes:
1. Save the template
2. Create a new test application
3. Submit Step 5
4. Check if data appears in the document

---

## Summary

**Most likely issue:** "Read Only" fields in DocuSign template are preventing API population.

**Fix:** Uncheck "Read Only" for all data fields (except print_name).

**Test:** Create new application and verify data appears.

