-- Migration: Add account_invitation template type and create default template
-- This allows bulk invitations to use a proper email template instead of default password reset

-- ============================================================================
-- UPDATE EMAIL_TEMPLATES TABLE TO INCLUDE ACCOUNT_INVITATION TEMPLATE TYPE
-- ============================================================================

-- Drop existing constraint
ALTER TABLE public.email_templates 
DROP CONSTRAINT IF EXISTS email_templates_template_type_check;

-- Add new constraint with account_invitation template type
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
  'email_confirmation',
  'password_reset',
  'account_invitation', -- NEW: For account invitation emails (bulk invitations)
  'custom'
));

-- ============================================================================
-- CREATE DEFAULT ACCOUNT INVITATION TEMPLATE
-- ============================================================================

-- Check if template already exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.email_templates 
    WHERE name = 'Account Invitation' 
    AND template_type = 'account_invitation'
  ) THEN
    INSERT INTO public.email_templates (
      name,
      subject,
      body_html,
      body_text,
      template_type,
      variables,
      is_active
    ) VALUES (
      'Account Invitation',
      'Activate Your Student Portal Account - {contract_name}',
      '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activate Your Account</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Welcome to Your Student Portal</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Hello {student_name},
              </p>
              
              <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.6;">
                Your account has been created for the <strong>{contract_name}</strong> {academic_year} academic year. 
                You can now activate your account and access your student portal.
              </p>
              
              <p style="margin: 0 0 30px; color: #333333; font-size: 16px; line-height: 1.6;">
                Click the button below to set your password and activate your account:
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; margin: 30px 0;">
                <tr>
                  <td style="text-align: center;">
                    <a href="{invitation_link}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">
                      Activate Account
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 20px; color: #666666; font-size: 14px; line-height: 1.6;">
                Or copy and paste this link into your browser:
              </p>
              
              <p style="margin: 0 0 30px; padding: 12px; background-color: #f5f5f5; border-radius: 4px; word-break: break-all; color: #333333; font-size: 12px; font-family: monospace;">
                {invitation_link}
              </p>
              
              <div style="margin: 30px 0; padding: 20px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.6;">
                  <strong>Important:</strong> This invitation link will expire on <strong>{expiration_date}</strong>. 
                  Please activate your account before this date.
                </p>
              </div>
              
              <p style="margin: 30px 0 0; color: #333333; font-size: 16px; line-height: 1.6;">
                Once activated, you can access your portal at:
              </p>
              
              <p style="margin: 10px 0 30px;">
                <a href="{portal_url}" style="color: #667eea; text-decoration: none; font-weight: 600;">{portal_url}</a>
              </p>
              
              <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.6;">
                If you did not expect this invitation, please ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; background-color: #f8f9fa; border-radius: 0 0 8px 8px; border-top: 1px solid #e9ecef;">
              <p style="margin: 0 0 10px; color: #666666; font-size: 12px;">
                This is an automated message. Please do not reply to this email.
              </p>
              <p style="margin: 0; color: #999999; font-size: 11px;">
                © {year} Student Portal. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
      'Hello {student_name},

Your account has been created for the {contract_name} {academic_year} academic year. You can now activate your account and access your student portal.

Click the link below to set your password and activate your account:

{invitation_link}

Important: This invitation link will expire on {expiration_date}. Please activate your account before this date.

Once activated, you can access your portal at: {portal_url}

If you did not expect this invitation, please ignore this email.

---
This is an automated message. Please do not reply to this email.',
      'account_invitation',
      '["student_name", "portal_url", "invitation_link", "contract_name", "academic_year", "expiration_date"]'::jsonb,
      true
    );
  END IF;
END $$;

-- Add comment
COMMENT ON CONSTRAINT email_templates_template_type_check ON public.email_templates IS 
'Template types include: welcome, application_received, deposit_reminder, payment_reminder, overdue_payment, application_confirmed, document_approved, document_rejected, signature_reminder, email_confirmation, password_reset, account_invitation, custom';

