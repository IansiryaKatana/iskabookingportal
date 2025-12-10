# Update DOCUSIGN_WEBHOOK_SECRET with DocuSign Key
## Use DocuSign-Generated HMAC Secret

**Date:** 2025-01-28  
**Purpose:** Update Supabase secret to match DocuSign-generated key

---

## ✅ Yes - Use DocuSign's Key

**DocuSign has generated a key for you. Use that key in both places:**

1. ✅ **DocuSign** - Already set (when you clicked "Manage Keys")
2. ✅ **Supabase** - Update `DOCUSIGN_WEBHOOK_SECRET` to match

---

## 🔄 Steps to Update Supabase

### Step 1: Copy DocuSign Key
1. In DocuSign "Manage Keys" dialog
2. Copy the secret key shown
3. **Save it securely** (you'll need it)

### Step 2: Update Supabase Secret

#### Option A: Supabase Dashboard (Easiest)
1. Go to **Supabase Dashboard**
2. **Project Settings** → **Edge Functions** → **Secrets**
3. Find `DOCUSIGN_WEBHOOK_SECRET`
4. Click **Edit** or **Update**
5. **Replace** the value with DocuSign's key
6. Click **Save**

#### Option B: Supabase CLI
```bash
supabase secrets set DOCUSIGN_WEBHOOK_SECRET="paste-docusign-key-here"
```

---

## ⚠️ Important

**The secret must match in BOTH places:**
- ✅ DocuSign webhook configuration (already set)
- ✅ Supabase `DOCUSIGN_WEBHOOK_SECRET` (needs update)

**If they don't match:**
- ❌ Webhooks will be rejected
- ❌ Status updates won't work
- ❌ You'll see "Invalid signature" errors

---

## ✅ Verification

After updating:

1. **Check Supabase secret:**
   - Go to Edge Functions → Secrets
   - Verify `DOCUSIGN_WEBHOOK_SECRET` matches DocuSign key

2. **Test webhook:**
   - Send a test document in DocuSign
   - Sign it
   - Check Supabase Edge Function logs
   - Should see webhook received successfully

---

## 🔑 Key Management

**Best Practice:**
- Use DocuSign-generated key (what you're doing) ✅
- Easier to manage
- DocuSign handles key rotation if needed

**Alternative (Not Recommended):**
- Generate your own key
- Set it in both DocuSign and Supabase
- More complex, not necessary

---

## 📋 Quick Checklist

- [ ] Copied DocuSign HMAC secret key
- [ ] Updated Supabase `DOCUSIGN_WEBHOOK_SECRET` with DocuSign key
- [ ] Verified secret matches in both places
- [ ] Ready to test webhook

---

**Last Updated:** 2025-01-28

