# Next Steps After Deploying Secrets Management Functions

## ✅ Step 1: Run Database Migration

### Option A: Supabase Dashboard (Easiest)

1. Go to **Supabase Dashboard** → Your Project
2. Navigate to **SQL Editor**
3. Open the file: `supabase/migrations/20251218_enhance_credentials_for_secrets_management.sql`
4. Copy the entire SQL content
5. Paste into SQL Editor
6. Click **Run** (or press Ctrl+Enter)

### Option B: Supabase CLI

```bash
# Make sure you're linked to your project
npx supabase link --project-ref your-project-ref

# Push migrations
npx supabase db push
```

**What this migration does:**
- Adds encryption support to credentials table
- Adds category, sync tracking, and helper functions
- Creates encryption/decryption functions
- Updates RLS policies (superadmin only)

---

## ✅ Step 2: Verify Migration Success

After running the migration, verify it worked:

1. Go to **Supabase Dashboard** → **Table Editor**
2. Check the `credentials` table has these new columns:
   - `category`
   - `sync_to_edge_function`
   - `last_synced_at`
   - `encrypted_value`
   - `requires_encryption`

3. Or run this SQL query:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'credentials' 
AND column_name IN ('category', 'sync_to_edge_function', 'encrypted_value', 'requires_encryption');
```

---

## ✅ Step 3: Test Current System (Before Migration)

**Important**: Test that your current system still works before migrating secrets.

1. **Go to `/admin/settings`** in your app
2. **Click "Refresh"** on the Integrations card
3. **Verify all integrations show as "Connected":**
   - ✅ Stripe
   - ✅ DocuSign  
   - ✅ Resend

If any show as "Not Connected", your env vars are working correctly and the functions are using them.

---

## ✅ Step 4: Migrate Existing Secrets (Optional but Recommended)

Once you've verified everything works, migrate your existing secrets:

### Method 1: Automatic Migration (Recommended)

1. **Go to `/admin/secrets`** in your app
2. **Click "Migrate from Env Vars"** button
3. The system will:
   - Read secrets from your Edge Function environment variables
   - Insert them into the database (encrypted if sensitive)
   - Skip secrets that already exist

4. **Check the results:**
   - You should see a success message
   - Secrets should appear in the list

### Method 2: Manual Migration

1. **Go to Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**
2. **Copy each secret value**
3. **Go to `/admin/secrets`** in your app
4. **Add each secret manually:**
   - Click "Add Secret"
   - Enter the key name (e.g., `STRIPE_SECRET_KEY`)
   - Paste the value
   - Select category and enable encryption if sensitive
   - Click "Create Secret"

---

## ✅ Step 5: Verify Everything Works

After migration, test again:

1. **Go to `/admin/settings`** → **Refresh integrations**
   - All should still show "Connected"

2. **Test a real workflow:**
   - **Stripe**: Try processing a test payment
   - **Resend**: Send a test email
   - **DocuSign**: Create a test envelope (if possible)

3. **Check Edge Function logs:**
   - Go to **Supabase Dashboard** → **Edge Functions** → **Logs**
   - Look for any errors related to credentials
   - Functions should be reading from database now

---

## ✅ Step 6: Update Remaining Edge Functions (Optional)

The following Edge Functions have been updated:
- ✅ `check-integration-status`
- ✅ `stripe-webhook`
- ✅ `send-transactional-email`

Other Edge Functions still use environment variables directly. They will continue to work (fallback), but you can gradually update them to use the database-first approach.

**To update a function:**
1. Import the helper: `import { getCredential } from "../_shared/get-credential.ts";`
2. Replace `Deno.env.get("SECRET_NAME")` with:
   ```typescript
   await getCredential("SECRET_NAME", {
     supabase: supabaseAdmin,
     fallback: Deno.env.get("SECRET_NAME") ?? "",
   });
   ```

---

## 🔒 Step 7: Set Encryption Key (Production)

**Important for Production**: The migration uses a default encryption key. For production:

1. **Generate a secure encryption key:**
   ```bash
   # Generate a 32-character random key
   openssl rand -base64 32
   ```

2. **Add to Supabase Edge Function secrets:**
   - Go to **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**
   - Add: `SUPABASE_CREDENTIALS_ENCRYPTION_KEY` = (your generated key)

3. **Update the database function** (optional - for production):
   ```sql
   -- Update get_encryption_key() to read from env
   -- The function already checks current_setting('app.encryption_key')
   -- You can set it via: ALTER DATABASE postgres SET app.encryption_key = 'your-key';
   ```

---

## 🎯 Quick Checklist

- [ ] Run database migration
- [ ] Verify migration success (check table columns)
- [ ] Test current system (verify integrations work)
- [ ] Migrate existing secrets (automatic or manual)
- [ ] Verify everything still works after migration
- [ ] Set encryption key for production (if in production)
- [ ] (Optional) Update remaining Edge Functions gradually

---

## 🆘 Troubleshooting

### Migration Fails

**Error: "relation credentials does not exist"**
- The base `credentials` table migration hasn't run yet
- Run `20251123_add_company_name_and_credentials.sql` first

**Error: "permission denied"**
- Make sure you're using the service role or have proper permissions
- Check RLS policies

### Functions Not Working After Migration

**Check:**
1. Edge Function logs for errors
2. Database credentials table has correct values
3. `sync_to_edge_function` is `true` for secrets you want to use
4. Encryption key is set (if using encrypted secrets)

**Fallback:**
- Functions automatically fall back to env vars if database fails
- Your system should still work even if migration has issues

### Secrets Not Appearing

**Check:**
1. You're logged in as `superadmin` (only superadmin can see secrets)
2. Secrets have `sync_to_edge_function = true`
3. Refresh the page

---

## 📝 Notes

- **No Breaking Changes**: Everything has fallback to env vars
- **Gradual Migration**: You can migrate secrets one by one
- **Reversible**: Can always go back to env vars if needed
- **Safe**: All changes are logged and audited

---

**Status**: Ready to proceed! 🚀

