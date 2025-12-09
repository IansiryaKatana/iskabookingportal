# DocuSign Guarantor Agreement Template Tab Labels - Exact Reference Guide

## For Your DocuSign Guarantor Agreement Template

When setting up your DocuSign guarantor agreement template, use these **EXACT tab labels** to ensure data populates correctly from student applications.

---

## ⚠️ CRITICAL: Read Only Settings

**IMPORTANT:** Do NOT check "Read Only" for data fields that need to be populated by the API.

- ❌ **"Read Only" checked** → DocuSign API **cannot populate** the field
- ✅ **"Read Only" unchecked** → DocuSign API **can populate** the field

---

## 📋 Text Tabs (Data Fields - Auto-filled, Not Editable)

Add these as **Text Tabs** in your DocuSign template and assign them to the **Guarantor role**:

### Student/Contract Information Fields

| Field Name | Tab Label (EXACT) | Tab Type | Read Only? | Example Value | Notes |
|------------|-------------------|----------|------------|---------------|-------|
| **Student Name** | `student_name` | **Text** | ❌ **NO** | "John Smith" | Full name of the student/tenant - API must populate |
| **Total Rent** | `total_rent` | **Text** | ❌ **NO** | "£9,225.00" | Formatted in GBP - API must populate |
| **Tenancy Period** | `tenancy_period` | **Text** | ❌ **NO** | "05 Sept 2026 – 17 July 2027 (45 weeks)" | Start date, end date, weeks - API must populate |
| **Room Number** | `room_number` | **Text** | ❌ **NO** | "Platinum Studio - To Be Advised" | Studio number/name - API must populate |

### Guarantor Information Fields

| Field Name | Tab Label (EXACT) | Tab Type | Read Only? | Example Value | Notes |
|------------|-------------------|----------|------------|---------------|-------|
| **Guarantor Name** | `guarantor_name` | **Text** | ❌ **NO** | "Jane Smith" | Full name of the guarantor - API must populate |
| **Guarantor Email** | `guarantor_email` | **Text** | ❌ **NO** | "jane.smith@example.com" | Email address - API must populate |
| **Guarantor Phone** | `guarantor_phone` | **Text** | ❌ **NO** | "+44 7700 900456" | Phone number - API must populate |
| **Guarantor Relationship** | `guarantor_relationship` | **Text** | ❌ **NO** | "Mother" | Relationship to student (e.g., "Mother", "Father") - API must populate |
| **Guarantor Date of Birth** | `guarantor_dob` | **Text** | ❌ **NO** | "1975-06-20" | Date of birth in YYYY-MM-DD format - API must populate |

---

## ✍️ Signature Tabs (Interactive Fields)

### 1. Signature Tab
- **Tab Type**: **Sign Here**
- **Tab Label**: `signature` (or use anchor text `{{signature}}`)
- **Role**: Guarantor
- **Settings**: 
  - **Required**: Yes
  - **Editable**: No (signature only)
  - Place where guarantor should sign

### 2. Date Signed Tab
- **Tab Type**: **Date Signed**
- **Tab Label**: `date_signed` (or use anchor text `{{date_signed}}`)
- **Role**: Guarantor
- **Settings**:
  - **Required**: Yes
  - **Auto-fill**: Yes (auto-filled with current date when signed)
  - **Editable**: No (auto-filled with current date when signed)

### 3. Print Name Tab (Guarantor Name - Read Only)
- **Tab Type**: **Text**
- **Tab Label**: `print_name` (or use anchor text `{{print_name}}`)
- **Role**: Guarantor
- **Settings**:
  - **Read Only**: ✅ **YES** (Optional - if you want to show guarantor name next to signature)
  - **Required**: Yes
  - **Editable**: **NO** (Locked/Read-only)
  - Value: Auto-filled with guarantor's full name
  - This is the guarantor's name printed below/next to signature

---

## 🎯 Recommended Template Setup

### Option A: Pre-Place Tabs (RECOMMENDED - Most Reliable)

1. **In DocuSign Template Editor:**
   - Add all Text Tabs with the exact tab labels above
   - Add Sign Here tab with label `signature`
   - Add Date Signed tab with label `date_signed`
   - Optionally add Text tab with label `print_name` and set it to **Read-only/Locked**
   - Assign all tabs to the **Guarantor role** (or whatever role name you use for guarantors)

2. **Benefits:**
   - Tabs are always in the correct position
   - No anchor text needed
   - More reliable and predictable
   - Better user experience

