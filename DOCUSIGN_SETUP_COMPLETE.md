# DocuSign Template Setup - Complete Reference

## ✅ What Makes It Work

This document summarizes the **exact requirements** that make DocuSign data population work correctly.

---

## 🔑 Critical Requirements

### 1. Read Only Settings (MOST IMPORTANT)

**❌ DO NOT check "Read Only" for data fields that need API population.**

- **Data fields** (academic_year, weekly_rate, tenant_name, etc.): **Read Only = UNCHECKED**
- **Exception:** Only `print_name` should have "Read Only" checked

**Why:** DocuSign's API cannot populate fields marked as "Read Only" when creating envelopes from templates.

### 2. Tab Labels Must Match Exactly

**Case-sensitive, exact matches required:**

```
academic_year
weekly_rate
tenant_name
room_number
deposit_amount
tenancy_period
total_rent
plan_summary
student_phone
print_name
```

### 3. Role Name Must Match

- **Template role name:** "Tenant" (or configured name)
- **Code sends:** "Tenant" (default, or from database `role_names.student`)
- **All tabs assigned to:** "Tenant" role

### 4. Tab Assignment

- **All data tabs** must be assigned to **"Tenant"** role
- Not "Witness", not "Guarantor", not any other role

### 5. Tab Type

- **Data fields:** "Text" tab type
- **Signature:** "Sign Here" tab type
- **Date:** "Date Signed" tab type

---

## 📋 Complete Field Configuration

| Field | Data Label | Role | Read Only | Tab Type | Required |
|-------|------------|------|-----------|----------|----------|
| Academic year | `academic_year` | Tenant | ❌ NO | Text | No |
| Weekly Rate | `weekly_rate` | Tenant | ❌ NO | Text | No |
| Name of Tenant | `tenant_name` | Tenant | ❌ NO | Text | No |
| Room/Flat Number | `room_number` | Tenant | ❌ NO | Text | No |
| Deposit Amount | `deposit_amount` | Tenant | ❌ NO | Text | No |
| Tenancy Period | `tenancy_period` | Tenant | ❌ NO | Text | No |
| Total Rent | `total_rent` | Tenant | ❌ NO | Text | No |
| Plan Summary | `plan_summary` | Tenant | ❌ NO | Text | No |
| Student Phone | `student_phone` | Tenant | ❌ NO | Text | No |
| Print Name | `print_name` | Tenant | ✅ YES | Text | Yes |
| Signature | `signature` | Tenant | N/A | Sign Here | Yes |
| Date Signed | `date_signed` | Tenant | N/A | Date Signed | Yes |

---

## 🔄 How It Works

1. **Step 5 Submission:**
   - User submits payment plan and guarantor details
   - `docusign-envelopes` function is called
   - Data is calculated (weekly rate, deposit, payment schedule)
   - Envelope is created with populated tabs

2. **Data Population:**
   - Code sends tabs with `tabLabel` matching template's "Data Label"
   - Code sends `roleName` matching template's role name
   - DocuSign matches tabs by label + role
   - Data populates into fields

3. **Signing:**
   - User clicks "Sign tenancy agreement" button
   - `docusign-recipient-view` function is called
   - Existing signing URL is returned
   - User signs the pre-populated document

---

## ✅ Verification Checklist

Before testing, verify:

- [ ] All data fields have "Read Only" **UNCHECKED** (except print_name)
- [ ] All tab labels match exactly (case-sensitive)
- [ ] All tabs assigned to "Tenant" role
- [ ] Role name in template is "Tenant"
- [ ] Tab types are correct (Text for data, Sign Here for signature, Date Signed for date)
- [ ] Template is saved

When testing:

- [ ] Submit Step 5 (creates envelope)
- [ ] Check Supabase logs for "DocuSign data calculation results"
- [ ] Verify all values are calculated (not null)
- [ ] Check "DocuSign tabs structure" log
- [ ] Verify tabs are being sent
- [ ] Go to Step 6 and check document
- [ ] Data should appear in all fields

---

## 🐛 Common Issues & Solutions

### Issue: Data not appearing
**Solution:** Uncheck "Read Only" for all data fields

### Issue: Some fields populated, others not
**Solution:** Check tab labels match exactly (case-sensitive)

### Issue: No data at all
**Solution:** 
1. Check "Read Only" is unchecked
2. Check role name matches
3. Check tabs are assigned to Tenant role
4. Check Supabase logs for calculation errors

---

## 📝 Summary

**The #1 requirement:** Data fields must NOT have "Read Only" checked.

**Everything else:**
- Tab labels match exactly
- Role name matches exactly
- Tabs assigned to correct role
- Tab types are correct

Once these are set correctly, data will populate automatically when envelopes are created.

---

## 📚 Related Documentation

- `DOCUSIGN_TEMPLATE_TAB_LABELS.md` - Complete tab label reference
- `DOCUSIGN_TROUBLESHOOTING.md` - Detailed troubleshooting guide
- `DOCUSIGN_ROLE_NAME_FIX.md` - Role name configuration
- `DOCUSIGN_READ_ONLY_ISSUE.md` - Read Only field explanation

