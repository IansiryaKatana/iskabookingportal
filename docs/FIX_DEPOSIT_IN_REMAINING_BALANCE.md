# Fix: Deposit Showing in Remaining Balance

## Problem
- All payments marked as "Paid" (Deposit + 3 installments)
- Remaining Balance shows £99.00 (exactly the deposit amount)
- Installments sum to £12,399.00 but "Installments Total Due" is £12,498.00
- Difference: £99.00 (the deposit)

## Root Cause
The deposit is being included in `total_due` calculation, likely because:
1. Deposit is in `contract_payment_schedule` and the filter isn't working correctly
2. OR the deposit payment is being counted in `total_paid` when it shouldn't be

## Solution
Ensure deposits are completely excluded from installment calculations in `get_payment_summary`.

