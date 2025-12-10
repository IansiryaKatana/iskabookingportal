# DocuSign Webhook - Recommended Settings for Booking Portal
## Optimal Configuration for Your Use Case

**Date:** 2025-01-28  
**Purpose:** Specific recommendations for STUCOMMS Booking Portal webhook configuration

---

## 🔒 Integration and Security Settings

### ✅ **Include HMAC Signature (Recommended)** - **REQUIRED**
- **Status:** ✅ **CHECK THIS**
- **Why:** Your webhook handler verifies HMAC signatures for security
- **Action:** 
  1. Check the box
  2. Click "Manage Keys"
  3. Copy the secret key
  4. Use this same secret in Supabase `DOCUSIGN_WEBHOOK_SECRET`

**This is the ONLY authentication method you need!**

---

### ❌ **Include Account Level OAuth (Recommended)** - **NOT NEEDED**
- **Status:** ❌ **LEAVE UNCHECKED**
- **Why:** You're using HMAC Signature, not OAuth
- **Action:** Leave unchecked

---

### ❌ **Include Configuration Level OAuth (Recommended)** - **NOT NEEDED**
- **Status:** ❌ **LEAVE UNCHECKED**
- **Why:** You're using HMAC Signature, not OAuth
- **Action:** Leave unchecked

---

### ❌ **Include Basic Authentication Header** - **NOT NEEDED**
- **Status:** ❌ **LEAVE UNCHECKED**
- **Why:** HMAC Signature is more secure and sufficient
- **Action:** Leave unchecked

---

### ❌ **Enable Mutual TLS** - **NOT NEEDED**
- **Status:** ❌ **LEAVE UNCHECKED**
- **Why:** Not necessary for your use case
- **Action:** Leave unchecked

---

## 📨 Event Selection - What You Actually Need

### ✅ **Essential Events (MUST HAVE):**

#### **Envelope Events:**
- ✅ **Envelope Sent** - Know when document is sent
- ✅ **Envelope Signed/Completed** - **MOST IMPORTANT** - Know when fully signed
- ✅ **Envelope Declined** - Know if student declines
- ✅ **Envelope Voided** - Know if document is cancelled

#### **Recipient Events (Optional but Useful):**
- ✅ **Recipient Signed/Completed** - Know when individual signs
- ✅ **Recipient Declined** - Know if individual declines

---

### ❌ **Events You DON'T Need:**

#### **Envelope Events (Can Uncheck):**
- ❌ Envelope Delivered (not critical)
- ❌ Envelope Resent (not critical)
- ❌ Envelope Corrected (not critical)
- ❌ Envelope Purge (not critical)
- ❌ Envelope Deleted (not critical)
- ❌ Envelope Discard (not critical)
- ❌ Envelope Created (not critical)
- ❌ Envelope Removed (not critical)
- ❌ Envelope Reminder Sent (not critical)

#### **Recipient Events (Can Uncheck):**
- ❌ Recipient Sent (not critical)
- ❌ Recipient Auto Responded (not critical)
- ❌ Recipient Delivered (not critical)
- ❌ Recipient Authentication Failure (not critical)
- ❌ Recipient Resent (not critical)
- ❌ Recipient Delegate (not critical)
- ❌ Recipient Reassign (not critical)
- ❌ Recipient Finish Later (not critical)

#### **Other Categories (Can Uncheck All):**
- ❌ Identity Verification (not needed)
- ❌ Extension Apps (not needed)
- ❌ Notary (not needed)
- ❌ Navigator (not needed)
- ❌ Template events (not needed)
- ❌ DocuSign Click (not needed)
- ❌ SMS Delivery (not needed)
- ❌ Maestro (not needed)

---

## 🎯 Recommended Configuration Summary

