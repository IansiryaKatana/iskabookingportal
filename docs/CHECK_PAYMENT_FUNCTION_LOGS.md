# How to Check create-payment Function Logs

## Quick Steps

1. Go to **Supabase Dashboard**
2. Click **Edge Functions** in the left sidebar
3. Click on **`create-payment`** function
4. Click **Logs** tab
5. Look for recent errors (red entries)
6. Check the error message - it will tell you exactly what failed

## Common Issues

### 1. Database Query Error
- **Error**: "relation does not exist" or "column does not exist"
- **Fix**: Check if the query is correct

### 2. Stripe API Error
- **Error**: "Invalid API key" or Stripe-related errors
- **Fix**: Check Stripe secret key in environment variables

### 3. Missing Data
- **Error**: "Application not found" or "Customer not found"
- **Fix**: Check if the application exists and has required data

### 4. Permission Error
- **Error**: "Forbidden" or "Unauthorized"
- **Fix**: Check if user is authenticated correctly

## What to Look For

In the logs, you'll see:
- **Timestamp** - When the error occurred
- **Error message** - What went wrong
- **Stack trace** - Where in the code it failed

Copy the error message and we can fix it!

