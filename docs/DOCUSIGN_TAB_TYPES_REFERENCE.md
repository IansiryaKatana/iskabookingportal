# DocuSign Tab Types (Data Types) - Complete Reference

## Tab Type Guide for Each Label

When setting up tabs in your DocuSign template, use these **exact tab types**:

---

## 📋 Text Tabs (Data Fields)

| Tab Label | Tab Type | Settings | Notes |
|-----------|----------|----------|-------|
| `academic_year` | **Text** | Locked: Yes (Recommended) | Format: "26/27" |
| `weekly_rate` | **Text** | Locked: Yes (Recommended) | Format: "£205.00" |
| `tenant_name` | **Text** | Locked: Yes (Recommended) | Full name |
| `room_number` | **Text** | Locked: Yes (Recommended) | Studio number/name |
| `deposit_amount` | **Text** | Locked: Yes (Recommended) | Format: "£99.00" |
| `tenancy_period` | **Text** | Locked: Yes (Recommended) | Date range with weeks |
| `total_rent` | **Text** | Locked: Yes (Recommended) | Format: "£9,225.00" |
| `plan_summary` | **Text** | Locked: Yes (Recommended) | Payment schedule |
| `print_name` | **Text** | **Locked: YES** (Required) | Read-only tenant name |

---

## ✍️ Signature Tabs (Interactive Fields)

| Tab Label | Tab Type | Settings | Notes |
|-----------|----------|----------|-------|
| `signature` | **Sign Here** | Required: Yes | Where tenant signs |
| `date_signed` | **Date Signed** | Required: Yes, Auto-fill: Yes | Auto-filled with current date |

---

## 📝 Detailed Setup Instructions

### For Text Tabs (Data Fields):

1. **Tab Type**: Select **"Text"**
2. **Tab Label**: Use exact label (e.g., `academic_year`)
3. **Settings**:
   - **Locked**: Yes (prevents tenant from editing)
   - **Required**: No (data is auto-filled)
   - **Value**: Leave empty (will be auto-filled by code)

### For Print Name Tab:

1. **Tab Type**: Select **"Text"**
2. **Tab Label**: `print_name`
3. **Settings**:
   - **Locked**: **YES** (Required - tenant cannot edit)
   - **Required**: Yes
   - **Value**: Leave empty (will be auto-filled with tenant name)

### For Signature Tab:

1. **Tab Type**: Select **"Sign Here"**
2. **Tab Label**: `signature`
3. **Settings**:
   - **Required**: Yes
   - **Optional**: No

### For Date Signed Tab:

1. **Tab Type**: Select **"Date Signed"**
2. **Tab Label**: `date_signed`
3. **Settings**:
   - **Required**: Yes
   - **Auto-fill**: Yes (auto-fills with current date when signed)

---

## 🎯 Quick Reference Table

```
Tab Label          → Tab Type      → Locked? → Required?
─────────────────────────────────────────────────────────
academic_year      → Text          → Yes     → No
weekly_rate        → Text          → Yes     → No
tenant_name        → Text          → Yes     → No
room_number        → Text          → Yes     → No
deposit_amount     → Text          → Yes     → No
tenancy_period     → Text          → Yes     → No
total_rent         → Text          → Yes     → No
plan_summary       → Text          → Yes     → No
print_name         → Text          → Yes     → Yes
signature          → Sign Here     → N/A     → Yes
date_signed        → Date Signed   → N/A     → Yes
```

---

## ✅ Step-by-Step in DocuSign Template Editor

### Adding a Text Tab:

1. Click **"Add Field"** or drag from left panel
2. Select **"Text"** tab type
3. Click where you want the field on the document
4. In the field properties:
   - **Label**: Enter exact label (e.g., `academic_year`)
   - **Locked**: Check ✅ (prevents editing)
   - **Required**: Uncheck (data is auto-filled)
   - **Value**: Leave empty
5. Assign to **Tenant** role

### Adding Print Name Tab:

1. Click **"Add Field"** or drag from left panel
2. Select **"Text"** tab type
3. Click where you want the field on the document
4. In the field properties:
   - **Label**: `print_name`
   - **Locked**: Check ✅ **REQUIRED**
   - **Required**: Check ✅
   - **Value**: Leave empty
5. Assign to **Tenant** role

### Adding Signature Tab:

1. Click **"Add Field"** or drag **"Sign Here"** from left panel
2. Select **"Sign Here"** tab type
3. Click where tenant should sign
4. In the field properties:
   - **Label**: `signature`
   - **Required**: Check ✅
5. Assign to **Tenant** role

### Adding Date Signed Tab:

1. Click **"Add Field"** or drag from left panel
2. Select **"Date Signed"** tab type
3. Click where date should appear
4. In the field properties:
   - **Label**: `date_signed`
   - **Required**: Check ✅
   - **Auto-fill**: Check ✅ (if available)
5. Assign to **Tenant** role

---

## 🔍 Tab Type Options in DocuSign

When DocuSign asks for "Data Type", these are the options:

- **Text** - For all data fields (academic_year, weekly_rate, etc.)
- **Sign Here** - For signature field
- **Date Signed** - For date field
- **Initial Here** - Not needed for this template
- **Checkbox** - Not needed for this template
- **Radio Button** - Not needed for this template
- **Dropdown** - Not needed for this template
- **Number** - Not needed (we use Text with formatted values)

---

## 📌 Important Notes

1. **All Text tabs should be Locked** - This prevents tenants from editing auto-filled data
2. **Print Name MUST be Locked** - This is critical - tenant should not be able to edit their printed name
3. **Signature and Date tabs are Required** - Tenant must complete these
4. **Tab labels are case-sensitive** - Use exact labels as shown
5. **All tabs must be assigned to Tenant role** - Or whatever role name you use for students

---

## 🎨 Visual Guide

```
Document Layout Example:

┌─────────────────────────────────────┐
│ Academic year: [academic_year]       │ ← Text (Locked)
│ Weekly Rate: [weekly_rate]          │ ← Text (Locked)
│ Name of Tenant: [tenant_name]       │ ← Text (Locked)
│ Room/Flat Number: [room_number]     │ ← Text (Locked)
│ Deposit Amount: [deposit_amount]    │ ← Text (Locked)
│ Tenancy Period: [tenancy_period]    │ ← Text (Locked)
│ Total Rent: [total_rent]            │ ← Text (Locked)
│ Plan Summary: [plan_summary]        │ ← Text (Locked)
│                                     │
│ Signature: [signature]              │ ← Sign Here (Required)
│ Print Name: [print_name]            │ ← Text (Locked, Required)
│ Date: [date_signed]                 │ ← Date Signed (Required)
└─────────────────────────────────────┘
```

---

## ✅ Final Checklist

When setting up each tab, verify:

- [ ] Tab Type is correct (Text, Sign Here, or Date Signed)
- [ ] Tab Label matches exactly (case-sensitive)
- [ ] Tab is assigned to Tenant role
- [ ] Text tabs are Locked (except signature/date)
- [ ] Print Name tab is Locked AND Required
- [ ] Signature tab is Required
- [ ] Date Signed tab is Required

---

## 🚀 Ready to Use

Once you've set up all tabs with these exact types and labels, the system will automatically populate all data when a student application is processed!

