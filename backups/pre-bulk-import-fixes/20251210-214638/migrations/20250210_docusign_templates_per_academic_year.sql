-- Create docusign_templates table to store template IDs per academic year
CREATE TABLE IF NOT EXISTS public.docusign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  template_type text NOT NULL CHECK (template_type IN ('tenancy', 'guarantor')),
  template_id text NOT NULL, -- DocuSign template ID (GUID)
  role_names jsonb DEFAULT '{}'::jsonb, -- Store role names like {"student": "Tenant", "witness": "Witness", "guarantor": "Guarantor"}
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT docusign_templates_unique_academic_year_type UNIQUE(academic_year_id, template_type)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS docusign_templates_academic_year_idx 
  ON public.docusign_templates(academic_year_id, template_type) 
  WHERE is_active = true;

-- RLS Policies
ALTER TABLE public.docusign_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active templates" ON public.docusign_templates
  FOR SELECT USING (is_active = true);

CREATE POLICY "Staff manage templates" ON public.docusign_templates
  FOR ALL USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_timestamp_docusign_templates ON public.docusign_templates;
CREATE TRIGGER set_timestamp_docusign_templates
BEFORE UPDATE ON public.docusign_templates
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Comment on table
COMMENT ON TABLE public.docusign_templates IS 'Stores DocuSign template IDs per academic year for tenancy and guarantor agreements';
COMMENT ON COLUMN public.docusign_templates.template_type IS 'Type of template: tenancy or guarantor';
COMMENT ON COLUMN public.docusign_templates.template_id IS 'DocuSign template ID (GUID format)';
COMMENT ON COLUMN public.docusign_templates.role_names IS 'JSON object storing role names for the template, e.g. {"student": "Tenant", "witness": "Witness", "guarantor": "Guarantor"}';

