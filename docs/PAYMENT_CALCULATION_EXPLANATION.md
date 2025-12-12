# Payment Calculation Explanation

## ⚠️ CRITICAL RULE: Deposits Must Be Excluded from Installments

**IMPORTANT**: The `payment_plan_installments` table can contain **both deposits and installments**. The frontend **MUST** filter out deposits before calculating installments. See [`PAYMENT_CALCULATION_CRITICAL_RULE.md`](./PAYMENT_CALCULATION_CRITICAL_RULE.md) for details.

**Key Rule**: 
- Deposits are separate from installments
- Always filter deposits: `label.toLowerCase().includes('deposit')` OR `sequence === 1 && fixed && matches deposit amount`
- Sum of installments should equal Remaining Balance (Contract Total - Deposit), NOT Contract Total

---

## Current Application (OLD LOGIC - Before Fix)

**Contract Details:**
- 45 weeks × £205/week = **£9,225.00** (Contract Total)
- Deposit = **£99.00**
- Remaining Balance = £9,225 - £99 = **£9,126.00**

**Installments Created (OLD - No Last-Installment Adjustment):**
- Inst 1: 33.33% × £9,126 = £3,041.6958 → **£3,041.70**
- Inst 2: 33.33% × £9,126 = £3,041.6958 → **£3,041.70**
- Inst 3: 33.33% × £9,126 = £3,041.6958 → **£2,943.61** ❌ (Wrong - should be adjusted)
- **Sum**: £3,041.70 + £3,041.70 + £2,943.61 = **£9,027.01** ❌
- **Missing**: £9,126.00 - £9,027.01 = **£98.99**

**Total:**
- Deposit: £99.00
- Installments: £9,027.01
- **Total Paid**: £9,126.01 (but should be £9,225.00)

---

## Future Applications (NEW LOGIC - With Last-Installment Adjustment)

**Contract Details:**
- 45 weeks × £205/week = **£9,225.00** (Contract Total)
- Deposit = **£99.00**
- Remaining Balance = £9,225 - £99 = **£9,126.00**

**Installments Created (NEW - With Last-Installment Adjustment):**
- Inst 1: 33.33% × £9,126 = £3,041.6958 → **£3,041.70**
- Inst 2: 33.33% × £9,126 = £3,041.6958 → **£3,041.70**
- Sum of previous: £3,041.70 + £3,041.70 = **£6,083.40**
- Inst 3: **£9,126.00 - £6,083.40 = £3,042.60** ✅ (Adjusted to make total exact)
- **Sum**: £3,041.70 + £3,041.70 + £3,042.60 = **£9,126.00** ✅ (Perfect!)

**Total:**
- Deposit: £99.00
- Installments: £9,126.00
- **Total**: £99.00 + £9,126.00 = **£9,225.00** ✅ (Matches Contract Total!)

---

## Key Difference

**OLD Logic:**
- All installments calculated from percentages
- Last installment = same calculation as others
- Result: Sum doesn't equal remaining balance

**NEW Logic:**
- First installments calculated from percentages
- Last installment = Remaining Balance - Sum of Previous
- Result: Sum exactly equals remaining balance

---

## Summary

✅ **Future applications will calculate correctly:**
- Installments will sum to exactly £9,126.00
- Deposit + Installments = £9,225.00 (Contract Total)
- Remaining Balance = £0.00 when all paid

❌ **Current application has discrepancy:**
- Installments sum to £9,027.01 (missing £98.99)
- This is because payments were created before the fix
- Remaining Balance shows £98.99

