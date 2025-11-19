# Rebooking Deposit Payment - Current Implementation

## ✅ Current Behavior

**YES, rebooking applications require deposit payment** - they follow the same flow as regular applications.

### Current Flow for Rebooking:

1. **Student clicks "Rebook for This Contract"**
   - Application created with `status: "draft"` and `is_rebooking: true`
   - Previous application data is linked via `previous_application_id`

2. **Application Wizard (Steps 1-5)**
   - Steps 1-5 are pre-filled with previous application data
   - Student reviews and updates any changed information
   - **Step 5: Payment Plan & Guarantor**
     - Student must pay deposit (same as regular application)
     - Deposit payment is required before proceeding

3. **After Deposit Payment**
   - Application can proceed to Step 6 (Agreements & Signing)
   - Status transitions to `awaiting_signature` after deposit is paid

4. **Final Confirmation**
   - After deposit + signature + verification → `confirmed`
   - Studio allocated

---

## 📋 What's Implemented

✅ Rebooking applications are created with `is_rebooking = true`
✅ Previous application data is pre-filled
✅ Deposit payment is required (same as regular applications)
✅ Same status flow: `draft` → `awaiting_deposit` → `awaiting_signature` → `awaiting_verification` → `confirmed`

---

## ❓ Question: Is This Correct?

**Current Implementation:** Rebooking requires deposit payment for the upcoming academic year.

**If you want different behavior, options include:**

### Option 1: Keep Current (Deposit Required) ✅
- **Pros:** Consistent with regular applications, ensures commitment
- **Cons:** Students pay deposit again even though they're returning

### Option 2: Waive Deposit for Rebooking
- **Pros:** Incentive for returning students, faster process
- **Cons:** Need to modify payment flow, different business logic
- **Implementation:** Would need to:
  - Check `is_rebooking` flag in payment step
  - Skip deposit payment requirement
  - Auto-advance to signature step
  - Update status flow logic

### Option 3: Reduced Deposit for Rebooking
- **Pros:** Partial incentive while maintaining commitment
- **Cons:** Need to calculate different deposit amount
- **Implementation:** Would need to:
  - Calculate reduced deposit amount
  - Update payment flow to show reduced amount
  - Handle different deposit amounts in payment processing

---

## 🔧 If Changes Needed

If you want to modify the deposit requirement for rebooking, I can:

1. **Skip deposit for rebooking:**
   - Modify Step 5 to skip deposit if `is_rebooking === true`
   - Auto-advance to Step 6 after Step 5 completion
   - Update status flow to go directly to `awaiting_signature`

2. **Reduced deposit for rebooking:**
   - Add deposit discount calculation
   - Update payment UI to show reduced amount
   - Process reduced deposit payment

3. **Keep current (no changes):**
   - Everything works as-is
   - Rebooking requires full deposit payment

---

## 📝 Recommendation

**Current implementation is correct** if your business rule is:
> "Students must pay deposit for rebooking, even if they're returning customers."

**If your business rule is different**, please clarify:
- Should rebooking skip deposit payment?
- Should rebooking have a reduced deposit?
- Should rebooking have any special deposit handling?

Let me know and I'll implement the changes!

