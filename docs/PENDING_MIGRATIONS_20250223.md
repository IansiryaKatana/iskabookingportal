# Pending Migrations - February 23, 2025

## Summary
There are **4 new migrations** that need to be run in Supabase to implement the Studio Allocation changes.

## Migration Files (in order)

### 1. `20250223_studio_allocation_constraints.sql`
**Purpose**: Adds check constraint and index for studio allocation values
**Changes**:
- Adds check constraint to ensure allocation values are valid (Student, OTA, Keyworkers, Unallocated, or UUID)
- Creates index on allocation column for performance
- Updates column comment

**Run Order**: Should be run first

---

### 2. `20250223_update_availability_exclude_ota_keyworkers.sql`
**Purpose**: Updates availability calculations to exclude OTA/Keyworkers allocated studios
**Changes**:
- Updates `get_studio_availability()` function to exclude OTA/Keyworkers studios
- Updates `studio_grade_availability_by_year` view to exclude OTA/Keyworkers studios
- Ensures OTA/Keyworkers studios don't count toward student availability

**Run Order**: Should be run second

---

### 3. `20250223_update_studio_status_view_exclude_ota_keyworkers.sql`
**Purpose**: Updates studio status view to handle OTA/Keyworkers allocation
**Changes**:
- Updates `studio_status_by_academic_year` view
- Ensures OTA/Keyworkers allocated studios are marked as unavailable to students

**Run Order**: Should be run third

---

### 4. `20250223_update_auto_allocation_trigger.sql`
**Purpose**: Updates auto-allocation trigger to set Student allocation on confirmation
**Changes**:
- Updates `handle_application_confirmation()` function
- Sets `allocation = 'Student'` when application is confirmed
- Clears allocation when application is unconfirmed

**Run Order**: Should be run last

---

## How to Run Migrations

### Option 1: Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open each migration file in order
4. Copy and paste the SQL content
5. Run each migration sequentially

### Option 2: Supabase CLI (if authenticated)
```bash
npx supabase db push
```

### Option 3: Manual SQL Execution
1. Connect to your Supabase database
2. Run each migration file in the order listed above
3. Verify each migration completes successfully

---

## Verification Steps

After running all migrations, verify:

1. **Allocation Constraint**:
   ```sql
   SELECT constraint_name 
   FROM information_schema.table_constraints 
   WHERE table_name = 'studios' 
   AND constraint_name = 'studios_allocation_check';
   ```

2. **Allocation Index**:
   ```sql
   SELECT indexname 
   FROM pg_indexes 
   WHERE tablename = 'studios' 
   AND indexname = 'idx_studios_allocation';
   ```

3. **Updated Function**:
   ```sql
   SELECT proname 
   FROM pg_proc 
   WHERE proname = 'get_studio_availability';
   ```

4. **Updated Views**:
   ```sql
   SELECT viewname 
   FROM pg_views 
   WHERE viewname IN (
     'studio_grade_availability_by_year',
     'studio_status_by_academic_year'
   );
   ```

5. **Updated Trigger Function**:
   ```sql
   SELECT proname 
   FROM pg_proc 
   WHERE proname = 'handle_application_confirmation';
   ```

---

## Important Notes

- ⚠️ **Run migrations in order** - They depend on each other
- ⚠️ **Backup your database** before running migrations (recommended)
- ⚠️ **Test in a development environment first** if possible
- ✅ Migrations are **idempotent** where possible (using `CREATE OR REPLACE`, `IF NOT EXISTS`, etc.)
- ✅ No data loss expected - these are additive/update migrations

---

## Migration Status

- [ ] `20250223_studio_allocation_constraints.sql`
- [ ] `20250223_update_availability_exclude_ota_keyworkers.sql`
- [ ] `20250223_update_studio_status_view_exclude_ota_keyworkers.sql`
- [ ] `20250223_update_auto_allocation_trigger.sql`

---

**Created**: February 23, 2025  
**Status**: Pending

