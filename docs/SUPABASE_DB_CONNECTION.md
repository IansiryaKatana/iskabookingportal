# Supabase Database Connection Guide

This guide explains how to find and use the Supabase database connection URL (`SUPABASE_DB_URL`).

## ⚠️ Important Notes

- **Only needed for:** Database backups, direct SQL scripts, migration tools
- **NOT needed for:** Normal application usage (use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` instead)
- **Never commit** this to version control
- **Never expose** in frontend code

---

## Where to Find SUPABASE_DB_URL

### Method 1: Supabase Dashboard (Easiest)

1. Go to **Supabase Dashboard** → Your Project
2. Navigate to **Project Settings** → **Database**
3. Scroll to **"Connection string"** section
4. You'll see two options:

#### Transaction Mode (Port 5432) - Recommended
```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
```

#### Session Mode (Port 6543)
```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
```

5. Click **"Copy"** to copy the connection string
6. Replace `[PASSWORD]` with your actual database password

### Method 2: Get Database Password

If you don't know your database password:

1. Go to **Supabase Dashboard** → **Project Settings** → **Database**
2. Scroll to **"Database password"** section
3. Click **"Reset database password"** (if you don't know it)
4. Copy the password shown (⚠️ **Only shown once!**)
5. Use this password in the connection string

---

## Connection String Format

```
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[HOST]:[PORT]/postgres
```

### Components:
- `[PROJECT_REF]` - Your Supabase project reference (found in project URL)
- `[PASSWORD]` - Your database password
- `[HOST]` - Pooler hostname (e.g., `aws-0-ap-southeast-1.pooler.supabase.com`)
- `[PORT]` - `5432` (transaction mode) or `6543` (session mode)

### Example:
```
postgresql://postgres.pzptocwdaqpczexlbajr:your-password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

---

## Usage Examples

### For Database Backups (pg_dump)

```bash
# Set environment variable
export SUPABASE_DB_URL="postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[HOST]:5432/postgres"

# Run backup
pg_dump "$SUPABASE_DB_URL" > backup-$(date +%Y%m%d).sql
```

### For Local Scripts (.env.local)

```bash
# Add to .env.local (NEVER commit this file)
SUPABASE_DB_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[HOST]:5432/postgres
```

### For Node.js Scripts

```javascript
import pg from 'pg';

const client = new pg.Client(process.env.SUPABASE_DB_URL);
await client.connect();

// Run queries
const result = await client.query('SELECT * FROM studios LIMIT 10');
console.log(result.rows);

await client.end();
```

### Alternative: Using SUPABASE_DB_PASSWORD

The `scripts/run-sql.mjs` script uses `SUPABASE_DB_PASSWORD` and constructs the URL:

```bash
# In .env.local
SUPABASE_DB_PASSWORD=your-database-password
SUPABASE_URL=https://your-project.supabase.co

# Run SQL script
node scripts/run-sql.mjs "SELECT * FROM studios LIMIT 10"
```

---

## Connection Types

### Transaction Mode (Port 5432) - Recommended
- **Use for:** Most operations, backups, migrations
- **Connection pooling:** Yes
- **Best for:** Short-lived connections

### Session Mode (Port 6543)
- **Use for:** Long-running queries, transactions
- **Connection pooling:** Yes
- **Best for:** Operations that need session state

### Direct Connection (No Pooler)
- **Format:** `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`
- **Use for:** When you need a direct connection
- **Note:** Less efficient, use pooler when possible

---

## Security Best Practices

1. ✅ **Never commit** `SUPABASE_DB_URL` to Git
2. ✅ **Store in** `.env.local` (for local scripts) or environment variables
3. ✅ **Rotate password** if exposed
4. ✅ **Use connection pooling** (port 5432) when possible
5. ✅ **Limit access** - only give to trusted developers
6. ✅ **Use service role key** for most operations instead

---

## Troubleshooting

### Error: "password authentication failed"
- Check that password is correct
- Reset password in Supabase Dashboard if needed
- Ensure password doesn't contain special characters that need URL encoding

### Error: "connection refused"
- Check that host and port are correct
- Verify your IP is allowed (if IP restrictions are enabled)
- Try the other port (5432 vs 6543)

### Error: "database does not exist"
- Ensure you're connecting to `postgres` database
- Check project reference is correct

---

## When to Use vs Not Use

### ✅ Use SUPABASE_DB_URL for:
- Database backups (`pg_dump`)
- Direct SQL scripts (`scripts/run-sql.mjs`)
- Migration tools that need direct DB access
- Data export/import scripts

### ❌ Don't use SUPABASE_DB_URL for:
- Frontend application (use `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`)
- Edge functions (use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
- Normal API calls (use Supabase client library)
- Most application code

---

## Quick Reference

**Your current connection string format:**
```
postgresql://postgres.pzptocwdaqpczexlbajr:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

**To get the password:**
1. Supabase Dashboard → Project Settings → Database
2. Click "Reset database password" (if needed)
3. Copy the password

**To use it:**
```bash
# In .env.local
SUPABASE_DB_URL=postgresql://postgres.pzptocwdaqpczexlbajr:your-password@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

---

**Last Updated:** 2025-11-20

