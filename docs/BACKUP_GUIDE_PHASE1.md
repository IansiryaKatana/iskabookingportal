# Database Backup Guide - Phase 1 Migration
## Pre-Migration Backup Instructions

**Date:** 2025-01-28  
**Purpose:** Backup database before running Phase 1 performance indexes migration

---

## ⚠️ IMPORTANT: Backup Before Migration

Even though Phase 1 migration is **zero-risk** (indexes are read-only), it's always best practice to backup your database before any changes.

---

## Backup Methods

### Method 1: Supabase Dashboard Backup (Easiest) ⭐ RECOMMENDED

#### Step 1: Create Manual Backup
1. Go to your **Supabase Dashboard**
2. Navigate to **Database** → **Backups**
3. Click **"Create Backup"** or **"New Backup"**
4. Give it a name: `pre-phase1-indexes-2025-01-28`
5. Wait for backup to complete (usually 1-5 minutes)

#### Step 2: Verify Backup
1. Check backup appears in the list
2. Note the backup timestamp
3. Verify backup size is reasonable (should match your database size)

#### Step 3: Download Backup (Optional but Recommended)
1. Click on the backup
2. Click **"Download"** (if available)
3. Save to a secure location

**Note:** Supabase automatically creates daily backups, but a manual backup before migration is extra insurance.

---

### Method 2: SQL Export (Data Only)

#### Step 1: Export Critical Tables
Run these queries in Supabase SQL Editor and save the results:

```sql
-- Export student_applications (critical data)
SELECT * FROM public.student_applications
ORDER BY created_at DESC;

-- Export docusign_envelopes
SELECT * FROM public.docusign_envelopes
ORDER BY created_at DESC;

-- Export manual_payments
SELECT * FROM public.manual_payments
ORDER BY created_at DESC;

-- Export notifications
SELECT * FROM public.notifications
ORDER BY created_at DESC;

-- Export studios (current allocations)
SELECT * FROM public.studios
WHERE allocation IS NOT NULL
ORDER BY studio_number;
```

**How to Save:**
1. Run each query
2. Click **"Download CSV"** or **"Copy Results"**
3. Save to files: `backup_student_applications.csv`, etc.

---

### Method 3: Full Database Dump (Advanced)

#### Option A: Supabase CLI (If Installed)

```powershell
# Install Supabase CLI if not installed
# npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Create backup
supabase db dump -f backup_pre_phase1.sql
```

#### Option B: pg_dump (PostgreSQL Tool)

```powershell
# Get connection string from Supabase Dashboard
# Settings → Database → Connection String

# Run pg_dump (requires PostgreSQL client tools)
pg_dump "your-connection-string" > backup_pre_phase1.sql
```

**Note:** This requires PostgreSQL client tools installed on your machine.

---

## Pre-Migration Verification Queries

Run these queries **before** migration to verify current state:

### 1. Check Current Indexes
```sql
-- List all existing indexes on tables we'll be modifying
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename IN (
  'student_applications', 
  'docusign_envelopes', 
  'notifications', 
  'manual_payments', 
  'studios'
)
ORDER BY tablename, indexname;
```

**Save this output** - it shows what indexes exist before migration.

### 2. Check Table Row Counts
```sql
-- Verify data exists (sanity check)
SELECT 
  'student_applications' as table_name, 
  COUNT(*) as row_count 
FROM public.student_applications
UNION ALL
SELECT 
  'docusign_envelopes', 
  COUNT(*) 
FROM public.docusign_envelopes
UNION ALL
SELECT 
  'notifications', 
  COUNT(*) 
FROM public.notifications
UNION ALL
SELECT 
  'manual_payments', 
  COUNT(*) 
FROM public.manual_payments
UNION ALL
SELECT 
  'studios', 
  COUNT(*) 
FROM public.studios;
```

**Save this output** - verify row counts match after migration.

### 3. Check Database Size
```sql
-- Check current database size
SELECT 
  pg_size_pretty(pg_database_size(current_database())) as database_size;
```

**Save this output** - database size should not change significantly (indexes add minimal size).

---

## Backup Checklist

Before running migration, complete:

- [ ] **Method 1:** Created Supabase Dashboard backup
- [ ] **Method 2:** Exported critical table data (optional but recommended)
- [ ] **Verification:** Ran pre-migration queries and saved results
- [ ] **Documentation:** Noted backup timestamp and location
- [ ] **Confirmation:** Verified backup is accessible

---

## Post-Migration Verification

After running migration, verify:

