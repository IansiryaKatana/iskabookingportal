# DocuSign Webhooks - Final Checklist & Testing
## Verify Everything is Working

**Date:** 2025-01-28  
**Status:** Configuration Complete - Ready for Testing

---

## ✅ Configuration Complete Checklist

### Step 1: Webhook Function Deployed ✅
- [x] `docusign-webhook` function deployed to Supabase
- [x] Function accessible at: `https://[your-project-ref].supabase.co/functions/v1/docusign-webhook`

### Step 2: Environment Variable Set ✅
- [x] `DOCUSIGN_WEBHOOK_SECRET` added to Supabase Edge Functions secrets
- [x] Secret matches DocuSign HMAC key

### Step 3: DocuSign Webhook Configured ✅
- [x] Webhook created in DocuSign dashboard
- [x] URL configured: `https://[your-project-ref].supabase.co/functions/v1/docusign-webhook`
- [x] HMAC Signature enabled
- [x] HMAC secret matches Supabase secret
- [x] Essential events selected:
  - [x] Envelope Sent
  - [x] Envelope Signed/Completed
  - [x] Envelope Declined
  - [x] Envelope Voided
  - [x] Recipient Signed/Completed (optional)
  - [x] Recipient Declined (optional)

### Step 4: Frontend Updated ✅
- [x] Polling reduced to 5 minutes (backup mode)
- [x] Webhooks handle real-time updates

---

## 🧪 Testing Your Webhook

### Test 1: Check Webhook URL Accessibility

**Option A: Browser**
1. Open: `https://[your-project-ref].supabase.co/functions/v1/docusign-webhook`
2. Should see: Error (expected - webhook needs POST request)
3. This confirms URL is accessible

**Option B: DocuSign Test**
1. In DocuSign webhook configuration
2. Look for "Test" or "Send Test Event" button
3. Click it
4. Check Supabase logs for webhook received

---

### Test 2: Real Document Test

1. **Create Test Application**
   - Go to your booking portal
   - Create a test application
   - Complete through Step 5 (payment)

2. **Send DocuSign Envelope**
   - System should send tenancy agreement
   - Check DocuSign dashboard for envelope

3. **Sign Document**
   - Sign the document in DocuSign
   - Wait 1-5 seconds

4. **Verify Status Update**
   - Check application status in your portal
   - Should update to "awaiting_verification" automatically
   - No need to wait for polling!

---

### Test 3: Check Logs

**Supabase Edge Function Logs:**
1. Go to Supabase Dashboard
2. Edge Functions → `docusign-webhook` → Logs
3. Look for:
   ```
   📨 DocuSign webhook received: { event: "envelope-completed", ... }
   ✅ Envelope abc-123 status updated: sent → completed
   ✅ Application xyz-789 status updated to awaiting_verification
   ```

**DocuSign Webhook Logs:**
1. Go to DocuSign dashboard
2. Connect → Event Notifications
3. Click on your webhook configuration
4. Check delivery status
5. Should show successful deliveries

---

## 🔍 What to Look For

### ✅ Success Indicators:

1. **Webhook Received:**
   - Logs show "DocuSign webhook received"
   - No "Invalid signature" errors

2. **Status Updated:**
   - Envelope status updates in database
   - Application status updates automatically
   - Updates happen within 1-5 seconds

3. **No Errors:**
   - No signature verification failures
   - No database update errors
   - No connection errors

---

### ❌ Troubleshooting:

**If webhooks not received:**
1. Check webhook URL is correct
2. Verify `DOCUSIGN_WEBHOOK_SECRET` matches
3. Check DocuSign webhook is active
4. Verify events are selected

**If "Invalid signature" errors:**
1. Verify secrets match in both places
2. Check for extra spaces or characters
3. Regenerate key if needed

**If status not updating:**
1. Check webhook is being received (logs)
2. Verify envelope exists in database
3. Check application ID is linked
4. Review Edge Function logs for errors

---

## 📊 Monitoring

### What to Monitor (First Week):

1. **Webhook Success Rate**
   - Check Supabase logs daily
   - Look for failed webhooks
   - Verify all status changes captured

2. **Status Update Accuracy**
   - Compare webhook updates vs polling
   - Ensure no missed updates
   - Verify timing (should be 1-5 seconds)

3. **Performance**
   - API call reduction (should see ~95% reduction)
   - Response times
   - Database load

---

## 🎯 Expected Behavior

### Before (Polling):
- Status updates: 0-30 second delay
- API calls: 1,200/minute (with 600 users)
- User sees: "Checking status..." every 30 seconds

### After (Webhooks):
- Status updates: 1-5 second delay ⚡
- API calls: ~60/minute (only when status changes)
- User sees: Status updates instantly

---

## 🎉 Success Criteria

Your webhook is working correctly if:

- ✅ Webhooks received in Supabase logs
- ✅ No signature verification errors
- ✅ Status updates within 1-5 seconds
- ✅ Application status updates automatically
- ✅ Polling still works as backup (every 5 minutes)
- ✅ No data loss or missed updates

---

## 📋 Next Steps

### Immediate (Today):
1. ✅ Test with a real document
2. ✅ Verify status updates work
3. ✅ Check logs for any errors

### This Week:
1. Monitor webhook delivery
2. Verify all status changes captured
3. Check for any missed updates
4. Compare webhook vs polling updates

### After 1-2 Weeks (If Stable):
1. Consider removing polling entirely
2. Use webhooks only
3. Even more efficient

---

## 🔄 Rollback (If Needed)

If you encounter issues:

**Quick Disable:**
1. Go to DocuSign dashboard
2. Disable or delete webhook
3. System falls back to polling (every 5 minutes)

**Full Rollback:**
1. See: `docs/DOCUSIGN_WEBHOOKS_ROLLBACK_PLAN.md`
2. Restore files from backups
3. System works exactly as before

---

## 📚 Documentation Reference

- **Setup Guide:** `docs/DOCUSIGN_WEBHOOKS_IMPLEMENTATION_GUIDE.md`
- **Rollback Plan:** `docs/DOCUSIGN_WEBHOOKS_ROLLBACK_PLAN.md`
- **Settings Guide:** `docs/DOCUSIGN_WEBHOOK_RECOMMENDED_SETTINGS.md`
- **Explained:** `docs/DOCUSIGN_WEBHOOKS_EXPLAINED.md`

---

## ✅ Final Checklist

Before considering complete:

- [ ] Webhook function deployed
- [ ] Environment variable set
- [ ] DocuSign webhook configured
- [ ] HMAC secrets match
- [ ] Events selected
- [ ] Test webhook sent/received
- [ ] Real document test successful
- [ ] Status updates working
- [ ] Logs show successful webhooks
- [ ] No errors in logs

---

**Congratulations! 🎉**

Your DocuSign webhooks are now configured. You should see:
- ⚡ Instant status updates (1-5 seconds)
- 📉 95% reduction in API calls
- ✅ Better user experience
- 🛡️ Polling as backup (every 5 minutes)

**Last Updated:** 2025-01-28  
**Status:** Ready for Testing

