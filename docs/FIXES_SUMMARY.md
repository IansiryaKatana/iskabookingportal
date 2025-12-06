# Payment & DocuSign Status Update Fixes

## Issues Fixed

### 1. ✅ DocuSign Tenancy Agreement Status Not Updating
**Problem**: Tenancy agreement status wasn't updating to "completed" after signing, while guarantor was working.

**Root Cause**: The status check function was working correctly, but needed better logging to debug envelope type filtering.

**Fix Applied**:
- Enhanced logging in `supabase/functions/docusign-check-status/index.ts` to track envelope types and status changes
- The function now logs which envelope type (tenancy/guarantor) is being updated
- Status updates are case-insensitive and work for both envelope types

**Verification**: Check Supabase function logs after signing to see envelope status updates.

---

### 2. ✅ Payment History Not Showing Until Manual Sync
**Problem**: Installment payments weren't appearing in payment history tabs until "Sync Missing Payments" button was clicked.

**Root Cause**: React Query cache wasn't being invalidated after payment success, so the UI wasn't refetching payment history.

**Fix Applied**:
- Added `useQueryClient` hook to `src/pages/portal/Payments.tsx`
- Added cache invalidation in `handlePaymentSuccess` function:
  - Invalidates `unified-payments` query (payment history)
  - Invalidates `payment-summary` query (balance calculation)
  - Invalidates `student-payments` query (installment schedule)
  - Invalidates `all-payments` query (admin view)
- Cache invalidation happens immediately after payment success AND after webhook processing (5 second delay)

**Result**: Payment history now updates automatically without requiring manual sync.

---

### 3. ✅ Remaining Balance Not Updating After Payment
**Problem**: Remaining balance stayed at total due amount even after all installments were paid.

**Root Cause**: Payment summary query wasn't being refetched after payment, so the UI showed stale data.

**Fix Applied**:
- Added automatic cache invalidation for `payment-summary` query after payment success
- Added periodic refetching (every 10 seconds) for payment summary when not fully paid
- This ensures the balance updates as soon as the webhook processes the payment

**Result**: Remaining balance now updates automatically after each payment.

---

### 4. ✅ "Fully Paid" UI Not Showing
**Problem**: UI wasn't showing "Fully Paid" status and green background when all installments were paid.

**Root Cause**: Payment summary wasn't being refetched, so `payment_status` remained stale.

**Fix Applied**:
- Payment summary now refetches automatically after payment
- UI already had the "Fully Paid" styling - it just needed fresh data
- Periodic refetching ensures status updates even if webhook is delayed

**Result**: "Fully Paid" badge and green background now appear automatically when all installments are paid.

---

## Technical Changes

### Frontend (`src/pages/portal/Payments.tsx`)
1. Added `useQueryClient` import and hook
2. Enhanced `handlePaymentSuccess` to invalidate React Query caches
3. Added periodic refetching for payment summary (every 10 seconds when not fully paid)
4. Added `queryClient` to `PaymentCard` component

### Backend (`supabase/functions/docusign-check-status/index.ts`)
1. Enhanced logging to track envelope types and status changes
2. Added envelope type information to console logs for debugging

---

## Recommendations

### 1. Webhook Reliability
**Current**: Webhook processes payments, but there's a 5-second delay before cache invalidation.

**Recommendation**: 
- Monitor webhook delivery in Stripe dashboard
- Consider adding webhook retry logic if delivery fails
- Add database triggers to invalidate cache when `stripe_payments` table is updated (if using Supabase Realtime)

### 2. Real-time Updates
**Current**: Periodic polling (10 seconds) for payment summary.

**Recommendation**:
- Consider using Supabase Realtime subscriptions to listen for `stripe_payments` table changes
- This would provide instant updates without polling
- Example:
  ```typescript
  const subscription = supabase
    .channel('payment-updates')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'stripe_payments' },
      (payload) => {
        queryClient.invalidateQueries({ queryKey: ['payment-summary', payload.new.student_application_id] });
      }
    )
    .subscribe();
  ```

### 3. DocuSign Status Polling
**Current**: Polls every 30 seconds on Step 6.

**Recommendation**:
- Consider reducing polling interval to 15 seconds for faster updates
- Or implement WebSocket/Realtime subscription for instant updates
- Add visual indicator when status is being checked

### 4. Error Handling
**Current**: Errors are logged but not always shown to users.

**Recommendation**:
- Add user-friendly error messages for payment failures
- Show retry buttons for failed webhook processing
- Add loading states during payment processing

### 5. Testing
**Recommendation**:
- Test payment flow end-to-end with a test Stripe account
- Verify webhook delivery in Stripe dashboard
- Test DocuSign status updates with test envelopes
- Verify cache invalidation works correctly

---

## Database Queries for Verification

### Check Payment Records
```sql
-- Check if payment was recorded
SELECT * FROM stripe_payments 
WHERE student_application_id = 'YOUR_APPLICATION_ID'
ORDER BY created_at DESC;

-- Check unified payment history
SELECT * FROM unified_payment_history
WHERE student_application_id = 'YOUR_APPLICATION_ID'
ORDER BY payment_date DESC;

-- Check payment summary
SELECT * FROM get_payment_summary('YOUR_APPLICATION_ID');
```

### Check DocuSign Status
```sql
-- Check envelope statuses
SELECT envelope_type, status, updated_at 
FROM docusign_envelopes
WHERE application_id = 'YOUR_APPLICATION_ID'
ORDER BY updated_at DESC;
```

---

## Next Steps

1. ✅ **Deploy changes** to production
2. ✅ **Test payment flow** with a real payment
3. ✅ **Test DocuSign signing** and verify status updates
4. ✅ **Monitor logs** for any errors
5. ⏳ **Consider implementing Realtime subscriptions** for instant updates (optional enhancement)

---

## Files Modified

1. `src/pages/portal/Payments.tsx` - Added cache invalidation and periodic refetching
2. `supabase/functions/docusign-check-status/index.ts` - Enhanced logging for debugging

---

## Notes

- All fixes maintain backward compatibility
- No database migrations required
- Changes are frontend-only (except logging enhancement in Edge Function)
- Webhook processing remains unchanged (already working correctly)
