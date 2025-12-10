# DocuSign Webhooks - Rollback Plan
## Complete Backup & Reversion Guide

**Date:** 2025-01-28  
**Purpose:** Safe implementation with easy rollback

---

## 📦 Backup Files Created

All original files have been backed up to:
**`backups/docusign-webhooks-2025-01-28/`**

### Files Backed Up:
1. ✅ `docusign-check-status-index.ts.backup` - Original polling function
2. ✅ `ApplicationWizard-polling-section.backup` - Original polling code from frontend

---

## 🔄 Files That Will Be Modified

### 1. **New File (No Backup Needed)**
- `supabase/functions/docusign-webhook/index.ts` - New webhook handler

### 2. **Modified Files (Backups Created)**
- `supabase/functions/docusign-check-status/index.ts` - Reduce polling frequency
- `src/pages/portal/ApplicationWizard.tsx` - Reduce polling interval

---

## 🔙 Rollback Procedures

### Option 1: Quick Rollback (Restore from Backup)

#### Step 1: Restore Edge Function
```bash
# Copy backup back to original location
cp backups/docusign-webhooks-2025-01-28/docusign-check-status-index.ts.backup \
   supabase/functions/docusign-check-status/index.ts
```

#### Step 2: Restore Frontend Code
1. Open `src/pages/portal/ApplicationWizard.tsx`
2. Find the polling section (around line 2329)
3. Replace with content from `backups/docusign-webhooks-2025-01-28/ApplicationWizard-polling-section.backup`

#### Step 3: Remove Webhook Function (Optional)
```bash
# Delete webhook handler if you want to remove it completely
rm -rf supabase/functions/docusign-webhook
```

#### Step 4: Redeploy
- Redeploy Edge Functions
- Redeploy frontend
- System returns to original polling behavior

---

### Option 2: Disable Webhooks (Keep Code, Just Disable)

#### Step 1: Disable Webhook in DocuSign Dashboard
1. Go to DocuSign Dashboard
2. Navigate to **Connect** → **Event Notifications**
3. Find your webhook configuration
4. **Disable** or **Delete** the webhook

#### Step 2: Increase Polling Frequency
- Change polling interval back to 30 seconds
- System uses polling only (webhooks disabled)

**Result:** Webhook code remains but doesn't run. Easy to re-enable later.

---

## 📋 Rollback Checklist

If you need to rollback:

- [ ] **Stop Webhook Processing**
  - [ ] Disable webhook in DocuSign dashboard
  - [ ] Or delete webhook function

- [ ] **Restore Original Files**
  - [ ] Restore `docusign-check-status/index.ts` from backup
  - [ ] Restore `ApplicationWizard.tsx` polling section from backup

- [ ] **Redeploy**
  - [ ] Deploy Edge Functions
  - [ ] Deploy Frontend

- [ ] **Verify**
  - [ ] Test status checking works
  - [ ] Verify polling is active
  - [ ] Check logs for errors

---

## 🛡️ Safety Features Built In

### 1. **Polling as Backup**
- Polling still runs (just less frequently)
- If webhooks fail, polling catches it
- No data loss possible

### 2. **Idempotent Updates**
- Webhook handler checks if status already updated
- Prevents duplicate updates
- Safe to receive same webhook twice

### 3. **Error Handling**
- Webhook errors don't break system
- Logs all errors for debugging
- Falls back to polling if webhook fails

### 4. **Gradual Migration**
- Webhooks active immediately
- Polling reduced but still active
- Can disable webhooks anytime

---

## 📊 What Changes (Summary)

### Before (Current):
- Polling every 30 seconds
- 1,200 API calls/minute (with 600 users)
- Up to 30 second delay

### After (With Webhooks):
- Webhooks: Instant updates (1-5 seconds)
- Polling: Backup every 5 minutes
- ~95% fewer API calls
- Much more efficient

### If You Rollback:
- Back to polling every 30 seconds
- Original behavior restored
- No data loss
- System works exactly as before

---

## 🔍 Testing Before Rollback

If you're experiencing issues, check:

1. **Are webhooks being received?**
   - Check Edge Function logs
   - Look for webhook requests

2. **Are status updates working?**
   - Test with a real document
   - Check if status updates

3. **Is polling still working?**
   - Check if backup polling runs
   - Verify status updates via polling

4. **Any errors in logs?**
   - Check Supabase Edge Function logs
   - Check browser console
   - Check DocuSign webhook logs

---

## 📞 Support

If you need to rollback:
1. Follow the rollback procedures above
2. All original code is in backups folder
3. System will work exactly as before
4. No data will be lost

---

**Last Updated:** 2025-01-28  
**Status:** Ready for Implementation with Safe Rollback

