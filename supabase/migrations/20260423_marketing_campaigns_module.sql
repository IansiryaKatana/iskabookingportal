-- Marketing campaigns module (separate from student bulk messaging)

-- Contacts imported or managed by marketing
CREATE TABLE IF NOT EXISTS public.marketing_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT,
  source TEXT NOT NULL DEFAULT 'manual_import',
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  is_subscribed BOOLEAN NOT NULL DEFAULT true,
  unsubscribed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_contacts_email_unique
  ON public.marketing_contacts (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_subscribed
  ON public.marketing_contacts (is_subscribed);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_created
  ON public.marketing_contacts (created_at DESC);

-- Dedicated templates for marketing campaigns
CREATE TABLE IF NOT EXISTS public.marketing_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_email_templates_name_unique
  ON public.marketing_email_templates (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_marketing_email_templates_active
  ON public.marketing_email_templates (is_active);

-- Campaign master record
CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES public.marketing_email_templates(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'completed', 'failed')),
  audience_source TEXT NOT NULL DEFAULT 'manual_upload',
  total_recipients INTEGER NOT NULL DEFAULT 0,
  emails_sent INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status
  ON public.marketing_campaigns (status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_created
  ON public.marketing_campaigns (created_at DESC);

-- Recipient snapshot per campaign (keeps analytics stable even if contacts change)
CREATE TABLE IF NOT EXISTS public.marketing_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  send_status TEXT NOT NULL DEFAULT 'pending' CHECK (send_status IN ('pending', 'sent', 'failed', 'skipped')),
  resend_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaign_recipients_campaign
  ON public.marketing_campaign_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaign_recipients_status
  ON public.marketing_campaign_recipients (send_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_campaign_recipients_unique_email
  ON public.marketing_campaign_recipients (campaign_id, LOWER(email));

DROP TRIGGER IF EXISTS set_timestamp_marketing_contacts ON public.marketing_contacts;
CREATE TRIGGER set_timestamp_marketing_contacts
BEFORE UPDATE ON public.marketing_contacts
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_timestamp_marketing_email_templates ON public.marketing_email_templates;
CREATE TRIGGER set_timestamp_marketing_email_templates
BEFORE UPDATE ON public.marketing_email_templates
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_timestamp_marketing_campaigns ON public.marketing_campaigns;
CREATE TRIGGER set_timestamp_marketing_campaigns
BEFORE UPDATE ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

ALTER TABLE public.marketing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage marketing contacts" ON public.marketing_contacts;
CREATE POLICY "Staff manage marketing contacts" ON public.marketing_contacts
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff manage marketing templates" ON public.marketing_email_templates;
CREATE POLICY "Staff manage marketing templates" ON public.marketing_email_templates
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff manage marketing campaigns" ON public.marketing_campaigns;
CREATE POLICY "Staff manage marketing campaigns" ON public.marketing_campaigns
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff manage marketing campaign recipients" ON public.marketing_campaign_recipients;
CREATE POLICY "Staff manage marketing campaign recipients" ON public.marketing_campaign_recipients
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Route permissions so page is visible in permission-aware navigation
INSERT INTO public.route_permissions (route_path, route_name, role, allowed)
VALUES
  ('/admin/marketing-campaigns', 'Marketing Campaigns', 'staff', true),
  ('/admin/marketing-campaigns', 'Marketing Campaigns', 'superadmin', true)
ON CONFLICT (route_path, role) DO UPDATE
SET route_name = EXCLUDED.route_name,
    allowed = EXCLUDED.allowed,
    updated_at = NOW();
