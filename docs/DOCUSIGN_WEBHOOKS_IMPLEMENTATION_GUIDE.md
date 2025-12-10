# DocuSign Webhooks Implementation Guide
## Complete Setup & Configuration

**Date:** 2025-01-28  
**Purpose:** Step-by-step guide to implement DocuSign webhooks

---

## ✅ What's Been Done

### 1. **Backups Created** ✅
- ✅ `backups/docusign-webhooks-2025-01-28/docusign-check-status-index.ts.backup`
- ✅ `backups/docusign-webhooks-2025-01-28/ApplicationWizard-polling-section.backup`
- ✅ `docs/DOCUSIGN_WEBHOOKS_ROLLBACK_PLAN.md` - Complete rollback guide

### 2. **Webhook Handler Created** ✅
- ✅ `supabase/functions/docusign-webhook/index.ts` - New webhook endpoint

### 3. **Polling Updated** ✅
- ✅ Polling frequency reduced: 30 seconds → 5 minutes (backup only)
- ✅ Webhooks handle real-time updates
- ✅ Polling catches any missed webhooks

---

## 🚀 Implementation Steps

### Step 1: Deploy Webhook Handler

#### Option A: Supabase CLI
```bash
# Deploy the new webhook function
supabase functions deploy docusign-webhook
```

#### Option B: Supabase Dashboard
1. Go to Supabase Dashboard → Edge Functions
2. Create new function: `docusign-webhook`
3. Copy content from `supabase/functions/docusign-webhook/index.ts`
4. Deploy

---

### Step 2: Get Your Webhook URL

After deploying, your webhook URL will be:
```
https://[your-project-ref].supabase.co/functions/v1/docusign-webhook
```

**Example:**
```
https://pzptocwdaqpczexlbajr.supabase.co/functions/v1/docusign-webhook
```

**Save this URL** - you'll need it for DocuSign configuration.

---

### Step 3: Configure DocuSign Webhook

#### Step 3.1: Get Webhook Secret
1. Generate a secure random string (32+ characters)
2. Save it securely
3. Add to Supabase environment variables: `DOCUSIGN_WEBHOOK_SECRET`

**Generate Secret:**
```bash
# Option 1: Online generator
# Visit: https://www.random.org/strings/
# Generate: 32 character random string

# Option 2: Command line
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Step 3.2: Configure in DocuSign Dashboard

1. **Log in to DocuSign**
   - Go to [DocuSign Admin](https://admin.docusign.com)
   - Select your account

2. **Navigate to Connect**
   - Go to **Connect** → **Event Notifications**
   - Or: **Settings** → **Integrations** → **Connect**

3. **Create New Event Notification**
   - Click **"Add Configuration"** or **"New"**
   - Name: `STUCOMMS Booking Portal Webhook`
   - URL: `https://[your-project-ref].supabase.co/functions/v1/docusign-webhook`
   - Logging: Enable (recommended)

4. **Select Events to Receive**
   - ✅ **Envelope Completed** (required)
   - ✅ **Envelope Sent** (optional, but recommended)
   - ✅ **Envelope Declined** (optional)
   - ✅ **Envelope Voided** (optional)

5. **Configure Authentication**
   - Authentication: **HMAC Signature**
   - Secret: Your `DOCUSIGN_WEBHOOK_SECRET` value
   - Save configuration

6. **Test Connection**
   - DocuSign will send a test webhook
   - Check Supabase Edge Function logs
   - Should see test webhook received

---

### Step 4: Add Environment Variable

#### In Supabase Dashboard:
1. Go to **Project Settings** → **Edge Functions** → **Secrets**
2. Add new secret:
   - **Name:** `DOCUSIGN_WEBHOOK_SECRET`
   - **Value:** Your generated secret (same as DocuSign)
3. Save

#### Or via Supabase CLI:
```bash
supabase secrets set DOCUSIGN_WEBHOOK_SECRET=your-secret-here
```

**Important:** Use the **same secret** in both:
- DocuSign webhook configuration
- Supabase environment variable

---

### Step 5: Deploy Frontend Changes

The frontend polling has been updated to:
- Poll every 5 minutes (instead of 30 seconds)
- Acts as backup if webhooks fail

**No deployment needed** - changes are in code, will be deployed with next frontend deployment.

---

### Step 6: Test Webhook

#### Test 1: Manual Test
1. Create a test application
2. Send DocuSign envelope
3. Sign the document
4. Check Supabase Edge Function logs for webhook
5. Verify status updated in database

#### Test 2: DocuSign Test Webhook
1. In DocuSign dashboard, find your webhook configuration
2. Click **"Test"** or **"Send Test Event"**
3. Check Supabase logs
4. Should see test webhook received

#### Test 3: Verify Status Updates
1. Sign a document
2. Check application status updates within 1-5 seconds
3. Verify in database: `docusign_envelopes` table
4. Verify application status updated if all envelopes completed

