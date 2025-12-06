# DocuSign Template Tab Labels - Exact Reference Guide

## For Your DocuSign Tenancy Agreement Template

When rebuilding your DocuSign template, use these **EXACT tab labels** to ensure data populates correctly from student applications.

---

## ⚠️ CRITICAL: Read Only Settings

**IMPORTANT:** Do NOT check "Read Only" for data fields that need to be populated by the API.

- ❌ **"Read Only" checked** → DocuSign API **cannot populate** the field
- ✅ **"Read Only" unchecked** → DocuSign API **can populate** the field

**Exception:** Only `print_name` should have "Read Only" checked (this field should stay read-only for tenants).

---

## 📋 Text Tabs (Data Fields - Auto-filled, Not Editable)

Add these as **Text Tabs** in your DocuSign template and assign them to the **Tenant role**:

| Field Name | Tab Label (EXACT) | Tab Type | Read Only? | Example Value | Notes |
|------------|-------------------|----------|------------|---------------|-------|
| **Academic year** | `academic_year` | **Text** | ❌ **NO** | "26/27" | Format: YY/YY - API must populate |
| **Weekly Rate** | `weekly_rate` | **Text** | ❌ **NO** | "£205.00" | Formatted in GBP - API must populate |
| **Name of Tenant** | `tenant_name` | **Text** | ❌ **NO** | "John Smith" | Full name - API must populate |
| **Room/Flat Number** | `room_number` | **Text** | ❌ **NO** | "Platinum Studio - To Be Advised" | Studio number/name - API must populate |
| **Deposit Amount** | `deposit_amount` | **Text** | ❌ **NO** | "£99.00" | Formatted in GBP - API must populate |
| **Tenancy Period** | `tenancy_period` | **Text** | ❌ **NO** | "05 Sept 2026 – 17 July 2027 (45 weeks)" | Start date, end date, weeks - API must populate |
| **Total Rent** | `total_rent` | **Text** | ❌ **NO** | "£9,225.00" | Formatted in GBP - API must populate |
| **Plan Summary** | `plan_summary` | **Text** | ❌ **NO** | "Payment 1: £3,075.00 22 Aug 2026; Payment 2: £3,075.00 1 Jan 2027; Payment 3: £3,075.00 1 Apr 2027" | Payment schedule with amounts and dates - API must populate |

### Optional Field:
| Field Name | Tab Label (EXACT) | Example Value | Notes |
|------------|-------------------|---------------|-------|
| **Student Phone** | `student_phone` | "+44 1234 567890" | Only if provided |

---

## ✍️ Signature Tabs (Interactive Fields)

### 1. Signature Tab
- **Tab Type**: **Sign Here**
- **Tab Label**: `signature`
- **Role**: Tenant
- **Settings**: 
  - **Required**: Yes
  - **Editable**: No (signature only)
  - Place where tenant should sign

**OR use anchor text in your template:**
- Add text `{{signature}}` where you want the signature tab to appear
- The code will automatically place a Sign Here tab at that location

### 2. Date Signed Tab
- **Tab Type**: **Date Signed**
- **Tab Label**: `date_signed`
- **Role**: Tenant
- **Settings**:
  - **Required**: Yes
  - **Auto-fill**: Yes (auto-filled with current date when signed)
  - **Editable**: No (auto-filled with current date when signed)

**OR use anchor text in your template:**
- Add text `{{date_signed}}` where you want the date tab to appear
- The code will automatically place a Date Signed tab at that location

### 3. Print Name Tab (Tenant Name - Read Only)
- **Tab Type**: **Text**
- **Tab Label**: `print_name`
- **Role**: Tenant
- **Settings**:
  - **Read Only**: ✅ **YES** (This is the ONLY field that should be Read Only)
  - **Required**: Yes
  - **Editable**: **NO** (Locked/Read-only)
  - Value: Auto-filled with tenant's full name
  - This is the tenant's name printed below/next to signature
  - **Note:** This is the exception - only this field should have "Read Only" checked

