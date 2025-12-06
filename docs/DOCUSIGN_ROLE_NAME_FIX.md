# DocuSign Role Name Fix Guide

## The Problem

You changed the role from **"Tenant (thestudent)"** to **"Tenant"**. This is good, but you need to ensure **everything matches exactly**.

---

## What Must Match

The role name must match in **THREE places**:

### 1. DocuSign Template Role Name
- The role name in your DocuSign template must be **"Tenant"**

### 2. Code Role Name (What's Being Sent)
- The code sends: `roleName: tenancyStudentRole`
- This comes from:
  - Database `docusign_templates.role_names.student` (if set), OR
  - Default: `"Tenant"` (from config)

### 3. Tab Assignment in Template
- **All tabs** in your DocuSign template must be assigned to **"Tenant"** role

---

## How to Fix

### Step 1: Verify DocuSign Template Role Name

1. Open your DocuSign template
2. Go to **"Roles"** or **"Recipients"** section
3. Check the role name - it should be exactly **"Tenant"**
4. If it's still "Tenant (thestudent)" or anything else, change it to **"Tenant"**

### Step 2: Verify All Tabs Are Assigned to "Tenant"

1. In your DocuSign template, click on each tab
2. Check the **"Assign to Role"** dropdown
3. Ensure it says **"Tenant"** (not "Tenant (thestudent)" or anything else)
4. Fix any tabs that aren't assigned to "Tenant"

### Step 3: Check Database Role Names (Optional)

If you have role names stored in the database:

1. Go to **Supabase Dashboard** → **Table Editor** → **`docusign_templates`**
2. Find your tenancy template record
3. Check the `role_names` JSONB column
4. It should be either:
   - `{}` (empty - uses default "Tenant"), OR
   - `{"student": "Tenant"}` (explicitly set to "Tenant")

**If it says `{"student": "Tenant (thestudent)"}`, update it to:**
```json
{"student": "Tenant"}
```

---

## Quick Verification Checklist

- [ ] DocuSign template role name is exactly **"Tenant"**
- [ ] All tabs are assigned to **"Tenant"** role
- [ ] Database `role_names.student` is either empty/null or `"Tenant"`
- [ ] No tabs are assigned to "Tenant (thestudent)" or any other role name

---

## How the Code Determines Role Name

The code uses this logic (in order):

1. **First:** Checks `docusign_templates.role_names.student` from database
2. **Fallback:** Uses default `"Tenant"` from config

So if your database has:
- `role_names: {}` → Uses default **"Tenant"** ✅
- `role_names: {"student": "Tenant"}` → Uses **"Tenant"** ✅
- `role_names: {"student": "Tenant (thestudent)"}` → Uses **"Tenant (thestudent)"** ❌

---

## Testing

After fixing:

1. **Save your DocuSign template**
2. **Update database** (if needed) - set `role_names` to `{"student": "Tenant"}` or `{}`
3. **Create a new test application** (or resubmit Step 5)
4. **Check if data appears** in the document

---

## Common Mistakes

❌ **Role name in template:** "Tenant (thestudent)"  
❌ **Tabs assigned to:** "Tenant (thestudent)"  
✅ **Code sends:** "Tenant"  
**Result:** Mismatch - data won't appear!

✅ **Role name in template:** "Tenant"  
✅ **Tabs assigned to:** "Tenant"  
✅ **Code sends:** "Tenant"  
**Result:** Match - data will appear!

---

## Summary

**Yes, changing from "Tenant (thestudent)" to "Tenant" is correct!**

Just make sure:
1. ✅ Template role name is **"Tenant"**
2. ✅ All tabs are assigned to **"Tenant"**
3. ✅ Database role_names is updated (if you're using it)

Once everything matches, the data should appear!

