# Application Academic Year Assignment - How It Works

## Question: How do I know which academic year bulk application upload will be assigned to?

## Answer: Academic Year is Automatically Determined by Contract

### How It Works

1. **Applications are linked to Contracts**: Each application must specify a `contract_slug` in the CSV
2. **Contracts are linked to Academic Years**: Each contract has an `academic_year_id` that links it to an academic year
3. **Automatic Assignment**: When you import an application with a `contract_slug`, the system:
   - Looks up the contract by slug
   - Gets the contract's `academic_year_id`
   - Assigns the application to that academic year automatically

### CSV Template Structure

The CSV template includes an `academic_year_name` column which is **informational/read-only**:

```csv
email,first_name,...,academic_year_name,contract_slug,...
john@example.com,John,...,2024/2025,silver-45-week-2024-25,...
```

**Important Notes**:
- ✅ `academic_year_name` shows which academic year the contract belongs to (for verification)
- ✅ `contract_slug` is what actually determines the academic year (this is required)
- ⚠️ `academic_year_name` is **NOT used during import** - it's just informational
- ⚠️ You **cannot** override the academic year by changing `academic_year_name` in CSV
- ✅ The system uses the contract's academic year, not the CSV column

### Example

```csv
email,academic_year_name,contract_slug,status
john@example.com,2024/2025,silver-45-week-2024-25,confirmed
jane@example.com,2025/2026,gold-51-week-2025-26,confirmed
```

**What happens**:
1. Row 1: Looks up contract `silver-45-week-2024-25` → finds it belongs to academic year `2024/2025` → assigns application to `2024/2025`
2. Row 2: Looks up contract `gold-51-week-2025-26` → finds it belongs to academic year `2025/2026` → assigns application to `2025/2026`

### Verification in Template

When you download the Applications template:
- The `academic_year_name` column is pre-filled with the academic year for each contract
- This helps you verify you're using the correct contract for each application
- You can see at a glance which academic year each row will be assigned to

### Why This Design?

- **Data Integrity**: Ensures applications always match their contract's academic year
- **No Errors**: Prevents mismatched academic year/contract combinations
- **Clear Relationships**: Contract → Academic Year relationship is explicit
- **Simplified Import**: You only need to specify the contract slug

### Database Structure

```
student_applications
  └─> contract_id (references contracts)
        └─> academic_year_id (references academic_years)
```

**The academic year is not stored directly on applications** - it's derived from the contract relationship.

### Best Practice

1. **Before Import**: Verify contracts exist for the academic years you need
2. **Use Template**: Download template to see which academic year each contract belongs to
3. **Verify CSV**: Check that `academic_year_name` matches your expectations
4. **Import**: System automatically assigns correct academic year based on `contract_slug`

### Troubleshooting

**Problem**: "I want to assign an application to a different academic year"
**Solution**: 
- You must use a contract that belongs to the desired academic year
- If no contract exists, create one first for that academic year
- You cannot override the academic year by changing the CSV column

**Problem**: "I see wrong academic year in template"
**Solution**:
- The contract slug determines the academic year, not the template column
- Verify the contract actually belongs to the correct academic year
- Update the contract if needed, or use a different contract slug

---

## Summary

**Academic year assignment is automatic and determined by the contract you specify. The `academic_year_name` column in the CSV is informational only - it helps you verify which academic year will be assigned, but the actual assignment comes from the contract's academic_year_id.**

