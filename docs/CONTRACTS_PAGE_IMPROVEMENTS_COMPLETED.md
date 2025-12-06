# Contracts Page Improvements - Implementation Complete

**Date Completed:** 2025-01-25  
**Status:** ✅ All issues resolved and implemented

---

## 📋 Summary of Changes

Today we implemented 4 major improvements to the Contracts admin page:

1. ✅ **Academic Year Context Toggle** - Added filter for multiple academic years
2. ✅ **Contract Name Editable** - Name field now editable in edit mode
3. ✅ **Payment Plans Order Persistence** - Order now persists when reopening dialog
4. ✅ **Default Payment Plan Order** - Default order: Pay in Full, 3, 4, 10 Instalments (1,2,3,4)
5. ✅ **Weeks Calculation Fix** - Changed from Math.ceil() to Math.round() for accurate calculations

---

## 🔧 Implementation Details

### 1. Academic Year Context Toggle ✅

**Location:** `src/pages/admin/Contracts.tsx`

**Changes:**
- Added `filterAcademicYearId` state to track selected academic year
- Added academic year filter dropdown in CardHeader
- Implemented filtering logic using `useMemo` hook
- Defaults to active academic year on mount
- Only shows when 2+ academic years exist

**Code:**
```typescript
const [filterAcademicYearId, setFilterAcademicYearId] = useState<string | null>(null);

// Filter contracts by academic year
const filteredData = useMemo(() => {
  if (!data) return [];
  if (!filterAcademicYearId) return data;
  return data.filter((contract) => contract.academic_year_id === filterAcademicYearId);
}, [data, filterAcademicYearId]);
```

**UI Location:**
- Card header: Top right of "Contract catalogue" card
- Responsive: Stacks on mobile, inline on desktop

---

### 2. Contract Name Editable ✅

**Location:** `src/pages/admin/Contracts.tsx` (lines 621-631)

**Changes:**
- Moved contract name field outside `!editingId` conditional
- Now visible in both create AND edit modes
- Added `name` field to update mutation payload

**Before:**
```typescript
{!editingId && (
  <>
    <FormField name="academic_year_id" ... />
    <FormField name="studio_grade_id" ... />
    <FormField name="name" ... />  // ❌ Hidden when editing
  </>
)}
```

**After:**
```typescript
{!editingId && (
  <>
    <FormField name="academic_year_id" ... />
    <FormField name="studio_grade_id" ... />
  </>
)}
<FormField name="name" ... />  // ✅ Always visible
```

---

### 3. Payment Plans Order Persistence ✅

**Location:** `src/pages/admin/Contracts.tsx` and `src/hooks/useAdminContracts.ts`

**Problem:** 
- Order was saved correctly but reset when reopening edit dialog
- Used array index instead of saved `display_order` from database
- `activePlans` sorted alphabetically, causing inconsistent order

**Solution:**
1. Created `sortedActivePlans` memo that sorts by default order first
2. Fixed initialization to always use saved `display_order` from database
3. Pass actual order values to database (not array index)
4. Preserve custom orders when reopening dialog

**Key Changes:**

**Contracts.tsx:**
```typescript
// Sort activePlans by default order, then alphabetically
const sortedActivePlans = useMemo(() => {
  if (!activePlans) return [];
  return [...activePlans].sort((a, b) => {
    const orderA = getDefaultPaymentPlanOrder(a.name);
    const orderB = getDefaultPaymentPlanOrder(b.name);
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}, [activePlans]);

// Use saved order from database, fallback to default
const savedOrder = savedOrders.get(plan.id);
const defaultOrder = getDefaultPaymentPlanOrder(plan.name);
const finalOrder = savedOrder ?? (defaultOrder < 999 ? defaultOrder : index + 1);
```

**useAdminContracts.ts:**
```typescript
// Now accepts payment_plan_orders array
payment_plan_ids?: string[] | null;
payment_plan_orders?: number[] | null;

// Uses actual order values (1,2,3,4) instead of array index (0,1,2,3)
display_order: payment_plan_orders?.[index] ?? (index + 1)
```

---

### 4. Default Payment Plan Order ✅

**Location:** `src/pages/admin/Contracts.tsx` (lines 64-74)

**Implementation:**
- Created `getDefaultPaymentPlanOrder()` helper function
- Default order: Pay in Full (1), 3 Instalments (2), 4 Instalments (3), 10 Instalments (4)
- Other plans get order 999 (append to end)
- Applied to all plan initialization logic

**Code:**
```typescript
const getDefaultPaymentPlanOrder = (planName: string): number => {
  const orderMap: Record<string, number> = {
    "Pay in Full": 1,
    "3 Instalments": 2,
    "4 Instalments": 3,
    "10 Instalments": 4,
  };
  return orderMap[planName] ?? 999;
};
```

**Usage:**
- New contracts: Automatically get default order when plans are selected
- Existing contracts: Use saved order, fallback to default if missing
- Plan toggle: Newly selected plans get default order
- Display: Plans sorted by default order in dialog

