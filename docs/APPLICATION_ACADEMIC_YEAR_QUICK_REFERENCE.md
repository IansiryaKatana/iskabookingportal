# Quick Reference: Application Academic Year Assignment

## 🎯 How Academic Year is Determined

**Short Answer**: The academic year is **automatically determined by the contract** you specify in the CSV.

### The Flow

```
CSV: contract_slug = "silver-45-week-2024-25"
  ↓
System looks up contract by slug
  ↓
Contract has: academic_year_id = "2024/2025"
  ↓
Application is assigned to academic year "2024/2025"
```

### CSV Template Columns

| Column | Purpose | Required? |
|--------|---------|-----------|
| `academic_year_name` | **Informational only** - Shows which academic year the contract belongs to | No (for verification) |
| `contract_slug` | **Determines academic year** - Must match an existing contract | ✅ Yes |

### Key Points

1. ✅ **You specify**: `contract_slug` in CSV
2. ✅ **System determines**: Academic year from contract
3. ✅ **Template shows**: `academic_year_name` for verification
4. ⚠️ **You cannot**: Override academic year in CSV
5. ✅ **You must**: Use a contract that belongs to the desired academic year

### Example

```csv
email,academic_year_name,contract_slug
john@example.com,2024/2025,silver-45-week-2024-25
```

- System looks up contract: `silver-45-week-2024-25`
- Contract belongs to academic year: `2024/2025`
- Application is assigned to: `2024/2025` ✅

### To Change Academic Year

If you need an application in a different academic year:
1. Use a contract slug that belongs to that academic year
2. If contract doesn't exist, create it first
3. Then use that contract's slug in your CSV

---

**Remember**: Contract determines academic year. The `academic_year_name` column is just for your reference!

