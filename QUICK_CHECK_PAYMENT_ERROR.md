# Quick Check: Payment Function 500 Error

## Step 1: Check Function Logs (MOST IMPORTANT)

1. Go to **Supabase Dashboard**
2. Click **Edge Functions** → **`create-payment`**
3. Click **Logs** tab
4. Look for the **most recent error** (red entry)
5. **Copy the error message** - this will tell us exactly what's wrong

## Common Causes & Quick Fixes

### If Error is "Application not found"
- The application ID might be invalid
- Check if the application exists in the database

### If Error is Stripe-related
- Check if `STRIPE_SECRET_KEY` is set in Edge Function secrets
- Go to **Edge Functions** → **`create-payment`** → **Settings** → **Secrets**

### If Error is Database-related
- Might be a query issue
- Check if all columns exist in the tables

## Most Likely Issue

Since this happened after fixing RLS, it's **probably NOT RLS-related** (Edge Functions bypass RLS).

The error is likely:
1. **Missing Stripe secret key** - Check Edge Function secrets
2. **Database query issue** - Check function logs for specific error
3. **Missing application data** - Application might not have required fields

## Next Steps

**Please check the function logs and share the error message** - then I can provide a specific fix!

