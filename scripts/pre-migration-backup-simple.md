# Quick Backup Instructions - Phase 1 Migration

## ⚠️ IMPORTANT: Backup Before Running Migration

Even though Phase 1 migration is **zero-risk**, always backup before any database changes.

---

## Recommended Method: Supabase Dashboard Backup

### Step-by-Step:

1. **Go to Supabase Dashboard**
   - URL: https://supabase.com/dashboard
   - Select your project

2. **Navigate to Backups**
   - Click **"Database"** in left sidebar
   - Click **"Backups"** tab

3. **Create Manual Backup**
   - Click **"Create Backup"** or **"New Backup"** button
   - Name it: `pre-phase1-indexes-2025-01-28`
   - Click **"Create"**

4. **Wait for Completion**
   - Backup usually takes 1-5 minutes
   - You'll see it in the backups list when complete

5. **Verify Backup**
   - Check backup appears in list
   - Note the timestamp
   - (Optional) Download backup file

---

## Pre-Migration Verification Queries

Run these in Supabase SQL Editor **BEFORE** migration and save the results:

### Query 1: Check Current Indexes
```sql
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

### Query 2: Check Row Counts
```sql
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

### Query 3: Check Database Size
```sql
SELECT 
  pg_size_pretty(pg_database_size(current_database())) as database_size;
```

**Save these results** - you'll compare them after migration to verify everything is correct.

---

## After Backup is Complete

✅ Backup created  
✅ Verification queries run and saved  
✅ Ready to proceed with Phase 1 migration

---

## Full Documentation

See `docs/BACKUP_GUIDE_PHASE1.md` for complete backup guide with all methods.