### 1. Check New Indexes Were Created
```sql
-- Verify new indexes exist
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes 
WHERE tablename IN (
  'student_applications', 
  'docusign_envelopes', 
  'notifications', 
  'manual_payments', 
  'studios'
)
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

**Expected:** Should see new indexes like:
- `idx_student_applications_student_id_verify`
- `idx_student_applications_contract_id_verify`
- `idx_docusign_envelopes_application_id_verify`
- etc.

### 2. Verify Data Integrity
```sql
-- Verify row counts match (should be identical)
SELECT 
  'student_applications' as table_name, 
  COUNT(*) as row_count 
FROM public.student_applications
UNION ALL
SELECT 
  'docusign_envelopes', 
  COUNT(*) 
FROM public.docusign_envelopes
UNION ALL
SELECT 
  'notifications', 
  COUNT(*) 
FROM public.notifications
UNION ALL
SELECT 
  'manual_payments', 
  COUNT(*) 
FROM public.manual_payments
UNION ALL
SELECT 
  'studios', 
  COUNT(*) 
FROM public.studios;
```

**Expected:** Row counts should match pre-migration counts exactly.

### 3. Test Query Performance
```sql
-- Test a query that should benefit from new indexes
EXPLAIN ANALYZE
SELECT * FROM public.student_applications
WHERE student_id = (SELECT id FROM auth.users LIMIT 1);
```

**Expected:** Should see index usage in the query plan.

---

## Rollback Procedure (If Needed)

If you need to rollback (unlikely, but possible):

### Option 1: Drop New Indexes
```sql
-- Drop indexes if needed
DROP INDEX IF EXISTS idx_student_applications_student_id_verify;
DROP INDEX IF EXISTS idx_student_applications_contract_id_verify;
DROP INDEX IF EXISTS idx_student_applications_status_academic_year;
DROP INDEX IF EXISTS idx_student_applications_submitted_at;
DROP INDEX IF EXISTS idx_docusign_envelopes_application_id_verify;
DROP INDEX IF EXISTS idx_docusign_envelopes_app_status;
DROP INDEX IF EXISTS idx_docusign_envelopes_envelope_id;
DROP INDEX IF EXISTS idx_notifications_user_read;
DROP INDEX IF EXISTS idx_studios_allocation_status;
```

### Option 2: Restore from Backup
1. Go to Supabase Dashboard → Database → Backups
2. Select your backup
3. Click **"Restore"** (if available)
4. Confirm restoration

**Note:** Restoration may require Supabase support assistance depending on your plan.

---

## Backup Storage Recommendations

1. **Local Storage:** Save backups to your local machine
2. **Cloud Storage:** Upload to Google Drive, Dropbox, or AWS S3
3. **Version Control:** Don't commit backups to Git (too large, contains sensitive data)
4. **Retention:** Keep backups for at least 30 days

---

## Quick Backup Script (PowerShell)

If you have Supabase CLI installed, you can use this script:

```powershell
# backup-before-phase1.ps1
# Run this script before Phase 1 migration

$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$backupName = "backup_pre_phase1_$timestamp"

Write-Host "Creating backup: $backupName" -ForegroundColor Green

# Check if Supabase CLI is installed
if (Get-Command supabase -ErrorAction SilentlyContinue) {
    Write-Host "Using Supabase CLI..." -ForegroundColor Yellow
    
    # Create backup
    supabase db dump -f "$backupName.sql"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Backup created successfully: $backupName.sql" -ForegroundColor Green
    } else {
        Write-Host "Backup failed. Please use Supabase Dashboard method." -ForegroundColor Red
    }
} else {
    Write-Host "Supabase CLI not found." -ForegroundColor Yellow
    Write-Host "Please use Supabase Dashboard backup method:" -ForegroundColor Yellow
    Write-Host "1. Go to Supabase Dashboard" -ForegroundColor Cyan
    Write-Host "2. Database → Backups" -ForegroundColor Cyan
    Write-Host "3. Click 'Create Backup'" -ForegroundColor Cyan
}
```

**To use:**
1. Save as `backup-before-phase1.ps1`
2. Run: `.\backup-before-phase1.ps1`

---

## Summary

### Recommended Backup Process:
1. ✅ **Supabase Dashboard Backup** (Primary method)
2. ✅ **Run Pre-Migration Verification Queries** (Document current state)
3. ✅ **Save Query Results** (For comparison after migration)

### Time Required:
- Dashboard Backup: 2-5 minutes
- Verification Queries: 2-3 minutes
- **Total: ~5-10 minutes**

### Risk Level:
- **Migration Risk:** 0% (indexes are safe)
- **Backup Risk:** 0% (read-only operation)
- **Overall:** Very safe, but backup is still recommended

---

## Next Steps

After backup is complete:

1. ✅ Verify backup was created successfully
2. ✅ Save pre-migration verification results
3. ✅ Proceed to run Phase 1 migration
4. ✅ Run post-migration verification
5. ✅ Compare results (should match)

---

**Last Updated:** 2025-01-28  
**Status:** Ready for Backup