### **Security Settings:**
```
✅ Include HMAC Signature (CHECKED)
   → Click "Manage Keys" → Copy secret → Use in Supabase
❌ Include Account Level OAuth (UNCHECKED)
❌ Include Configuration Level OAuth (UNCHECKED)
❌ Include Basic Authentication Header (UNCHECKED)
❌ Enable Mutual TLS (UNCHECKED)
```

### **Events to Select:**
```
ENVELOPE EVENTS:
✅ Envelope Sent
✅ Envelope Signed/Completed (MOST IMPORTANT)
✅ Envelope Declined
✅ Envelope Voided

RECIPIENT EVENTS (Optional):
✅ Recipient Signed/Completed
✅ Recipient Declined

ALL OTHER EVENTS:
❌ Uncheck everything else
```

---

## 📋 Step-by-Step Configuration

### Step 1: Security Settings
1. ✅ Check "Include HMAC Signature"
2. Click "Manage Keys"
3. Copy the secret key shown
4. Save this secret (you'll add it to Supabase)
5. ❌ Leave all other security options unchecked

### Step 2: Select Events
1. Scroll to event selection
2. **Envelope Events:**
   - ✅ Check: Envelope Sent
   - ✅ Check: Envelope Signed/Completed
   - ✅ Check: Envelope Declined
   - ✅ Check: Envelope Voided
   - ❌ Uncheck all other envelope events

3. **Recipient Events:**
   - ✅ Check: Recipient Signed/Completed
   - ✅ Check: Recipient Declined
   - ❌ Uncheck all other recipient events

4. **Other Categories:**
   - ❌ Uncheck everything in all other categories
   - (Identity Verification, Extension Apps, Notary, Navigator, Template, etc.)

### Step 3: Save Configuration
1. Click "Add Configuration"
2. Verify it's saved successfully

---

## 🔑 Getting Your HMAC Secret

After checking "Include HMAC Signature" and clicking "Manage Keys":

1. **DocuSign will show you a secret key**
2. **Copy this secret**
3. **Add to Supabase:**
   - Go to Supabase Dashboard
   - Edge Functions → Secrets
   - Add: `DOCUSIGN_WEBHOOK_SECRET` = (paste the secret)
4. **Important:** Use the SAME secret in both places!

---

## 💡 Why These Settings?

### **HMAC Signature Only:**
- ✅ Secure (cryptographically verified)
- ✅ Simple (no OAuth complexity)
- ✅ Sufficient for your needs
- ✅ What your webhook handler expects

### **Minimal Events:**
- ✅ Reduces webhook volume
- ✅ Only get notifications you actually need
- ✅ Faster processing
- ✅ Easier debugging

### **Essential Events:**
- **Envelope Signed/Completed:** Updates application status to "awaiting_verification"
- **Envelope Declined:** Know if student declines
- **Envelope Voided:** Know if document cancelled
- **Envelope Sent:** Track when sent (optional but useful)

---

## ⚠️ Important Notes

1. **HMAC Secret Must Match:**
   - Same secret in DocuSign AND Supabase
   - If they don't match, webhooks will be rejected

2. **You Can Change Later:**
   - Can add/remove events later
   - Can't change authentication method easily (but HMAC is correct)

3. **Start Minimal:**
   - Only select essential events
   - Can add more later if needed
   - Easier to debug with fewer events

---

## ✅ Final Checklist

Before clicking "Add Configuration":

- [ ] ✅ HMAC Signature checked
- [ ] ✅ HMAC secret copied
- [ ] ❌ All OAuth options unchecked
- [ ] ❌ Basic Auth unchecked
- [ ] ❌ Mutual TLS unchecked
- [ ] ✅ Essential envelope events checked (4 events)
- [ ] ✅ Essential recipient events checked (2 events)
- [ ] ❌ All other events unchecked

After saving:

- [ ] Add HMAC secret to Supabase `DOCUSIGN_WEBHOOK_SECRET`
- [ ] Test webhook delivery
- [ ] Verify status updates work

---

**Last Updated:** 2025-01-28

