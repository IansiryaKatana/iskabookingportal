-- Fix notifications table schema to match new format
-- This migration ensures the notifications table has the correct columns

-- Add type column if it doesn't exist (migrate from notification_type)
DO $$ 
BEGIN
  -- Check if type column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'type'
  ) THEN
    -- Add type column
    ALTER TABLE public.notifications ADD COLUMN type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error'));
    
    -- Migrate data from notification_type to type if notification_type exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'notifications' 
      AND column_name = 'notification_type'
    ) THEN
      UPDATE public.notifications SET type = notification_type WHERE type = 'info' AND notification_type IS NOT NULL;
    END IF;
  END IF;
END $$;

-- Ensure is_read column exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'is_read'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN is_read BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Ensure link column exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'link'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN link TEXT;
  END IF;
END $$;

-- Update RLS policies to ensure they work with the new schema
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Staff create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Staff view all notifications" ON public.notifications;

-- Users can view their own notifications
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Staff can create notifications for any user
CREATE POLICY "Staff create notifications" ON public.notifications
  FOR INSERT WITH CHECK (public.is_staff());

-- Staff can view all notifications
CREATE POLICY "Staff view all notifications" ON public.notifications
  FOR SELECT USING (public.is_staff());

