# Fixing `supabase db pull` Authentication Error

## Problem

When running `supabase db pull`, you get:
```
failed SASL auth (FATAL: password authentication failed for user "postgres" (SQLSTATE 28P01))
```

## Root Cause

The Supabase CLI needs the database password to connect to the remote database. The CLI looks for the password in this order:
1. `SUPABASE_DB_PASSWORD` environment variable
2. Password in `supabase/config.toml` under `[db]` section
3. Interactive prompt (if neither is set)

## Solutions

### Solution 1: Add Password to config.toml (Recommended for Local Development)

Add the database password to your `supabase/config.toml` file:

```toml
project_id = "pzptocwdaqpczexlbajr"

[db]
password = "your-database-password-here"

[functions.get-publishable-key]
verify_jwt = false
# ... rest of your config
```

**⚠️ Security Warning:** This stores the password in plain text. Make sure `supabase/config.toml` is in `.gitignore` or use environment variables for production.

### Solution 2: Use Environment Variable (Recommended for CI/CD)

Set the environment variable before running the command:

**PowerShell:**
```powershell
$env:SUPABASE_DB_PASSWORD = "your-database-password-here"
supabase db pull
```

**For persistent session:**
```powershell
[System.Environment]::SetEnvironmentVariable('SUPABASE_DB_PASSWORD', 'your-password', 'User')
```

**Bash/Unix:**
```bash
export SUPABASE_DB_PASSWORD="your-database-password-here"
supabase db pull
```

### Solution 3: Use .env.local with dotenv (For Scripts)

Create or update `.env.local`:
```bash
SUPABASE_DB_PASSWORD=your-database-password-here
```

Then load it in your PowerShell session:
```powershell
# Load .env.local
Get-Content .env.local | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
}
supabase db pull
```

## How to Get Your Database Password

1. Go to **Supabase Dashboard**: https://supabase.com/dashboard/project/pzptocwdaqpczexlbajr/settings/database
2. Scroll to **"Database password"** section
3. If you don't know the password, click **"Reset database password"**
4. ⚠️ **Copy the password immediately** (it's only shown once!)
5. Use this password in one of the solutions above

## Verify Your Password is Correct

If you're unsure if your password is correct:

1. Test connection using the connection string format:
   ```
   postgresql://postgres.pzptocwdaqpczexlbajr:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```

2. Or reset the password in Supabase Dashboard and use the new one

## Troubleshooting

### Password Contains Special Characters

If your password contains special characters like `@`, `#`, `%`, etc., you may need to URL-encode them:

- `@` → `%40`
- `#` → `%23`
- `%` → `%25`
- etc.

Or use quotes in PowerShell:
```powershell
$env:SUPABASE_DB_PASSWORD = "C@seyjoseph78"
```

### Password Not Being Read

1. **Check environment variable is set:**
   ```powershell
   echo $env:SUPABASE_DB_PASSWORD
   ```

2. **Restart your terminal** after setting environment variables

3. **Check config.toml** has the `[db]` section with password

4. **Try with debug flag:**
   ```powershell
   supabase db pull --debug
   ```

### Alternative: Use Connection String Directly

If all else fails, you can use `pg_dump` directly:

```powershell
$password = "your-password"
$connectionString = "postgresql://postgres.pzptocwdaqpczexlbajr:${password}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
pg_dump $connectionString > schema.sql
```

## Recommended Approach

**⚠️ Important:** Supabase CLI does NOT support password in `config.toml`. Use one of these methods:

1. **Environment Variable (Recommended):**
   ```powershell
   $env:SUPABASE_DB_PASSWORD = "your-password"
   supabase db pull
   ```

2. **Command Line Flag:**
   ```powershell
   supabase db pull --password "your-password"
   ```

3. **Full Connection String:**
   ```powershell
   supabase db pull --db-url "postgresql://postgres.pzptocwdaqpczexlbajr:your-password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
   ```

## Current Configuration Status (Updated 2025-01-25)

- ✅ Project ID: `pzptocwdaqpczexlbajr` (configured in config.toml)
- ✅ Database Password: `4KrLQrPMDzJe0Q2z` (reset and working)
- ✅ Connection: Working successfully

**To use in PowerShell:**
```powershell
# Set for current session
$env:SUPABASE_DB_PASSWORD = "4KrLQrPMDzJe0Q2z"
supabase db pull

# Or use with command flag
supabase db pull --password "4KrLQrPMDzJe0Q2z"
```

**Note:** The password authentication issue is now resolved. If you see migration history errors, that's a separate issue (local/remote migration files mismatch).

