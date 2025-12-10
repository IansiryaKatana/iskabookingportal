# DocuSign Webhook Configuration - Step by Step
## Complete Guide for "Add Custom Configuration" Page

**Date:** 2025-01-28  
**Purpose:** Fill out DocuSign webhook configuration form correctly

---

## 📋 Form Fields to Fill

### **Listener Settings Section:**

#### 1. **Status** (Dropdown)
- **Value:** Keep as "Active Connection" ✅
- This enables the webhook

#### 2. **Name** (Text Field) ⭐ Required
- **Value:** `STUCOMMS Booking Portal Webhook`
- Or any descriptive name you prefer
- Example: `Booking Portal - Production Webhook`

#### 3. **URL to Publish** (Text Field) ⭐ Required
- **Value:** `https://[your-project-ref].supabase.co/functions/v1/docusign-webhook`
- **Replace `[your-project-ref]` with your actual Supabase project reference**
- **Example:** `https://pzptocwdaqpczexlbajr.supabase.co/functions/v1/docusign-webhook`
- **Important:** Must be HTTPS (as noted on the form)

**How to find your Supabase project ref:**
1. Go to Supabase Dashboard
2. Look at your project URL
3. The project ref is the part before `.supabase.co`
4. Example: `https://pzptocwdaqpczexlbajr.supabase.co` → project ref is `pzptocwdaqpczexlbajr`

#### 4. **Enable Log (maximum 100)** (Checkbox)
- **Value:** ✅ **Checked** (Recommended)
- This helps with debugging
- Logs last 100 webhook events

#### 5. **Require Acknowledgement** (Checkbox)
- **Value:** ✅ **Checked** (Recommended)
- DocuSign waits for your system to acknowledge receipt
- Ensures reliable delivery

#### 6. **Pause Configuration** (Checkbox)
- **Value:** ❌ **Unchecked**
- Leave unchecked to keep webhook active

---

### **Event Settings Section:**

#### 1. **Data Format** (Dropdown)
- **Value:** Keep as "REST v2.1" ✅
- This is the correct format
- **Note:** Cannot be changed after saving

#### 2. **Event Message Delivery Mode**
- This will show options after you select events
- Usually "Synchronous" or "Asynchronous"
- **Default is fine** (usually Synchronous)

---

## 🎯 Next Steps After Filling Form

### Step 1: Fill the Form
- Name: `STUCOMMS Booking Portal Webhook`
- URL: Your Supabase webhook URL
- Checkboxes: Enable Log ✅, Require Acknowledgement ✅
- Click **"Add Configuration"** or **"Save"**

### Step 2: Select Events
After saving, you'll need to select which events to receive:

**Required Events:**
- ✅ **Envelope Completed** (MUST HAVE)
- ✅ **Envelope Sent** (Recommended)
- ✅ **Envelope Declined** (Optional but useful)
- ✅ **Envelope Voided** (Optional but useful)

**How to select:**
1. After saving, you'll see an "Events" or "Event Settings" section
2. Check the boxes for events you want
3. Save again

### Step 3: Configure Authentication
After saving, look for:
- **"Authentication"** section or tab
- **"Security"** settings
- **"HMAC Signature"** option

**What to set:**
1. **Authentication Type:** HMAC Signature
2. **Secret:** Your `DOCUSIGN_WEBHOOK_SECRET` value
   - Same secret you added to Supabase
   - Example: `e09089225686e4a82434017b1c91be3fc15de4f8bea41c14c24f46105394596d`

**Where to find this:**
- May be on the same page (scroll down)
- Or in a separate "Security" or "Authentication" tab
- Or click "Edit" on your saved configuration

---

## 📝 Quick Checklist

Before clicking "Add Configuration":

- [ ] **Name** filled in
- [ ] **URL to Publish** filled in (with your Supabase URL)
- [ ] **Enable Log** checked ✅
- [ ] **Require Acknowledgement** checked ✅
- [ ] **Pause Configuration** unchecked ❌
- [ ] **Data Format** is "REST v2.1" ✅

After saving:

- [ ] **Events selected** (at least "Envelope Completed")
- [ ] **Authentication configured** (HMAC Signature + Secret)
- [ ] **Test webhook sent** (if available)

---

## 🔍 Finding Your Supabase Webhook URL

If you need to find your exact webhook URL:

1. **Go to Supabase Dashboard**
2. **Edge Functions** → **docusign-webhook**
3. **Copy the function URL**
4. **Format:** `https://[project-ref].supabase.co/functions/v1/docusign-webhook`

**Or construct it:**
- Your Supabase project URL: `https://pzptocwdaqpczexlbajr.supabase.co`
- Add: `/functions/v1/docusign-webhook`
- Full URL: `https://pzptocwdaqpczexlbajr.supabase.co/functions/v1/docusign-webhook`

---

## ⚠️ Important Notes

1. **HTTPS Required**
   - DocuSign only accepts HTTPS URLs
   - Your Supabase function URL is already HTTPS ✅

2. **Secret Must Match**
   - Use the **same secret** in:
     - Supabase environment variable
     - DocuSign authentication settings
   - If they don't match, webhooks will be rejected

3. **Cannot Change After Save**
   - Data Format cannot be changed
   - Event Message Delivery Mode cannot be changed
   - URL can be changed (but requires re-verification)

4. **Test After Configuration**
   - DocuSign may offer a "Test" button
   - Or send a test document and sign it
   - Check Supabase logs to verify webhook received

---

## 🎯 What to Fill Right Now

**On the current page:**

1. **Name:** `STUCOMMS Booking Portal Webhook`
2. **URL to Publish:** `https://[your-project-ref].supabase.co/functions/v1/docusign-webhook`
   - Replace `[your-project-ref]` with your actual project reference
3. **Enable Log:** ✅ Checked
4. **Require Acknowledgement:** ✅ Checked
5. **Pause Configuration:** ❌ Unchecked

**Then click "Add Configuration" or "Save"**

**After saving, you'll configure:**
- Events to receive
- Authentication (HMAC Signature + Secret)

---

**Last Updated:** 2025-01-28

