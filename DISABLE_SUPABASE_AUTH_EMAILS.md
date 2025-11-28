# How to Disable Supabase Auth Emails

**Issue:** Supabase Auth is still sending its default confirmation emails instead of using your custom Resend email templates.

## Solution: Disable Email Confirmations in Supabase Dashboard

### Step 1: Go to Supabase Dashboard

1. Open your Supabase project: https://supabase.com/dashboard/project/pzptocwdaqpczexlbajr
2. Navigate to: **Authentication** → **Settings** (in the left sidebar)
3. Scroll down to the **"Email Auth"** section

### Step 2: Disable Email Confirmations

Find the setting **"Enable email confirmations"** and **TURN IT OFF** (toggle should be disabled/gray).

**Location:**
- Authentication → Settings → Email Auth → "Enable email confirmations" → **OFF**

### Step 3: Alternative Option - Configure Custom SMTP (Optional)

If you want Supabase to use Resend SMTP instead:

1. In the same **Authentication** → **Settings** page
2. Scroll to **"SMTP Settings"** section
3. Enable **"Enable Custom SMTP"**
4. Enter Resend SMTP credentials:
   - **Host:** `smtp.resend.com`
   - **Port:** `465` (SSL) or `587` (TLS)
   - **Username:** `resend`
   - **Password:** Your Resend API key
   - **Sender email:** Your verified Resend email address (e.g., `noreply@send.portal.urbanhub.uk`)
   - **Sender name:** Your company name

### Step 4: Verify Settings

After disabling email confirmations:
- ✅ Users will be automatically logged in after registration (no confirmation needed)
- ✅ Your custom Resend email system will automatically send welcome/confirmation emails
- ✅ Supabase won't send default auth emails
- ✅ Custom emails are sent via the `send-confirmation-email` edge function

## How It Works Now

1. User registers → Automatically logged in (confirmations disabled)
2. System automatically sends custom Resend email with:
   - Welcome message
   - Optional confirmation link (they're already logged in, but link is still provided)
   - Uses your `email_confirmation` template from the database
3. All emails use your Resend configuration and branding

## Important Notes

⚠️ **After disabling email confirmations:**
- Users are immediately authenticated after signup
- No confirmation link is required
- You should ensure your custom Resend email system is working to send welcome emails

## Where Your Custom Emails Are Sent

Your custom emails are sent via:
- Edge Function: `send-transactional-email`
- Edge Function: `send-confirmation-email`
- Admin portal: Bulk Messages and Targeted Messages

These use your Resend configuration and email templates stored in the `email_templates` table.

---

**Quick Path:**
Supabase Dashboard → Authentication → Settings → Email Auth → **Disable "Enable email confirmations"**

