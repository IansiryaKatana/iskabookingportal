-- Add all system colors and fonts to branding_settings
-- Uses current system values as defaults (from index.css and tailwind.config.ts)
-- This centralizes all branding so it can be changed in one place

-- ============================================================================
-- PART 1: ADD COLOR SETTINGS (using current HSL values converted to hex)
-- ============================================================================

-- Primary Colors
INSERT INTO public.branding_settings (setting_key, setting_value, setting_type, description) VALUES
  ('color_primary', '#E63946', 'color', 'Primary brand color (HSL: 0, 85%, 55%)'),
  ('color_primary_foreground', '#FFFFFF', 'color', 'Text color on primary background (HSL: 0, 0%, 100%)'),
  ('color_secondary', '#FAFAFA', 'color', 'Secondary color (HSL: 0, 0%, 98%)'),
  ('color_secondary_foreground', '#000000', 'color', 'Text color on secondary background (HSL: 0, 0%, 0%)'),
  ('color_accent', '#FFD60A', 'color', 'Accent color (HSL: 45, 100%, 51%)'),
  ('color_accent_foreground', '#000000', 'color', 'Text color on accent background (HSL: 0, 0%, 0%)'),
  ('color_destructive', '#EF4444', 'color', 'Destructive/error color (HSL: 0, 84.2%, 60.2%)'),
  ('color_destructive_foreground', '#F8FAFC', 'color', 'Text color on destructive background (HSL: 210, 40%, 98%)'),
  ('color_muted', '#F1F5F9', 'color', 'Muted background color (HSL: 210, 40%, 96.1%)'),
  ('color_muted_foreground', '#64748B', 'color', 'Muted text color (HSL: 215.4, 16.3%, 46.9%)'),
  ('color_success', '#10B981', 'color', 'Success color (for fully paid status, badges, etc.)'),
  ('color_success_foreground', '#FFFFFF', 'color', 'Text color on success background'),
  ('color_background', '#FFFFFF', 'color', 'Main background color (HSL: 0, 0%, 100%)'),
  ('color_foreground', '#000000', 'color', 'Main text color (HSL: 0, 0%, 0%)'),
  ('color_border', '#E2E8F0', 'color', 'Border color (HSL: 214.3, 31.8%, 91.4%)'),
  ('color_card', '#FFFFFF', 'color', 'Card background color (HSL: 0, 0%, 100%)'),
  ('color_card_foreground', '#000000', 'color', 'Card text color (HSL: 0, 0%, 0%)')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- PART 2: ADD FONT SETTINGS (using current system fonts)
-- ============================================================================

INSERT INTO public.branding_settings (setting_key, setting_value, setting_type, description) VALUES
  ('font_family_body', 'Inter Tight', 'text', 'Body font family (used for main content)'),
  ('font_family_display', 'Big Shoulders Display', 'text', 'Display/heading font family (used for titles and headings)'),
  ('font_family_body_fallback', 'sans-serif', 'text', 'Body font fallback'),
  ('font_family_display_fallback', 'sans-serif', 'text', 'Display font fallback')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- PART 3: COMMENTS
-- ============================================================================

COMMENT ON TABLE public.branding_settings IS 
'Stores branding assets, colors, fonts, and text content.
All system colors and fonts are centralized here for easy management.
Colors are stored in hex format (#RRGGBB).
Fonts are stored as font family names.';