---

## 🔍 Verification Checklist

After implementation, verify:

- [ ] Webhook function deployed successfully
- [ ] Webhook URL accessible (test with curl or Postman)
- [ ] DocuSign webhook configured
- [ ] `DOCUSIGN_WEBHOOK_SECRET` environment variable set
- [ ] Test webhook received successfully
- [ ] Status updates working via webhooks
- [ ] Polling still works as backup (every 5 minutes)
- [ ] No errors in logs

---

## 📊 Monitoring

### What to Monitor:

1. **Webhook Success Rate**
   - Check Edge Function logs
   - Look for webhook requests
   - Monitor for errors

2. **Status Update Accuracy**
   - Verify all status changes captured
   - Check for any missed updates
   - Compare webhook vs polling updates

3. **Performance**
   - API call reduction (should see ~95% reduction)
   - Response times
   - Database load

### Logs to Check:

**Supabase Edge Function Logs:**
```
📨 DocuSign webhook received: { event: "envelope-completed", ... }
✅ Envelope abc-123 status updated: sent → completed
✅ Application xyz-789 status updated to awaiting_verification
```

**DocuSign Webhook Logs:**
- Check DocuSign dashboard for webhook delivery status
- Look for failed deliveries
- Check retry attempts

---

## 🛠️ Troubleshooting

### Issue 1: Webhooks Not Received

**Symptoms:**
- No webhook logs in Supabase
- Status not updating via webhooks

**Solutions:**
1. **Check Webhook URL**
   - Verify URL is correct in DocuSign
   - Test URL accessibility
   - Check CORS headers

2. **Check Environment Variable**
   - Verify `DOCUSIGN_WEBHOOK_SECRET` is set
   - Check secret matches DocuSign configuration

3. **Check DocuSign Configuration**
   - Verify webhook is enabled
   - Check events are selected
   - Verify authentication settings

4. **Check Function Deployment**
   - Verify function is deployed
   - Check function logs for errors
   - Test function manually

---

### Issue 2: Signature Verification Fails

**Symptoms:**
- Webhooks received but rejected
- "Invalid signature" errors

**Solutions:**
1. **Verify Secret Matches**
   - Secret in DocuSign must match Supabase
   - Check for typos or extra spaces
   - Regenerate if needed

2. **Check Signature Headers**
   - DocuSign sends `x-docusign-signature-1` and `x-docusign-signature-2`
   - Verify headers are being received

3. **Temporary Disable Verification** (Development Only)
   - Remove signature check temporarily
   - Test webhook processing
   - Re-enable after testing

---

### Issue 3: Status Not Updating

**Symptoms:**
- Webhooks received
- But status not updating in database

**Solutions:**
1. **Check Envelope ID**
   - Verify envelope exists in database
   - Check `envelope_id` matches

2. **Check Application ID**
   - Verify application linked to envelope
   - Check `application_id` in `docusign_envelopes` table

3. **Check Logs**
   - Look for update errors
   - Check database connection
   - Verify permissions

---

## 🔄 Rollback Procedure

If you need to rollback:

### Quick Rollback (5 minutes):
1. **Disable Webhook in DocuSign**
   - Go to DocuSign dashboard
   - Disable or delete webhook configuration

2. **Restore Polling Frequency**
   - Change `300000` back to `30000` in ApplicationWizard.tsx
   - Or restore from backup file

3. **Redeploy**
   - Deploy frontend changes
   - System returns to original behavior

### Full Rollback (10 minutes):
1. Follow steps above
2. Restore original files from backups
3. Redeploy everything
4. System works exactly as before

**See:** `docs/DOCUSIGN_WEBHOOKS_ROLLBACK_PLAN.md` for detailed steps

---

## 📈 Expected Results

### Before (Polling):
- Status updates: 0-30 second delay
- API calls: 1,200/minute (with 600 users)
- Efficiency: Low

### After (Webhooks):
- Status updates: 1-5 second delay
- API calls: ~60/minute (only when status changes)
- Efficiency: High (95% reduction)

---

## 🎯 Next Steps

1. **Deploy webhook function** (Step 1)
2. **Configure DocuSign** (Step 3)
3. **Set environment variable** (Step 4)
4. **Test webhook** (Step 6)
5. **Monitor for 1-2 weeks**
6. **Remove polling** (after webhooks proven stable)

---

## 📚 Documentation

- **Rollback Plan:** `docs/DOCUSIGN_WEBHOOKS_ROLLBACK_PLAN.md`
- **Webhooks Explained:** `docs/DOCUSIGN_WEBHOOKS_EXPLAINED.md`
- **Backup Files:** `backups/docusign-webhooks-2025-01-28/`

---

**Last Updated:** 2025-01-28  
**Status:** Ready for Deployment

