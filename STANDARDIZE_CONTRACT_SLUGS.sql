-- Standardize Contract Slugs
-- This script helps align contract slugs with their names
-- 
-- IMPORTANT: Review and test before running in production!
-- 
-- Steps:
-- 1. Review the SELECT query below to see what changes will be made
-- 2. Test on a development database first
-- 3. Backup your database before running
-- 4. Update any CSV files that reference old slugs
-- 5. Note: URLs will change, so bookmarks/links will break

-- ============================================================================
-- STEP 1: PREVIEW CHANGES (Run this first to see what will change)
-- ============================================================================

SELECT 
  id,
  slug AS current_slug,
  name,
  -- Generate suggested new slug based on name
  LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(name, ' Studio · ', '-'),
        ' Weeks · ', '-weeks-'),
      ' / ', '-'
    )
  ) AS suggested_slug,
  -- Check if suggested slug already exists (conflict check)
  EXISTS(
    SELECT 1 FROM contracts c2 
    WHERE c2.slug = LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(name, ' Studio · ', '-'),
          ' Weeks · ', '-weeks-'),
        ' / ', '-'
      )
    )
    AND c2.id != contracts.id
  ) AS would_conflict
FROM contracts
WHERE is_active = true
ORDER BY name;

-- ============================================================================
-- STEP 2: MANUAL REVIEW
-- ============================================================================
-- Review the output above. If there are conflicts, you'll need to handle them manually.
-- For conflicts, you might need to add a suffix or use a different format.

-- ============================================================================
-- STEP 3: UPDATE SLUGS (Only run after reviewing Step 1)
-- ============================================================================
-- Uncomment and run this AFTER reviewing the preview above

/*
UPDATE contracts
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(name, ' Studio · ', '-'),
      ' Weeks · ', '-weeks-'),
    ' / ', '-'
  )
)
WHERE is_active = true
AND slug != LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(name, ' Studio · ', '-'),
      ' Weeks · ', '-weeks-'),
    ' / ', '-'
  )
);
*/

-- ============================================================================
-- ALTERNATIVE: Manual Update (Safer for specific contracts)
-- ============================================================================
-- If you prefer to update specific contracts manually, use this format:

/*
UPDATE contracts
SET slug = 'platinum-45-weeks-25-26'
WHERE id = 'your-contract-uuid-here';
*/

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. Slug format: {studio-type}-{weeks}-weeks-{academic-year}
--    Example: "platinum-45-weeks-25-26"
--
-- 2. After updating slugs:
--    - Any bookmarked URLs will break (users will need to re-bookmark)
--    - Update any CSV files that reference old slugs
--    - The reference file download will show new slugs automatically
--
-- 3. Slug rules:
--    - Must be unique
--    - Must be URL-friendly (lowercase, hyphens, no spaces)
--    - Should be descriptive and match the name format
--
-- 4. Best practice:
--    - Keep slugs consistent across all contracts
--    - Use the same format: {type}-{weeks}-weeks-{year}
--    - Avoid random suffixes (like d47b0f65) unless necessary for uniqueness