---

### 5. Weeks Calculation Fix ✅

**Location:** `src/pages/admin/Contracts.tsx` and `src/hooks/useAdminContracts.ts`

**Problem:**
- Used `Math.ceil()` which rounded UP (e.g., 45.14 weeks → 46 weeks)
- Weeks not recalculated when editing contract dates

**Solution:**
- Changed to `Math.round()` for accurate rounding (45.14 weeks → 45 weeks)
- Added `weeks` to update mutation payload
- Weeks now recalculated automatically when dates change

**Before:**
```typescript
const calculateWeeks = (start: string, end: string): number => {
  // ...
  return Math.ceil(diffDays / 7);  // ❌ Rounds up
};

// Weeks not included in update
await updateContract.mutateAsync({
  id: editingId,
  contract_start: values.contract_start,
  contract_end: values.contract_end,
  // weeks missing ❌
});
```

**After:**
```typescript
const calculateWeeks = (start: string, end: string): number => {
  // ...
  return Math.round(diffDays / 7);  // ✅ Rounds to nearest
};

// Weeks included in update
await updateContract.mutateAsync({
  id: editingId,
  contract_start: values.contract_start,
  contract_end: values.contract_end,
  weeks,  // ✅ Recalculated and saved
});
```

**Examples:**
- Sept 5, 2026 to July 17, 2027: **45 weeks** ✅ (was 45, now correct)
- Sept 5, 2027 to July 17, 2028: **45 weeks** ✅ (was 46, now correct)

---

## 📊 Database Impact

### No Schema Changes Required ✅

All changes work with existing database structure:
- `contracts.weeks` - Now recalculated correctly on edit
- `contract_payment_plans.display_order` - Now uses 1-based indexing (1,2,3,4) instead of 0-based (0,1,2,3)

### Migration Notes

**Existing Contracts:**
- Contracts with incorrect weeks (e.g., 46 instead of 45) will be fixed when edited and saved
- Payment plans with display_order = 0 will be updated to 1 on next edit

**No Data Migration Needed:**
- All fixes are backward compatible
- Existing data remains functional
- Corrections happen automatically on next edit

---

## 🎯 User Experience Improvements

### Before:
1. ❌ No way to filter contracts by academic year
2. ❌ Contract names couldn't be changed after creation
3. ❌ Payment plan order reset every time you edited
4. ❌ Payment plans appeared in random/alphabetical order
5. ❌ Weeks calculation sometimes wrong (rounding up)

### After:
1. ✅ Academic year filter in contract list header
2. ✅ Contract name editable at any time
3. ✅ Payment plan order persists perfectly
4. ✅ Sensible default order: Pay in Full, 3, 4, 10 Instalments
5. ✅ Accurate weeks calculation (rounds to nearest)

---

## 🧪 Testing Checklist

All items completed ✅:

- [x] Academic year filter works and filters contracts correctly
- [x] Academic year filter defaults to active year
- [x] Academic year filter only shows when 2+ years exist
- [x] Contract name can be edited and saved
- [x] Contract name visible in both create and edit modes
- [x] Payment plan order saves correctly (1,2,3,4 not 0,1,2,3)
- [x] Payment plan order persists when reopening edit dialog
- [x] Default order (Pay in Full, 3, 4, 10) applied to new contracts
- [x] Custom order can be set and persists
- [x] Order display matches saved order in contract list
- [x] Weeks calculation uses Math.round() correctly
- [x] Weeks recalculated when editing contract dates
- [x] Weeks saved correctly to database

---

## 📝 Files Modified

1. **`src/pages/admin/Contracts.tsx`**
   - Added academic year filter state and UI
   - Moved contract name field outside conditional
   - Added `getDefaultPaymentPlanOrder()` function
   - Fixed payment plans initialization logic
   - Changed weeks calculation to Math.round()
   - Added weeks to update payload
   - Modified handleSubmit to pass order values

2. **`src/hooks/useAdminContracts.ts`**
   - Added `payment_plan_orders` parameter to mutations
   - Changed display_order to use actual order values (index + 1 minimum)
   - Fixed weeks calculation in duplicate contracts function

---

## 🔄 Backward Compatibility

All changes are **100% backward compatible**:

- ✅ Existing contracts continue to work
- ✅ Existing payment plan orders preserved
- ✅ No database migrations required
- ✅ No breaking API changes
- ✅ Gradual correction of incorrect weeks values on edit

---

## 📚 Related Documentation

- **Assessment Document:** `CONTRACTS_PAGE_IMPROVEMENTS_ASSESSMENT.md`
- **Architecture Spec:** `docs/architecture-spec.md`
- **Payment Plans:** `docs/PAY_IN_FULL_IMPLEMENTATION_RECOMMENDATIONS.md`

---

**Status:** ✅ Complete and tested
**Version:** 2025-01-25
**Author:** AI Assistant (Auto)

