-- Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Add is_read column if table exists but column doesn't
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

-- Add read_at column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'read_at'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN read_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON public.notifications(created_at DESC);

-- RLS Policies for Notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate
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

-- Email Templates Table
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  template_type TEXT NOT NULL CHECK (template_type IN (
    'welcome',
    'application_received',
    'deposit_reminder',
    'payment_reminder',
    'overdue_payment',
    'application_confirmed',
    'document_approved',
    'document_rejected',
    'signature_reminder',
    'custom'
  )),
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_templates_type ON public.email_templates(template_type);
CREATE INDEX idx_email_templates_active ON public.email_templates(is_active);

DROP TRIGGER IF EXISTS set_timestamp_email_templates ON public.email_templates;
CREATE TRIGGER set_timestamp_email_templates
BEFORE UPDATE ON public.email_templates
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- RLS Policies for Email Templates
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists and recreate
DROP POLICY IF EXISTS "Staff manage email templates" ON public.email_templates;

-- Staff can manage email templates
CREATE POLICY "Staff manage email templates" ON public.email_templates
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Bulk Messages Table (for tracking sent messages)
CREATE TABLE IF NOT EXISTS public.bulk_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'info' CHECK (notification_type IN ('info', 'success', 'warning', 'error')),
  email_template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  filters JSONB DEFAULT '{}'::jsonb,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  notifications_sent INTEGER NOT NULL DEFAULT 0,
  emails_sent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_bulk_messages_status ON public.bulk_messages(status);
CREATE INDEX idx_bulk_messages_created ON public.bulk_messages(created_at DESC);

-- RLS Policies for Bulk Messages
ALTER TABLE public.bulk_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists and recreate
DROP POLICY IF EXISTS "Staff manage bulk messages" ON public.bulk_messages;

-- Staff can manage bulk messages
CREATE POLICY "Staff manage bulk messages" ON public.bulk_messages
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