**OR use anchor text in your template:**
- Add text `{{print_name}}` where you want the print name to appear
- The code will automatically place a Text tab at that location with locked="true"

---

## 🎯 Recommended Template Setup

### Option A: Pre-Place Tabs (RECOMMENDED - Most Reliable)

1. **In DocuSign Template Editor:**
   - Add all Text Tabs with the exact tab labels above
   - Add Sign Here tab with label `signature`
   - Add Date Signed tab with label `date_signed`
   - Add Text tab with label `print_name` and set it to **Read-only/Locked**
   - Assign all tabs to the **Tenant role** (or whatever role name you use for students)

2. **Benefits:**
   - Tabs are always in the correct position
   - No anchor text needed
   - More reliable and predictable
   - Better user experience

### Option B: Use Anchor Text (Alternative)

1. **In your Word/PDF template:**
   - Add anchor text where you want tabs to appear:
     - `{{academic_year}}` for academic year
     - `{{weekly_rate}}` for weekly rate
     - `{{tenant_name}}` for tenant name
     - `{{room_number}}` for room number
     - `{{deposit_amount}}` for deposit amount
     - `{{tenancy_period}}` for tenancy period
     - `{{total_rent}}` for total rent
     - `{{plan_summary}}` for plan summary
     - `{{signature}}` for signature tab
     - `{{date_signed}}` for date signed tab
     - `{{print_name}}` for print name (read-only)

2. **Upload to DocuSign:**
   - DocuSign will automatically create tabs at anchor text locations
   - You may need to adjust tab types (Text vs Sign Here vs Date Signed)

---

## 📝 Tab Label Summary (Copy-Paste Ready)

```
TEXT TABS (Locked = Yes):
- academic_year
- weekly_rate
- tenant_name
- room_number
- deposit_amount
- tenancy_period
- total_rent
- plan_summary
- print_name (Locked = Yes, Required = Yes)
- student_phone (optional)

SIGNATURE TABS:
- signature (Tab Type: Sign Here, Required = Yes)
- date_signed (Tab Type: Date Signed, Required = Yes)
```

## 🎯 Data Type Quick Reference

When DocuSign asks for "Data Type" or "Tab Type", use:

- **Text** → For: academic_year, weekly_rate, tenant_name, room_number, deposit_amount, tenancy_period, total_rent, plan_summary, print_name
- **Sign Here** → For: signature
- **Date Signed** → For: date_signed

---

## ✅ Verification Checklist

After setting up your template:

1. **Test with a real application:**
   - [ ] Academic year appears correctly
   - [ ] Weekly rate appears correctly
   - [ ] Tenant name appears correctly
   - [ ] Room number appears correctly
   - [ ] Deposit amount appears correctly
   - [ ] Tenancy period appears correctly
   - [ ] Total rent appears correctly
   - [ ] Plan summary shows actual amounts (not just percentages)
   - [ ] Signature field is marked/visible
   - [ ] Date signed field is marked/visible
   - [ ] Print name appears and is read-only (not editable)

2. **Test signature flow:**
   - [ ] Tenant can see where to sign
   - [ ] Signature tab is clearly marked
   - [ ] Date is auto-filled when signing
   - [ ] Print name is visible and locked

---

## 🔧 If Tabs Don't Appear

1. **Check tab labels match exactly** (case-sensitive)
2. **Verify tabs are assigned to the correct role** (Tenant role)
3. **Check DocuSign logs** for any errors
4. **Test with anchor text** if pre-placed tabs don't work
5. **Contact support** if issues persist

---

## 📌 Important Notes

- **Tab labels are case-sensitive** - use exact labels as shown
- **All tabs must be assigned to the Tenant role** (or your tenant role name)
- **Print name tab should be locked/read-only** - tenant cannot edit it
- **Signature and date tabs should be required** - tenant must complete them
- **Text tabs can be locked** - prevents tenant from editing auto-filled data

---

## 🚀 Next Steps

1. Rebuild your DocuSign template with these exact tab labels
2. Test with a sample application
3. Deploy the updated function (already done)
4. Verify all fields populate correctly

The function is already deployed and ready to use these tab labels!

