-- Migration: Add email_confirmation and password_reset template types
-- This allows email templates to be created for confirmation and password reset flows

-- ============================================================================
-- UPDATE EMAIL_TEMPLATES TABLE TO INCLUDE NEW TEMPLATE TYPES
-- ============================================================================

-- Drop existing constraint
ALTER TABLE public.email_templates 
DROP CONSTRAINT IF EXISTS email_templates_template_type_check;

-- Add new constraint with additional template types
ALTER TABLE public.email_templates
ADD CONSTRAINT email_templates_template_type_check 
CHECK (template_type IN (
  'welcome',
  'application_received',
  'deposit_reminder',
  'payment_reminder',
  'overdue_payment',
  'application_confirmed',
  'document_approved',
  'document_rejected',
  'signature_reminder',
  'email_confirmation', -- NEW: For email confirmation emails
  'password_reset', -- NEW: For password reset emails
  'custom'
));

-- ============================================================================
-- CREATE DEFAULT EMAIL CONFIRMATION TEMPLATE
-- ============================================================================

INSERT INTO public.email_templates (
  name,
  subject,
  body_html,
  body_text,
  template_type,
  variables,
  is_active
) VALUES (
  'Email Confirmation',
  'Confirm your email address - {company_name}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, hsl(0 85% 55%) 0%, hsl(0 75% 50%) 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">
                {company_name}
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #1a1a1a; font-size: 24px; font-weight: 600;">
                Confirm Your Email Address
              </h2>
              
              <p style="margin: 0 0 20px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                Hello {student_name},
              </p>
              
              <p style="margin: 0 0 30px; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                Thank you for registering with {company_name}! To complete your registration and set up your account password, please confirm your email address by clicking the button below.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="{confirmation_link}" style="display: inline-block; padding: 14px 32px; background-color: hsl(0 85% 55%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">
                      Confirm Email Address
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 20px; color: #666666; font-size: 14px; line-height: 1.6;">
                If the button doesn''t work, copy and paste this link into your browser:
              </p>
              
              <p style="margin: 0 0 30px; color: #0066cc; font-size: 14px; word-break: break-all; line-height: 1.6;">
                {confirmation_link}
              </p>
              
              <p style="margin: 0 0 20px; color: #666666; font-size: 14px; line-height: 1.6;">
                This link will expire in 24 hours. If you didn''t create an account with {company_name}, please ignore this email.
              </p>
              
              <p style="margin: 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                Best regards,<br>
                <strong style="color: hsl(0 85% 55%);">{company_name} Team</strong>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f9f9f9; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e5e5;">
              <p style="margin: 0 0 10px; color: #666666; font-size: 12px; text-align: center;">
                © {current_year} {company_name}. All rights reserved.
              </p>
              <p style="margin: 0; color: #999999; font-size: 12px; text-align: center;">
                This email was sent to {student_email} as part of your {company_name} account.
              </p>
              {#if support_email}
              <p style="margin: 10px 0 0; color: #666666; font-size: 12px; text-align: center;">
                Need help? Contact us at <a href="mailto:{support_email}" style="color: hsl(0 85% 55%); text-decoration: none;">{support_email}</a>
              </p>
              {/if}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  'Confirm Your Email Address - {company_name}

Hello {student_name},

Thank you for registering with {company_name}! To complete your registration and set up your account password, please confirm your email address by clicking the link below:

{confirmation_link}

This link will expire in 24 hours. If you didn''t create an account with {company_name}, please ignore this email.

Best regards,
{company_name} Team

---
© {current_year} {company_name}. All rights reserved.
This email was sent to {student_email} as part of your {company_name} account.',
  'email_confirmation',
  '["company_name", "student_name", "confirmation_link", "student_email", "support_email", "current_year"]'::jsonb,
  true
) ON CONFLICT (name) DO UPDATE
SET 
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  variables = EXCLUDED.variables,
  updated_at = NOW();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON CONSTRAINT email_templates_template_type_check ON public.email_templates IS 
'Validates template_type includes email_confirmation and password_reset for custom email flows';

