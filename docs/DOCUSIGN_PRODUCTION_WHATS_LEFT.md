# DocuSign Production – What’s Left to Do

You implemented everything below for the **developer account**. Replicate the same in **production** and ensure Supabase points to production. Use this as a **checklist** — tick each item as you complete it.

---

## 1. Apps and Keys (Production)

**Location:** Production DocuSign → **Admin** → **Apps AND KEYS** → **Urbanhub portal** (IK `2fac6b80-...`).

| Item | Done? | Notes |
|------|-------|--------|
| **RSA keypair (Service Integration)** | [ ] | **Generate RSA** or **Upload RSA** (public key only). Use the **private** key from this keypair for `DOCUSIGN_PRIVATE_KEY`. Must match the public key in DocuSign. |
| **Redirect URIs** | [ ] | Add `https://portal.urbanhub.uk/api/docusign/oauth/callback`. Add `http://localhost:8080/api/docusign/oauth/callback` if you test locally. |
| **User ID, API Account ID, Integration Key** | [ ] | Same values you use in Supabase secrets. Confirm they’re from **production** Apps and Keys. |

**`no_valid_keys_or_signatures`:** The private key in Supabase must be from the **same** RSA keypair whose **public** key is registered for the production app. Demo key or wrong keypair → that error.

---

## 2. JWT Consent (One-Time, Production)

**Location:** Open the **JWT consent URL** in a browser while logged into **production** DocuSign as the impersonation user.

| Item | Done? | Notes |
|------|-------|--------|
| **Grant JWT consent** | [ ] | Use consent URL with **production** `client_id` and redirect URI. Log in as the user whose **User ID** you use in Supabase. Approve once. |

**Example consent URL (replace `YOUR_CLIENT_ID`):**
```
https://account.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=YOUR_CLIENT_ID&redirect_uri=https://portal.urbanhub.uk/api/docusign/oauth/callback
```

---

## 3. Supabase Secrets (Production)

**Location:** **Supabase Dashboard** → **Project Settings** → **Edge Functions** → **Secrets**.

| Secret | Done? | Value |
|--------|-------|--------|
| `DOCUSIGN_AUTH_SERVER` | [ ] | `https://account.docusign.com` |
| `DOCUSIGN_BASE_URL` | [ ] | `https://eu.docusign.net/restapi` (Account Base URI + `/restapi`) |
| `DOCUSIGN_CLIENT_ID` | [ ] | Integration Key from **production** Apps and Keys |
| `DOCUSIGN_USER_ID` | [ ] | User ID from **production** Apps and Keys |
| `DOCUSIGN_ACCOUNT_ID` | [ ] | **API Account ID** from **production** Apps and Keys |
| `DOCUSIGN_PRIVATE_KEY` | [ ] | **PKCS#8** PEM of the **production** app’s RSA private key. Convert PKCS#1 with `openssl pkcs8 -topk8 -nocrypt ...` if needed. |
| `DOCUSIGN_WEBHOOK_SECRET` | [ ] | Same as Connect **HMAC** key (Manage Keys) in **production** |
| `DOCUSIGN_SIGNING_RETURN_URL` | [ ] | `https://portal.urbanhub.uk/portal` (optional) |
| `STRIPE_SECRET_KEY` | [ ] | Live Stripe key if production payments |

---

## 4. Templates (Production)

**Location:** **Production** DocuSign (`app.docusign.com`) → **Templates**.  
Also: **Admin** → **DocuSign Templates** (or Table Editor) → `docusign_templates`.

| Item | Done? | Notes |
|------|-------|--------|
| **Tenancy template** | [ ] | Exists in **production**. Tab labels, roles, Read Only per `DOCUSIGN_SETUP_COMPLETE` / `DOCUSIGN_TEMPLATE_TAB_LABELS`. |
| **Guarantor template** | [ ] | Same as above; use `DOCUSIGN_GUARANTOR_TEMPLATE_TAB_LABELS` for labels. |
| **`docusign_templates`** | [ ] | Rows for production academic year(s) with **production** template IDs. No leading/trailing spaces. |

**`TEMPLATE_ID_INVALID`:** Template IDs must be from the **same** production account (and region) as your App / Base URL.

---

## 5. Connect – Webhook (Production)

**Location:** **Production** DocuSign → **Connect** → **Connect Configurations List** → Add/Edit **Custom Configuration**.

