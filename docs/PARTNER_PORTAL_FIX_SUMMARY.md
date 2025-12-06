# Partner Portal Commission Visibility Fix

## Issue
A student successfully made an application using a referral code, and the commission shows correctly in the admin portal. However, when the partner logs into their dashboard, the referred student doesn't show up, even after the commission is approved.

## Root Causes Identified

### 1. Trigger Not Firing for Referral Codes
The trigger `trigger_auto_create_partner_referral` only fired when `referred_by_partner_id IS NOT NULL`, but not when only `validated_referral_code` was set. This could cause commissions to not be created.

**Fix:** Updated trigger to fire when either `referred_by_partner_id` OR `validated_referral_code` is set.

### 2. Partner Profile partner_id Mismatch
The partner portal uses `profile?.partner_id` to query referrals. If the partner's profile doesn't have `partner_id` set correctly, or if it doesn't match the `partner_id` in `partner_referrals`, the query will return no results.

**Fix:** 
- Enhanced `get_partner_referral_payment_summary` function with better error handling
- Added diagnostic function `diagnose_partner_referrals` to help debug issues
- Added console logging to `usePartnerReferrals` hook

## Migrations Created

### 1. `20250210_fix_partner_referral_trigger.sql`
- Fixes trigger to fire for both `referred_by_partner_id` and `validated_referral_code`
- Backfills missing partner referral records for confirmed applications with referral codes

### 2. `20250210_fix_partner_portal_referrals.sql`
- Ensures `get_partner_referral_payment_summary` properly bypasses RLS
- Creates diagnostic function `diagnose_partner_referrals` to help debug issues
- Adds proper grants and comments

## Debugging Steps

1. **Check Partner Profile:**
   ```sql
   SELECT id, role, partner_id, first_name, last_name 
   FROM profiles 
   WHERE role = 'partner' AND id = '<partner_user_id>';
   ```

2. **Check Partner Referrals:**
   ```sql
   SELECT pr.*, sa.status, sa.created_at
   FROM partner_referrals pr
   JOIN student_applications sa ON pr.application_id = sa.id
   WHERE pr.partner_id = '<partner_id>';
   ```

3. **Use Diagnostic Function:**
   ```sql
   SELECT * FROM diagnose_partner_referrals('<partner_user_id>');
   ```

4. **Check Browser Console:**
   - Open partner portal
   - Check console for `[usePartnerReferrals]` logs
   - Verify `partner_id` is set and matches

## Common Issues & Solutions

### Issue: Profile doesn't have partner_id set
**Solution:** Partner needs to register using their referral code, or admin needs to manually link the profile to the partner record:
```sql
UPDATE profiles 
SET partner_id = '<partner_id>', role = 'partner'
WHERE id = '<user_id>';
```

### Issue: partner_id in profile doesn't match partner_referrals.partner_id
**Solution:** Check which partner_id is correct and update accordingly:
```sql
-- Check what partner_id is in partner_referrals
SELECT DISTINCT partner_id FROM partner_referrals WHERE application_id = '<application_id>';

-- Update profile if needed
UPDATE profiles 
SET partner_id = '<correct_partner_id>'
WHERE id = '<user_id>';
```

### Issue: Commission exists but partner can't see it
**Solution:** 
1. Verify partner's profile.partner_id matches partner_referrals.partner_id
2. Check RLS policies allow partner to view their referrals
3. Use diagnostic function to identify the issue

## Testing Checklist

- [ ] Apply both migrations
- [ ] Verify trigger fires for applications with referral codes
- [ ] Check partner profile has correct partner_id
- [ ] Verify partner can see their referrals in portal
- [ ] Test with new application using referral code
- [ ] Verify commission appears after application is confirmed

## Next Steps

1. Apply the migrations to your database
2. Check the partner's profile to ensure `partner_id` is set correctly
3. Use the diagnostic function to identify any mismatches
4. Test with a new application to verify the fix works

