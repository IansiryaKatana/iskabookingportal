# Migration Instructions

## For Production (Supabase Cloud)

### Run in Supabase SQL Editor:
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the contents of: `supabase/migrations/20250125_align_all_payment_calculations.sql`
3. Click "Run" to execute

## For Local Development (Docker)

### Setup Docker for Supabase:
```powershell
# Start Supabase locally
npx supabase start

# Apply all migrations
npx supabase migration up

# If you get duplicate key errors, reset local database:
npx supabase db reset
```

### Troubleshooting Local Issues:

**Error: "duplicate key value violates unique constraint"**
- This happens when migrations are partially applied
- Solution: `npx supabase db reset` (WARNING: This deletes local data)

**Error: "connection refused"**
- Docker containers aren't running
- Solution: `npx supabase start`

**Error: "migration already exists"**
- Migration was already applied
- Check: `npx supabase migration list`
- If migration shows as applied, you're good!

## What This Migration Does:

✅ Fixes `get_payment_summary` function to calculate:
- Total Due = Contract Total - Deposit (for installments only)
- Remaining Balance = Total Due - Total Paid
- Ensures remaining balance = £0.00 when all installments are paid

✅ Aligns all payment calculations across the system

## After Running Migration:

1. Test on a student application with all installments paid
2. Verify remaining balance shows £0.00
3. Check payment status shows "fully_paid"
