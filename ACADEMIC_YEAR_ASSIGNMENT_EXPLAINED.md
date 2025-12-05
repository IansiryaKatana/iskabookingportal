# Academic Year Assignment for Applications - Explained

## ✅ Your Question: "How do I know which academic year the bulk application upload is going to be assigned to?"

## Answer: Academic Year is Automatically Determined by Contract

### How It Works

**The academic year is NOT a separate field you specify - it's automatically determined by the contract you choose.**

#### The Process:

1. **You specify `contract_slug` in CSV** (e.g., `"silver-45-week-2024-25"`)
2. **System looks up the contract** by slug
3. **Contract already has an `academic_year_id`** that links it to an academic year
4. **Application is automatically assigned** to that contract's academic year

### Example:

```csv
email,contract_slug,status
john@example.com,silver-45-week-2024-25,confirmed
```

**What happens:**
- System finds contract: `silver-45-week-2024-25`
- This contract belongs to academic year: `2024/2025` (stored in contract's `academic_year_id`)
- Application is automatically assigned to: **`2024/2025`** ✅

### CSV Template Includes Academic Year for Reference

The CSV template includes an **`academic_year_name` column** that shows which academic year each contract belongs to:

```csv
email,academic_year_name,contract_slug,status
john@example.com,2024/2025,silver-45-week-2024-25,confirmed
jane@example.com,2025/2026,gold-51-week-2025-26,confirmed
```

**Important**:
- ✅ `academic_year_name` is **informational only** - shows you which year will be assigned
- ✅ `contract_slug` is what **actually determines** the academic year
- ⚠️ You **cannot change** the academic year by editing `academic_year_name` in CSV
- ✅ The system uses the **contract's academic year**, not the CSV column

### How to Know Which Academic Year Will Be Assigned

**Method 1: Download Template**
1. Go to `/admin/data-import`
2. Select "Applications"
3. Download template
4. The `academic_year_name` column shows which academic year each contract belongs to

**Method 2: Check Contract Details**
- Contracts are linked to academic years
- Contract slug usually contains the academic year (e.g., `silver-45-week-2024-25`)
- View contracts in admin to see their academic years

**Method 3: Database Relationship**
- Applications → Contracts → Academic Years
- The academic year is determined by the contract's `academic_year_id`

### Database Structure

```
student_applications
  ├─ contract_id → contracts
  │    └─ academic_year_id → academic_years
  │         └─ name (e.g., "2024/2025")
  └─ (academic year is NOT stored directly on application)
```

### Summary

✅ **Academic year is automatically determined by the contract**
✅ **Template shows academic year for reference** (`academic_year_name` column)
✅ **System ensures data integrity** - applications always match contract's academic year
✅ **No manual assignment needed** - just specify the correct contract

### Key Takeaway

**You don't need to worry about assigning academic years manually.** Just:
1. Use the correct `contract_slug` for the academic year you want
2. The template shows which academic year each contract belongs to
3. System automatically assigns the correct academic year based on the contract

---

**See Also**: `docs/APPLICATION_ACADEMIC_YEAR_EXPLANATION.md` for detailed technical information.

