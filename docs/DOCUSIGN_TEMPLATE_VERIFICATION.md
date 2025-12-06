# DocuSign Template Verification Checklist

## ✅ Data is Being Sent Correctly!

Your logs confirm that all data is being calculated and sent to DocuSign:
- ✅ 9 tabs with correct labels
- ✅ All values populated
- ✅ Envelope created successfully

**The problem is in your DocuSign template setup.**

---

## 🔍 Template Issues to Check

### Issue 1: Tab Labels Don't Match Exactly

**Your code is sending these EXACT labels:**
```
academic_year
weekly_rate
tenant_name
deposit_amount
tenancy_period
total_rent
plan_summary
student_phone
print_name
```

**In your DocuSign template, verify:**
- [ ] Each tab label matches **EXACTLY** (case-sensitive)
- [ ] No spaces instead of underscores
- [ ] No capital letters (all lowercase)
- [ ] No typos

**Common mistakes:**
- ❌ `Academic_Year` (capital A)
- ❌ `academic year` (space instead of underscore)
- ❌ `AcademicYear` (no underscore, capital A)
- ✅ `academic_year` (correct)

---

### Issue 2: Tabs Not Assigned to Tenant Role

**Your code is using role: "Tenant"** (or whatever is configured)

**In your DocuSign template, verify:**
- [ ] All tabs are assigned to **"Tenant"** role
- [ ] Not assigned to "Signer" or "Recipient" or any other role
- [ ] Role name matches exactly (case-sensitive)

**How to check:**
1. Open your template in DocuSign
2. Click on each tab
3. Check the "Assign to Role" dropdown
4. Ensure it says **"Tenant"** (or your exact role name)

---

### Issue 3: Tabs Not Pre-Placed in Template

**Your code is sending tabs with values, but if tabs aren't pre-placed in the template, DocuSign won't know where to put them.**

**In your DocuSign template, verify:**
- [ ] All tabs are **pre-placed** on the document (not just anchor text)
- [ ] Tabs are visible fields on the document
- [ ] Each tab is at the location where data should appear

**How to check:**
1. Open your template in DocuSign
2. You should see visible field markers on the document
3. Each field should be at the location where data should appear
4. If you only see anchor text like `{{academic_year}}`, that might not work

---

### Issue 4: Tab Type is Wrong

**Your code is sending Text tabs**

**In your DocuSign template, verify:**
- [ ] All data tabs are **Text** type
- [ ] Not Number, not Dropdown, not any other type
- [ ] Only `signature` should be Sign Here
- [ ] Only `date_signed` should be Date Signed

---

## 🎯 Step-by-Step Template Fix

### Step 1: Verify Tab Labels

1. Open your DocuSign template
2. For each tab, check the **Tab Label** property
3. Compare with the list above
4. Fix any that don't match exactly

### Step 2: Verify Role Assignment

1. For each tab, check the **"Assign to Role"** dropdown
2. Ensure it's set to **"Tenant"** (or your role name)
3. Fix any that are assigned to a different role

### Step 3: Verify Tab Placement

1. Check that tabs are **pre-placed** on the document
2. Each tab should be a visible field marker
3. If using anchor text, ensure it matches exactly

### Step 4: Save and Test

1. Save your template
2. Test with a new application
3. Submit Step 5
4. Check if data appears

---

## 📋 Quick Verification Checklist

For each tab in your template:

- [ ] Tab label matches exactly (case-sensitive)
- [ ] Tab is assigned to Tenant role
- [ ] Tab type is Text (for data fields)
- [ ] Tab is pre-placed on document
- [ ] Tab is at correct location

---

## 🔧 Missing Tab: room_number

I noticed `room_number` is not in the logs. This is expected if:
- No studio is assigned yet (`assigned_studio_id` is null)
- Studio doesn't have a `studio_number`

If you want room number to appear, ensure:
- A studio is assigned to the application
- The studio has a `studio_number` in the database

---

## ✅ What's Working

Your code is working perfectly:
- ✅ Data is calculated correctly
- ✅ All tabs are being sent
- ✅ Envelope is created successfully
- ✅ Values are formatted correctly

**The only issue is template setup!**

---

## 🚀 Next Steps

1. **Open your DocuSign template**
2. **Check each tab:**
   - Label matches exactly
   - Assigned to Tenant role
   - Type is Text
   - Pre-placed on document
3. **Save the template**
4. **Test with a new application**

Once the template is set up correctly, the data will appear automatically!