| Item | Done? | Notes |
|------|-------|--------|
| **Name** | [ ] | e.g. `STUCOMMS Booking Portal Webhook` |
| **URL to Publish** | [ ] | `https://pzptocwdaqpczexlbajr.supabase.co/functions/v1/docusign-webhook` (HTTPS, exact path) |
| **Enable Log** | [ ] | Checked (recommended) |
| **Require Acknowledgement** | [ ] | Checked |
| **Data Format** | [ ] | REST v2.1 |
| **Trigger events** | [ ] | Envelope: Sent, Signed/Completed, Declined, Voided. Recipient: Signed/Completed, Declined. |
| **HMAC Signature** | [ ] | **Include HMAC Signature** checked → **Manage Keys** → copy secret → same as `DOCUSIGN_WEBHOOK_SECRET` in Supabase. |
| **OAuth for Connect** | [ ] | **Include Account Level OAuth** / **Configuration Level OAuth** **unchecked** (use HMAC only). |

See `DOCUSIGN_WEBHOOK_RECOMMENDED_SETTINGS.md` and `DOCUSIGN_WEBHOOK_CONFIGURATION_STEP_BY_STEP.md` for details.

---

## 6. Edge Functions

| Function | Done? | Notes |
|----------|-------|--------|
| `docusign-envelopes` | [ ] | Deployed. Uses secrets above. |
| `docusign-recipient-view` | [ ] | Deployed. |
| `docusign-check-status` | [ ] | Deployed. |
| `download-signed-document` | [ ] | Deployed. |
| `docusign-webhook` | [ ] | Deployed. Uses `DOCUSIGN_WEBHOOK_SECRET`. |

No redeploy needed when **only** changing secrets; redeploy if you change function code.

---

## 7. Verification

| Check | Done? | Notes |
|-------|-------|--------|
| **Send agreements** | [ ] | Create test application → complete through Step 5 → trigger “Send agreements”. Envelope created, no `TEMPLATE_ID_INVALID` or `no_valid_keys_or_signatures`. |
| **Embedded signing** | [ ] | Open signing from portal; complete signing. |
| **Webhook / status** | [ ] | After signing, status updates (e.g. to `awaiting_verification`). Check **Edge Functions** → `docusign-webhook` → Logs for webhook received. |
| **Environment check** | [ ] | In `docusign-envelopes` logs, “DocuSign environment check” shows production `authServer`, `baseUrl`, and template IDs. |

---

## Quick Reference – Dev vs Production

| Item | Developer | Production |
|------|-----------|------------|
| Auth server | `https://account-d.docusign.com` | `https://account.docusign.com` |
| Base URL | `https://demo.docusign.net/restapi` | **Account Base URI** + `/restapi` (e.g. `https://eu.docusign.net/restapi`) |
| App / IK | Demo app | **Urbanhub portal** (production) |
| RSA keypair | Demo Service Integration key | **Production** Service Integration key (same app as IK) |
| Templates | Demo templates | **Production** templates; IDs in `docusign_templates` |
| Connect | Demo Connect config | **Production** Connect config (same webhook URL, HMAC key in Supabase) |
| JWT consent | Granted in demo | **Granted once in production** |
| Redirect URI | localhost + portal | Same; add production portal URI if not already |

---

## Docs to Use

- **Secrets / keys:** `DOCUSIGN_PRODUCTION_SECRETS_CHECKLIST.md`
- **Templates / tabs:** `DOCUSIGN_SETUP_COMPLETE.md`, `DOCUSIGN_TEMPLATE_TAB_LABELS.md`, `DOCUSIGN_GUARANTOR_TEMPLATE_TAB_LABELS.md`
- **Connect / webhooks:** `DOCUSIGN_WEBHOOK_RECOMMENDED_SETTINGS.md`, `DOCUSIGN_WEBHOOK_CONFIGURATION_STEP_BY_STEP.md`, `DOCUSIGN_WEBHOOKS_IMPLEMENTATION_GUIDE.md`
- **HMAC secret:** `DOCUSIGN_HMAC_SECRET_UPDATE.md`
- **Troubleshooting:** `DOCUSIGN_TROUBLESHOOTING.md`, `CHECK_DOCUSIGN_LOGS.md`

---

*Based on your developer-account implementation docs. Use this as the “what’s left” checklist for production.*
