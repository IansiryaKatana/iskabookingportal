# DocuSign Data Not Appearing - Troubleshooting Guide

## Common Issues and Solutions

If data isn't appearing in your DocuSign document, check these common issues:

---

## ⚠️ Issue 1: Read Only Fields Prevent API Population (MOST COMMON)

### Problem
**"Read Only" fields in DocuSign templates prevent the API from populating them.** This is the #1 cause of data not appearing.

### Solution
**Uncheck "Read Only" for ALL data fields** (except `print_name`):

1. Open your DocuSign template
2. Click on each data field:
   - `academic_year`
   - `weekly_rate`
   - `tenant_name`
   - `deposit_amount`
   - `tenancy_period`
   - `total_rent`
   - `plan_summary`
   - `student_phone`
3. **Uncheck "Read Only"** for all of them
4. **Keep "Read Only" checked ONLY for:** `print_name`
5. Save the template

### Why This Happens
- DocuSign's API cannot populate fields marked as "Read Only"
- This is a DocuSign API limitation when using templates
- Fields must be editable (not read-only) for the API to populate them

### Verification
After unchecking "Read Only":
- Create a new test application
- Submit Step 5
- Data should now appear in the document

---

## ✅ Issue 2: Tab Labels Don't Match Exactly

### Problem
Tab labels are **case-sensitive** and must match **exactly** between your template and the code.

### Solution
Verify your template tab labels match these **EXACTLY** (case-sensitive):

```
academic_year
weekly_rate
tenant_name
room_number
deposit_amount
tenancy_period
total_rent
plan_summary
print_name
```

**Common mistakes:**
- ❌ `Academic_Year` (capital A)
- ❌ `academic year` (space instead of underscore)
- ❌ `AcademicYear` (no underscore)
- ✅ `academic_year` (correct)

---

## ✅ Issue 2: Tabs Not Assigned to Correct Role

### Problem
Tabs must be assigned to the **Tenant role** (or whatever role name you're using for students).

### Solution
1. In DocuSign Template Editor, select each tab
2. Check the **"Assign to Role"** dropdown
3. Ensure it's assigned to **"Tenant"** (or your tenant role name)
4. **All tabs** (academic_year, weekly_rate, etc.) must be assigned to the same role

---

## ✅ Issue 3: Tabs Not Pre-Placed in Template

### Problem
If you're using anchor text (`{{academic_year}}`), it might not be working. DocuSign templates work best with **pre-placed tabs**.

### Solution
**Pre-place all tabs in your template:**
1. Open your DocuSign template
2. For each field, add a **Text tab** at the location where data should appear
3. Set the **Tab Label** to the exact label (e.g., `academic_year`)
4. **Don't rely on anchor text** - pre-place the tabs

---

## ✅ Issue 4: Tab Type is Wrong

### Problem
Using wrong tab type (e.g., Number instead of Text).

### Solution
- **All data fields** should be **Text tabs**
- Only `signature` should be **Sign Here**
- Only `date_signed` should be **Date Signed**

---

## ✅ Issue 5: Data Not Being Calculated

### Problem
The function might not be calculating the values correctly.

### Solution
Check the function logs in Supabase Dashboard:
1. Go to Supabase Dashboard → Edge Functions → `docusign-envelopes`
2. Check the logs when an envelope is created
3. Look for "DocuSign data calculation results" log entry
4. Verify all values are being calculated (not null/empty)

---

## 🔍 How to Debug

### Step 1: Check Function Logs

1. Go to **Supabase Dashboard** → **Edge Functions** → **docusign-envelopes**
2. Click on **"Logs"** tab
3. Look for recent envelope creation logs
4. Find the log entry: **"DocuSign data calculation results"**
5. Check if values are being calculated:
   - `weeklyRate` should be a number (e.g., 205)
   - `depositAmount` should be a number (e.g., 99)
   - `totalContractValue` should be a number (e.g., 9225)
   - `planSummary` should have payment details

### Step 2: Check Tabs Being Sent

Look for log entry: **"DocuSign tabs structure"**
- Verify `textTabs` array has all your tab labels
- Check that values are not empty
- Verify `roleName` matches your template role

### Step 3: Check DocuSign Response

Look for log entry: **"Sending DocuSign envelope"**
- Check `firstRoleTabs.textTabs` to see what's being sent
- Verify tab labels match your template

---

## 🎯 Quick Checklist

Before testing, verify:

- [ ] All tab labels match exactly (case-sensitive)
- [ ] All tabs are assigned to **Tenant** role
- [ ] All tabs are **Text** type (except signature/date)
- [ ] Tabs are **pre-placed** in template (not just anchor text)
- [ ] Template is saved and active
- [ ] Template is linked to the correct academic year in database

---

## 🔧 Testing Steps

1. **Create a test application:**
   - Complete through Step 5
   - Make sure deposit is paid
   - Go to Step 6

2. **Check Supabase logs:**
   - Look for calculation results
   - Verify all values are calculated

3. **Check DocuSign:**
   - Open the envelope in DocuSign
   - Verify tabs are visible
   - Check if data appears

4. **If data still doesn't appear:**
   - Check tab labels match exactly
   - Verify tabs are assigned to Tenant role
   - Ensure tabs are pre-placed (not anchor text)

---

## 📋 Template Setup Verification

In your DocuSign template, verify:

1. **Tab exists** - The tab is actually placed on the document
2. **Tab label matches** - Label is exactly `academic_year` (not `Academic_Year` or `academic year`)
3. **Tab is assigned to Tenant role** - Check role assignment
4. **Tab type is Text** - Not Number, not Dropdown, just Text
5. **Tab is not hidden** - Tab should be visible

---

## 🚨 Most Common Issue

**90% of the time, the issue is:**
- Tab labels don't match exactly (case-sensitive)
- OR tabs aren't assigned to the Tenant role

**Quick fix:**
1. Double-check every tab label matches exactly
2. Verify all tabs are assigned to Tenant role
3. Re-save your template

---

## 📞 Need More Help?

If data still doesn't appear after checking all above:

1. **Share the Supabase function logs** - Look for "DocuSign data calculation results"
2. **Share a screenshot** of your DocuSign template showing:
   - Tab labels
   - Role assignments
   - Tab types
3. **Test with a simple tab first** - Try just `tenant_name` to verify the connection works

---

## 💡 Pro Tip

**Test one tab at a time:**
1. Start with just `tenant_name` tab
2. If that works, add `academic_year`
3. Continue adding tabs one by one
4. This helps identify which specific tab has the issue

