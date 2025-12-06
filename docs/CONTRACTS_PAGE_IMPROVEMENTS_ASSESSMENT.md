# Contracts Page Improvements - Assessment & Recommendations

**Date:** 2025-01-25  
**Issues Identified:** 4 main issues with the Contracts admin page

---

## 🔍 Issues Analysis

### Issue 1: Missing Academic Year Context Toggle ❌

**Problem:**
- Contracts page doesn't have an academic year filter/selector
- Other pages like Payment Plans have this feature
- When multiple academic years exist, it's hard to filter contracts

**Current State:**
- Contracts are displayed grouped by studio grade
- Academic year name is shown per contract, but no filter
- All contracts from all academic years are shown

**Recommendation:**
- Add academic year selector similar to Payment Plans page
- Filter contracts by selected academic year
- Show selected year context in header
- Default to active academic year or most recent

**Reference Implementation:**
- See `src/pages/admin/PaymentPlans.tsx` lines 123-148
- Uses `AcademicYearSelector` component pattern
- Maintains selected year in state

---

### Issue 2: Contract Name Not Editable in Edit Dialog ❌

**Problem:**
- When editing a contract, the name field is hidden
- Contract name can only be set during creation
- No way to rename contracts after creation

**Current State:**
```typescript
// Lines 450-519 in Contracts.tsx
{!editingId && (  // ❌ Only shows name field when NOT editing
  <>
    <FormField name="academic_year_id" ... />
    <FormField name="studio_grade_id" ... />
    <FormField name="name" ... />  // ❌ Hidden when editing
  </>
)}
```

**Root Cause:**
- Name field is conditionally rendered only when `!editingId`
- This was likely done to prevent changing academic_year and studio_grade (which make sense)
- But name should be editable

**Recommendation:**
- Show name field in both create and edit modes
- Keep academic_year_id and studio_grade_id hidden in edit mode (correct behavior)
- Allow name editing without restrictions

---

### Issue 3: Payment Plans Order Resets When Edit Dialog Opens ❌

**Problem:**
- When you save payment plan order, it saves correctly
- When you reopen the edit dialog, the order resets to alphabetical
- You have to re-order plans every time you edit

**Current State:**
```typescript
// Lines 111-144 in Contracts.tsx
useEffect(() => {
  if (!open) return;
  
  if (editingId) {
    const contract = data?.find((item) => item.id === editingId);
    setSelectedAcademicYearId(contract.academic_year_id);
    
    const initial: Record<string, { selected: boolean; order: number }> = {};
    (activePlans ?? []).forEach((plan, index) => {  // ❌ Uses array index
      const match = contract.contract_payment_plans?.find(...) ?? null;
      initial[plan.id] = {
        selected: Boolean(match),
        order: typeof match?.display_order === "number"
          ? match.display_order  // ✅ Uses saved order if exists
          : index + 1,            // ❌ But defaults to array index
      };
    });
    setSelectedPlans(initial);
  }
}, [open, editingId, data, activePlans, ...]);
```

**Root Cause:**
1. `activePlans` is sorted alphabetically by name (from `useContractPaymentPlans` hook)
2. When a plan exists in contract but NOT in activePlans (edge case), it defaults to `index + 1`
3. When plans are first added (no saved order), they get alphabetical order
4. The `activePlans` array order changes based on database query ordering

**Key Issue in Hook:**
```typescript
// src/hooks/useAdminContracts.ts line 161
const { data, error } = await query.order("name", { ascending: true });
// ❌ Always orders by name, so order changes every time
```

**Recommendation:**
1. Preserve saved order from `contract_payment_plans.display_order`
2. For new plans (not yet linked), use default order function
3. Default order should be: Pay in Full → 3 Instalments → 4 Instalments → 10 Instalments
4. Sort activePlans by default order when no saved order exists

---

### Issue 4: No Default Order State for Payment Plans ❌

**Problem:**
- No default ordering logic for payment plans
- When plans are first added to a contract, they appear in alphabetical order
- Should have sensible default: Pay in Full, 3, 4, 10 Instalments

**Current Default Order Logic:**
- None - relies on database query order (alphabetical by name)
- When plans are added, order is based on array index

**Recommendation:**
- Create a `getDefaultPaymentPlanOrder` function
- Order: 1. Pay in Full, 2. 3 Instalments, 3. 4 Instalments, 4. 10 Instalments
- Use this when:
  - Initializing plans for new contracts
  - Plans that don't have saved order
  - Sorting activePlans when displaying in dialog

**Implementation:**
```typescript
const getDefaultPaymentPlanOrder = (planName: string): number => {
  const orderMap: Record<string, number> = {
    "Pay in Full": 1,
    "3 Instalments": 2,
    "4 Instalments": 3,
    "10 Instalments": 4,
  };
  // For plans not in map, use a high number (append to end)
  return orderMap[planName] ?? 999;
};
```

---

## 📋 Implementation Plan

### Step 1: Add Academic Year Context Toggle
1. Add state for selected academic year
2. Add AcademicYearSelector component (or similar filter)
3. Filter contracts by selected year
4. Update grouped display logic
5. Add to header similar to Payment Plans page

### Step 2: Make Contract Name Editable
1. Move name field outside `!editingId` conditional
2. Show in both create and edit modes
3. Ensure form validation works for edit mode

### Step 3: Fix Payment Plans Order Persistence
1. Create `getDefaultPaymentPlanOrder` function
2. Sort `activePlans` by default order when initializing
3. Always use saved `display_order` from database
4. Only use default order for plans not yet saved
5. Ensure order persists correctly when dialog reopens

### Step 4: Implement Default Order State
1. Create default order mapping function
2. Apply to plan initialization
3. Use in sorting logic
4. Make order editable and persistable

---

## 🔧 Code Changes Required

### File: `src/pages/admin/Contracts.tsx`

**Changes:**
1. Add academic year filter state and UI
2. Move name field outside conditional
3. Fix payment plans initialization logic
4. Add default order function
5. Preserve order when dialog opens

### File: `src/hooks/useAdminContracts.ts` (if needed)

**Potential Changes:**
- Update `useContractPaymentPlans` to return plans in a consistent order
- Or handle sorting in component

---

## ✅ Expected Behavior After Fixes

1. **Academic Year Toggle:**
   - Dropdown shows all academic years
   - Contracts filtered by selected year
   - Defaults to active year

2. **Contract Name Editing:**
   - Name field visible in edit dialog
   - Can change name and save
   - Name updates in contract list

3. **Payment Plans Order:**
   - Order saved correctly
   - Order preserved when dialog reopens
   - Default order applied for new plans
   - Order can be changed and persists

4. **Default Order:**
   - New contracts get: Pay in Full, 3, 4, 10 Instalments
   - Order can be customized per contract
   - Custom order persists across edits

---

## 🧪 Testing Checklist

- [ ] Academic year filter works and filters contracts correctly
- [ ] Contract name can be edited and saved
- [ ] Payment plan order saves correctly
- [ ] Payment plan order persists when reopening edit dialog
- [ ] Default order (Pay in Full, 3, 4, 10) applied to new contracts
- [ ] Custom order can be set and persists
- [ ] Order display matches saved order in contract list

---

**Status:** Ready for implementation after review.

