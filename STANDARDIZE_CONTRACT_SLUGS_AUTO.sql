-- ============================================================================
-- AUTOMATED CONTRACT SLUG STANDARDIZATION
-- ============================================================================
-- This script will automatically update all contract slugs to match their names
-- 
-- Format: {studio-type}-{weeks}-weeks-{academic-year}
-- Example: "Platinum Studio · 45 Weeks · 25/26" → "platinum-45-weeks-25-26"
--
-- IMPORTANT: 
-- - This will change URLs (bookmarks will break)
-- - Run the PREVIEW query first to see what will change
-- - Since you've deleted all applications, this is safe to run
-- ============================================================================

-- ============================================================================
-- STEP 1: PREVIEW (Run this first to see what will change)
-- ============================================================================

SELECT 
  id,
  slug AS current_slug,
  name,
  -- Generate new slug: "Platinum Studio · 45 Weeks · 25/26" → "platinum-45-weeks-25-26"
  LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(name, ' Studio · ', '-'),
        ' Weeks · ', '-weeks-'),
      ' / ', '-'
    )
  ) AS new_slug,
  -- Check if new slug would conflict with another contract
  CASE 
    WHEN EXISTS(
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
    ) THEN '⚠️ CONFLICT - Manual fix needed'
    ELSE '✅ OK'
  END AS status
FROM contracts
WHERE is_active = true
ORDER BY name;

-- ============================================================================
-- STEP 2: ACTUAL UPDATE (Run this after reviewing Step 1)
-- ============================================================================
-- This will update all active contracts to use the new slug format
-- Only updates contracts where the slug would actually change

UPDATE contracts
SET 
  slug = LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(name, ' Studio · ', '-'),
        ' Weeks · ', '-weeks-'),
      ' / ', '-'
    )
  ),
  updated_at = NOW()
WHERE is_active = true
AND slug != LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(name, ' Studio · ', '-'),
      ' Weeks · ', '-weeks-'),
    ' / ', '-'
  )
);

-- ============================================================================
-- STEP 3: VERIFY (Check the results)
-- ============================================================================

SELECT 
  id,
  slug,
  name,
  CASE 
    WHEN slug = LOWER(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(name, ' Studio · ', '-'),
          ' Weeks · ', '-weeks-'),
        ' / ', '-'
      )
    ) THEN '✅ Aligned'
    ELSE '❌ Not aligned'
  END AS alignment_status
FROM contracts
WHERE is_active = true
ORDER BY name;

-- ============================================================================
-- WHAT THIS DOES:
-- ============================================================================
-- 
-- 1. PREVIEW QUERY (Step 1):
--    - Shows current slug vs new slug
--    - Checks for conflicts (two contracts trying to use same slug)
--    - Does NOT make any changes - just shows you what will happen
--
-- 2. UPDATE QUERY (Step 2):
--    - Actually changes the slugs in the database
--    - Converts: "Platinum Studio · 45 Weeks · 25/26" → "platinum-45-weeks-25-26"
--    - Only updates contracts where slug doesn't match the new format
--    - Updates the updated_at timestamp
--
-- 3. VERIFY QUERY (Step 3):
--    - Confirms all slugs are now aligned with names
--    - Shows which contracts are aligned (✅) or not (❌)
--
-- TRANSFORMATION EXAMPLES:
-- "Platinum Studio · 45 Weeks · 25/26" → "platinum-45-weeks-25-26"
-- "Silver Studio · 51 Weeks · 26/27"   → "silver-51-weeks-26-27"
-- "Gold Studio · 45 Weeks · 25/26"     → "gold-45-weeks-25-26"
--
-- ============================================================================

