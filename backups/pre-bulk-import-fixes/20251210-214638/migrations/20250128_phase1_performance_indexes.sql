-- Phase 1: Performance Optimization - Database Indexes
-- Risk Level: ZERO - These are read-only optimizations that cannot break functionality
-- Date: 2025-01-28

-- ============================================================================
-- PART 1: Verify and Add Missing Indexes
-- ============================================================================

-- Note: Some indexes may already exist from previous migrations.
-- Using IF NOT EXISTS ensures idempotency (safe to run multiple times).

-- 1. Student Applications Indexes
-- These indexes improve query performance for common lookups

-- Index on student_id (may already exist from 20250209 migration)
-- Verifying and creating if missing
CREATE INDEX IF NOT EXISTS idx_student_applications_student_id_verify
  ON public.student_applications(student_id)
  WHERE student_id IS NOT NULL;

-- Index on contract_id (may already exist from 20250209 migration)
-- Verifying and creating if missing
CREATE INDEX IF NOT EXISTS idx_student_applications_contract_id_verify
  ON public.student_applications(contract_id)
  WHERE contract_id IS NOT NULL;

-- Composite index for common query pattern: status + academic year filtering
CREATE INDEX IF NOT EXISTS idx_student_applications_status_academic_year
  ON public.student_applications(status, contract_id)
  WHERE status IS NOT NULL;

-- Index for submitted_at queries (for sorting/filtering by submission date)
CREATE INDEX IF NOT EXISTS idx_student_applications_submitted_at
  ON public.student_applications(submitted_at DESC)
  WHERE submitted_at IS NOT NULL;

-- ============================================================================
-- PART 2: DocuSign Envelopes Indexes
-- ============================================================================

-- Index on application_id (may already exist from 20250316 migration)
-- Verifying and creating if missing
CREATE INDEX IF NOT EXISTS idx_docusign_envelopes_application_id_verify
  ON public.docusign_envelopes(application_id)
  WHERE application_id IS NOT NULL;

-- Composite index for status checks (common query: find envelopes by application and status)
CREATE INDEX IF NOT EXISTS idx_docusign_envelopes_app_status
  ON public.docusign_envelopes(application_id, status)
  WHERE application_id IS NOT NULL;

-- Index for envelope_id lookups (for webhook processing)
CREATE INDEX IF NOT EXISTS idx_docusign_envelopes_envelope_id
  ON public.docusign_envelopes(envelope_id)
  WHERE envelope_id IS NOT NULL;

-- ============================================================================
-- PART 3: Other Performance Indexes
-- ============================================================================

-- Index for notifications user_id + read status (common query pattern)
-- May already exist, but ensuring it's optimized
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON public.notifications(user_id, read_at)
  WHERE user_id IS NOT NULL;

-- Index for manual payments lookup by receipt number (for verification)
-- May already exist from 20250128 migration, but ensuring uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_payments_receipt_number_unique_verify
  ON public.manual_payments(receipt_number)
  WHERE receipt_number IS NOT NULL;

-- Index for studio allocations (for availability queries)
CREATE INDEX IF NOT EXISTS idx_studios_allocation_status
  ON public.studios(allocation, status)
  WHERE allocation IS NOT NULL;

-- ============================================================================
-- PART 4: Comments and Documentation
-- ============================================================================

-- Note: COMMENT ON INDEX doesn't support IF EXISTS, so we use DO blocks to safely add comments
-- These comments are optional and won't break if indexes don't exist

DO $$
BEGIN
  -- Add comments only if indexes exist
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_student_applications_student_id_verify') THEN
    COMMENT ON INDEX idx_student_applications_student_id_verify IS
      'Performance index for student application lookups by student_id';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_student_applications_contract_id_verify') THEN
    COMMENT ON INDEX idx_student_applications_contract_id_verify IS
      'Performance index for student application lookups by contract_id';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_student_applications_status_academic_year') THEN
    COMMENT ON INDEX idx_student_applications_status_academic_year IS
      'Composite index for filtering applications by status and contract (academic year)';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_docusign_envelopes_application_id_verify') THEN
    COMMENT ON INDEX idx_docusign_envelopes_application_id_verify IS
      'Performance index for DocuSign envelope lookups by application_id';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_docusign_envelopes_app_status') THEN
    COMMENT ON INDEX idx_docusign_envelopes_app_status IS
      'Composite index for checking envelope status by application';
  END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after migration to verify indexes exist)
-- ============================================================================

-- To verify indexes were created, run:
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename IN ('student_applications', 'docusign_envelopes', 'notifications', 'manual_payments', 'studios')
-- AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;

