-- Allow resident_support in website_form_submissions.form_type (contact form variant)
ALTER TABLE website_form_submissions DROP CONSTRAINT IF EXISTS website_form_type_check;
ALTER TABLE website_form_submissions ADD CONSTRAINT website_form_type_check
  CHECK (form_type IN ('contact', 'callback', 'viewing', 'inquiry', 'resident_support', 'short_term'));
