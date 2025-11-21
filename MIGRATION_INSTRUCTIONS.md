# Academic Year Implementation - Migration Instructions

## Step 1: Run the SQL Migration

You need to run the database migration to create the new view for academic year-specific availability.

### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy the entire contents of `supabase/migrations/20251120_studio_availability_by_academic_year.sql`
5. Paste it into the SQL Editor
6. Click **Run** (or press Ctrl+Enter)

### Option B: Using Supabase CLI

If you have Supabase CLI set up locally:

```bash
supabase db push
```

This will run all pending migrations including the new one.

### Option C: Manual SQL Execution

1. Open `supabase/migrations/20251120_studio_availability_by_academic_year.sql`
2. Copy all the SQL code
3. Run it in your Supabase SQL Editor or database client

## Step 2: Verify the Migration

After running the migration, verify it worked:

```sql
-- Check if the view exists
SELECT * FROM studio_grade_availability_by_year LIMIT 1;
```

If this query runs without errors, the migration was successful.

## Step 3: Test the Application

1. **Start your development server** (if not already running):
   ```bash
   npm run dev
   ```

2. **Visit the catalog page**:
   - Go to `http://localhost:5173/` (or your dev URL)
   - It should redirect to `/studios/[year]` (e.g., `/studios/2025-2026`)

3. **Check for tabs**:
   - You should see academic year tabs at the top of the catalog page
   - If you have multiple academic years, you can switch between them
   - If you only have one academic year, you'll see a single tab showing that year

4. **Test availability**:
   - Studio availability should now be filtered by academic year
   - Studios booked for one year won't affect availability for other years

## Troubleshooting

### Tabs Not Showing?

1. **Check if you have academic years in the database**:
   ```sql
   SELECT * FROM academic_years WHERE is_active = true;
   ```

2. **Check browser console** for any errors

3. **Verify the migration ran successfully**:
   ```sql
   SELECT * FROM studio_grade_availability_by_year LIMIT 1;
   ```

### Availability Not Updating?

1. Make sure the migration created the view successfully
2. Check that your `academic_years` table has active years
3. Verify that `studio_grade_prices` are linked to academic years

## What Was Changed

- ✅ Created `studio_grade_availability_by_year` database view
- ✅ Updated routing to support `/studios/:year` and `/studios/:year/:slug`
- ✅ Added academic year tabs to catalog page
- ✅ Updated availability hooks to filter by academic year
- ✅ Made hero text and content dynamic based on selected year

## Next Steps

After running the migration and testing:
1. Create multiple academic years in the admin panel (if you haven't already)
2. Test switching between years
3. Verify availability counts are correct for each year