### Option B: Use Anchor Text (Alternative)

1. **In your Word/PDF template:**
   - Add anchor text where you want tabs to appear:
     - `{{student_name}}` for student name
     - `{{total_rent}}` for total rent
     - `{{tenancy_period}}` for tenancy period
     - `{{room_number}}` for room number
     - `{{guarantor_name}}` for guarantor name
     - `{{guarantor_email}}` for guarantor email
     - `{{guarantor_phone}}` for guarantor phone
     - `{{guarantor_relationship}}` for relationship
     - `{{guarantor_dob}}` for date of birth
     - `{{signature}}` for signature tab
     - `{{date_signed}}` for date signed tab
     - `{{print_name}}` for print name (read-only)

2. **Upload to DocuSign:**
   - DocuSign will automatically create tabs at anchor text locations
   - You may need to adjust tab types (Text vs Sign Here vs Date Signed)

---

## 📝 Tab Label Summary (Copy-Paste Ready)

```
TEXT TABS (Locked = No, Read Only = No):
STUDENT/CONTRACT FIELDS:
- student_name
- total_rent
- tenancy_period
- room_number

GUARANTOR FIELDS:
- guarantor_name
- guarantor_email
- guarantor_phone
- guarantor_relationship
- guarantor_dob

OPTIONAL:
- print_name (Locked = Yes, Read Only = Yes, Required = Yes)

SIGNATURE TABS:
- signature (Tab Type: Sign Here, Required = Yes)
- date_signed (Tab Type: Date Signed, Required = Yes)
```

---

## 🎯 Data Type Quick Reference

When DocuSign asks for "Data Type" or "Tab Type", use:

- **Text** → For: student_name, total_rent, tenancy_period, room_number, guarantor_name, guarantor_email, guarantor_phone, guarantor_relationship, guarantor_dob, print_name
- **Sign Here** → For: signature
- **Date Signed** → For: date_signed

---

## ✅ Verification Checklist

After setting up your template:

1. **Test with a real application:**
   - [ ] Student name appears correctly
   - [ ] Total rent appears correctly (formatted as GBP)
   - [ ] Tenancy period appears correctly (with dates and weeks)
   - [ ] Room number appears correctly
   - [ ] Guarantor name appears correctly
   - [ ] Guarantor email appears correctly
   - [ ] Guarantor phone appears correctly
   - [ ] Guarantor relationship appears correctly
   - [ ] Guarantor date of birth appears correctly
   - [ ] Signature field is marked/visible
   - [ ] Date signed field is marked/visible
   - [ ] Print name appears and is read-only (if used)

2. **Test signature flow:**
   - [ ] Guarantor can see where to sign
   - [ ] Signature tab is clearly marked
   - [ ] Date is auto-filled when signing
   - [ ] Print name is visible and locked (if used)

---

## 🔧 If Tabs Don't Appear

1. **Check tab labels match exactly** (case-sensitive)
2. **Verify tabs are assigned to the correct role** (Guarantor role)
3. **Check DocuSign logs** for any errors
4. **Test with anchor text** if pre-placed tabs don't work
5. **Contact support** if issues persist

---

## 📌 Important Notes

- **Tab labels are case-sensitive** - use exact labels as shown
- **All tabs must be assigned to the Guarantor role** (or your guarantor role name)
- **Print name tab should be locked/read-only** (if used) - guarantor cannot edit it
- **Signature and date tabs should be required** - guarantor must complete them
- **Text tabs should NOT be read-only** (except print_name) - allows API to populate them

---

## 🚀 Implementation Status

✅ **Code Implementation**: Complete
- Guarantor envelope creation now includes textTabs with all required fields
- Fields are automatically populated from student application data
- Same pattern as tenancy agreement implementation

📋 **Next Steps**:
1. Set up your DocuSign guarantor template with these exact tab labels
2. Test with a sample application
3. Verify all fields populate correctly
4. Deploy the updated function (if not already deployed)

The function is ready to use these tab labels once your template is configured!

---

## 📚 Related Documentation

- [DocuSign Tenancy Template Tab Labels](./DOCUSIGN_TEMPLATE_TAB_LABELS.md) - Reference for tenancy agreement
- [DocuSign Template Requirements](./architecture-spec.md#45-agreement--signatures) - General template requirements
- [DocuSign Troubleshooting](./DOCUSIGN_TROUBLESHOOTING.md) - Common issues and solutions

