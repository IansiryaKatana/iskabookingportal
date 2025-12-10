# How to Check DocuSign Webhook Logs
## Step-by-Step Guide

**Date:** 2025-01-28  
**Purpose:** Find and monitor webhook logs in Supabase

---

## 📍 Which Function to Check

**Function Name:** `docusign-webhook`

This is the Edge Function that receives webhooks from DocuSign.

---

## 🔍 How to Check Logs

### Method 1: Supabase Dashboard (Easiest)

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Navigate to Edge Functions**
   - Click **"Edge Functions"** in the left sidebar
   - Or go to: **Project Settings** → **Edge Functions**

3. **Find Your Function**
   - Look for: **`docusign-webhook`**
   - Click on it

4. **View Logs**
   - Click **"Logs"** tab
   - Or look for **"View Logs"** button
   - You'll see real-time logs from the function

---

### Method 2: Supabase CLI

```bash
# View logs for docusign-webhook function
supabase functions logs docusign-webhook

# Follow logs in real-time
supabase functions logs docusign-webhook --follow

# Filter for specific time
supabase functions logs docusign-webhook --since 1h
```

---

## 📊 What to Look For

### ✅ Success Indicators:

```
📨 DocuSign webhook received: { event: "envelope-completed", envelopeId: "abc-123", ... }
✅ Envelope abc-123 status updated: sent → completed
✅ Application xyz-789 status updated to awaiting_verification
```

### ❌ Error Indicators:

```
Error processing DocuSign webhook: ...
Invalid webhook signature - rejecting request
Error updating envelope abc-123: ...
```

---

## 🔍 Log Details

### When Webhook is Received:
- **Event type:** `envelope-completed`, `envelope-sent`, etc.
- **Envelope ID:** The DocuSign envelope ID
- **Status:** Current status
- **Timestamp:** When webhook was received

### When Status is Updated:
- **Envelope ID:** Which envelope was updated
- **Old Status:** Previous status
- **New Status:** Updated status
- **Application ID:** Which application was affected

### When Application Status Changes:
- **Application ID:** Which application
- **New Status:** Updated application status
- **Reason:** Why status changed (all envelopes completed)

---

## 🧪 Testing Logs

### Test 1: Send Test Webhook
1. In DocuSign dashboard, find your webhook
2. Click **"Test"** or **"Send Test Event"**
3. Check Supabase logs immediately
4. Should see webhook received

### Test 2: Sign Real Document
1. Create test application
2. Send DocuSign envelope
3. Sign the document
4. Check logs within 1-5 seconds
5. Should see:
   - Webhook received
   - Envelope status updated
   - Application status updated

---

## 📋 Log Checklist

When checking logs, verify:

- [ ] Webhooks are being received
- [ ] No "Invalid signature" errors
- [ ] Envelope status updates successfully
- [ ] Application status updates when all envelopes completed
- [ ] No database errors
- [ ] No connection errors

---

## 🔍 Where to Find Logs

**Supabase Dashboard Path:**
```
Dashboard → Edge Functions → docusign-webhook → Logs
```

**Or:**
```
Project Settings → Edge Functions → docusign-webhook → View Logs
```

---

## ⚠️ Common Issues

### No Logs Showing:
- **Check:** Function is deployed
- **Check:** Webhook is actually being sent from DocuSign
- **Check:** Webhook URL is correct

### "Invalid signature" Errors:
- **Check:** `DOCUSIGN_WEBHOOK_SECRET` matches DocuSign key
- **Check:** No extra spaces in secret
- **Check:** Secret is set correctly

### No Status Updates:
- **Check:** Webhook is received (logs show it)
- **Check:** Envelope exists in database
- **Check:** Application ID is linked
- **Check:** No database update errors

---

## 📊 Log Examples

### Successful Webhook:
```
📨 DocuSign webhook received: {
  event: "envelope-completed",
  envelopeId: "abc-123-def-456",
  status: "completed",
  timestamp: "2025-01-28T10:30:00Z"
}
✅ Envelope abc-123-def-456 (tenancy_agreement) status updated: sent → completed
✅ Application xyz-789-abc-123 status updated to awaiting_verification
```

### Error Example:
```
❌ Error processing DocuSign webhook: Invalid signature
Error: Invalid webhook signature - rejecting request
```

---

## 🎯 Quick Reference

**Function to Check:** `docusign-webhook`  
**Location:** Supabase Dashboard → Edge Functions → `docusign-webhook` → Logs  
**What to See:** Webhook received messages, status updates, errors

---

**Last Updated:** 2025-01-28

