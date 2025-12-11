-- Login Dialog Tracking for Unread Messages
-- Tracks if login dialog has been shown for unread bulk/targeted messages

-- ============================================================================
-- PART 1: ADD FIELD TO notifications TABLE
-- ============================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS login_dialog_shown BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_login_dialog_shown 
  ON public.notifications(user_id, login_dialog_shown, is_read)
  WHERE login_dialog_shown = FALSE AND is_read = FALSE;

-- ============================================================================
-- PART 2: COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.notifications.login_dialog_shown IS 
  'Tracks if the login dialog has been shown for this notification. Prevents showing dialog multiple times for the same message.';

