# How Rebooking Determines "Next" vs "Previous" Academic Year

## Overview

The rebooking system automatically determines whether a contract is for a "next" (future) academic year or a "previous" (past) academic year by comparing the **`start_date`** of academic years.

## How It Works

### 1. **Academic Year Comparison**

The system compares academic years using their `start_date` field:

```sql
-- From can_student_rebook function
SELECT start_date INTO v_current_year_start
FROM public.academic_years
WHERE id = v_current_contract_year_id;

SELECT start_date INTO v_new_year_start
FROM public.academic_years
WHERE id = v_new_contract_year_id;

-- If new contract is for a future year, allow rebooking
IF v_new_year_start > v_current_year_start THEN
  -- This is a "next" academic year - rebooking allowed
END IF;
```

### 2. **Determining "Next" Academic Year**

A contract is considered for the **"next" academic year** if:
- The new contract's academic year `start_date` is **greater than** the previous application's academic year `start_date`

**Example:**
- Previous application: Academic Year "2025/26" with `start_date = '2025-09-01'`
- New contract: Academic Year "2026/27" with `start_date = '2026-09-01'`
- Result: ✅ **"Next" year** - `2026-09-01 > 2025-09-01` → Rebooking allowed

### 3. **Determining "Previous" Academic Year**

A contract is considered for a **"previous" academic year"** if:
- The new contract's academic year `start_date` is **less than or equal to** the previous application's academic year `start_date`

**Example:**
- Previous application: Academic Year "2026/27" with `start_date = '2026-09-01'`
- New contract: Academic Year "2025/26" with `start_date = '2025-09-01'`
- Result: ❌ **"Previous" year** - `2025-09-01 < 2026-09-01` → Rebooking NOT allowed

### 4. **Gap Year Rebooking**

The system also allows rebooking after a gap:
- If the new contract's academic year `start_date` is **more than 1 year** after the previous application's academic year `start_date`

**Example:**
- Previous application: Academic Year "2024/25" with `start_date = '2024-09-01'`
- New contract: Academic Year "2026/27" with `start_date = '2026-09-01'`
- Result: ✅ **Gap year rebooking** - `2026-09-01 > 2024-09-01 + 1 year` → Rebooking allowed

## Important Notes

### ✅ **You Don't Need to Mark Years as "Next" or "Previous"**

The system automatically determines this based on:
1. The `start_date` of each academic year
2. The student's most recent confirmed application
3. The contract's academic year

### 📅 **Setting Up Academic Years**

When creating academic years, ensure:
1. **`start_date` is set correctly** - This is the key field used for comparison
2. **Dates are in chronological order** - Later years should have later `start_date` values
3. **Format:** Use `DATE` type (e.g., `'2025-09-01'`)

### 🔍 **How to Check if Rebooking Will Work**

1. **Student must have a confirmed application** for a previous academic year
2. **New contract must be for an academic year** with a `start_date` greater than the previous year's `start_date`
3. **Contract must be active** (`is_active = true`)

### 🐛 **Troubleshooting**

If rebooking banner doesn't show:
1. ✅ Check student has a **confirmed** application (`status = 'confirmed'`)
2. ✅ Check the academic year `start_date` is set correctly
3. ✅ Check new contract's academic year `start_date` > previous year's `start_date`
4. ✅ Check contract is active (`is_active = true`)
5. ✅ Check browser console for errors from `can_student_rebook` function

## Example Timeline

```
Academic Year Setup:
- 2024/25: start_date = '2024-09-01'
- 2025/26: start_date = '2025-09-01'  ← Student's confirmed application
- 2026/27: start_date = '2026-09-01'  ← "Next" year (rebooking allowed)
- 2027/28: start_date = '2027-09-01'  ← Also "next" (rebooking allowed)

Student's Journey:
1. Confirmed application for 2025/26
2. System checks contracts for 2026/27 and 2027/28
3. Both are "next" years (start_date > 2025-09-01)
4. Rebooking banner shows for both contracts
```

## Summary

**The system automatically knows which year is "next" by comparing `start_date` values. You just need to:**
1. Create academic years with correct `start_date` values
2. Create contracts linked to those academic years
3. The system will automatically determine if rebooking is allowed

No manual marking of "next" or "previous" is needed! 🎉

