# DocuSign Production – Secrets Checklist & Checks

Use this to verify your Supabase secrets and DocuSign config when fixing `TEMPLATE_ID_INVALID` or auth issues.

---

## 1. Required secrets (Supabase Edge Functions)

Set these in **Supabase Dashboard → Project Settings → Edge Functions → Secrets** (or via `supabase secrets set`).

| Secret | Required | Example / notes |
|--------|----------|------------------|
| `DOCUSIGN_CLIENT_ID` | ✅ | Integration Key from Apps and Keys (e.g. `2fac6b80-...`) |
| `DOCUSIGN_USER_ID` | ✅ | User ID (GUID) from Apps and Keys |
| `DOCUSIGN_ACCOUNT_ID` | ✅ | API Account ID from Apps and Keys |
| `DOCUSIGN_PRIVATE_KEY` | ✅ | **PKCS#8** PEM (`-----BEGIN PRIVATE KEY-----` … `-----END PRIVATE KEY-----`). Convert DocuSign’s PKCS#1 with `openssl pkcs8 -topk8 -nocrypt …` (see §3). |
| `DOCUSIGN_AUTH_SERVER` | ✅ **Critical** | **Production:** `https://account.docusign.com` — **not** `account-d` |
| `DOCUSIGN_BASE_URL` | ✅ **Critical** | Use your **Account Base URI** from Apps and Keys + `/restapi`, e.g. `https://na4.docusign.net/restapi` or `https://eu.docusign.net/restapi`. Do **not** use `https://www.docusign.net/restapi` unless that matches your Account Base URI. |
| `DOCUSIGN_SIGNING_RETURN_URL` | Optional | e.g. `https://portal.urbanhub.uk/portal` (for `docusign-recipient-view`) |
| `STRIPE_SECRET_KEY` | ✅ | Used to verify deposit before sending agreements. **LIVE** (production keys + webhook verified Feb 2026). |

**Template IDs** come from the **`docusign_templates`** table, **not** from secrets.  
`DOCUSIGN_TENANCY_TEMPLATE_ID` / `DOCUSIGN_GUARANTOR_TEMPLATE_ID` are **not** used for envelope creation.

---

## 2. Demo vs production – most common cause of `TEMPLATE_ID_INVALID`

If **`DOCUSIGN_AUTH_SERVER`** or **`DOCUSIGN_BASE_URL`** are missing or wrong, the function uses **demo**:

- **Auth:** `https://account-d.docusign.com`
- **API:** `https://demo.docusign.net/restapi`

Production template IDs do **not** exist in demo → **`TEMPLATE_ID_INVALID`**.

**Fix:** Set explicitly:

- `DOCUSIGN_AUTH_SERVER` = `https://account.docusign.com`
- `DOCUSIGN_BASE_URL` = **Account Base URI** from DocuSign **Apps and Keys** + `/restapi` (e.g. `https://na4.docusign.net/restapi` or `https://eu.docusign.net/restapi`). Using `https://www.docusign.net/restapi` can route to the wrong pod and cause `TEMPLATE_ID_INVALID`.

(No trailing slashes, no typos.)

---

## 3. Private key format (PKCS#8 required)

**DocuSign gives you PKCS#1** (`-----BEGIN RSA PRIVATE KEY-----`). Our JWT library needs **PKCS#8** (`-----BEGIN PRIVATE KEY-----`). Convert it first:

```bash
openssl pkcs8 -topk8 -nocrypt -inform PEM -outform PEM -in docusign_private.key -out docusign_pkcs8.pem
```

Use the **contents of `docusign_pkcs8.pem`** as `DOCUSIGN_PRIVATE_KEY` (full PEM, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`).

- Line breaks: **Dashboard** – paste as-is with real newlines; **CLI** – use `\n` between lines (code replaces `\\n`).
- No extra spaces or characters before/after the key.
- Must be the key for the **production** app (same Integration Key / account).

**Error `"pkcs8" must be PKCS#8 formatted string`?** → You're using PKCS#1. Convert with the command above and update the secret.

---

## 4. Secrets updated via UI – redeploy?

**No.** Supabase injects secrets at runtime. Changing secrets in the Dashboard does **not** require redeploying the function. Just save and retry.

---

## 5. Verify what the function is using (logs)

After triggering “Send agreements”, check **Supabase → Edge Functions → `docusign-envelopes` → Logs**.

Look for **`DocuSign environment check`**:

- `authServer`: should be `https://account.docusign.com` (production).
- `baseUrl`: should match your **Account Base URI** + `/restapi` (e.g. `https://na4.docusign.net/restapi` or `https://eu.docusign.net/restapi`), **not** necessarily `https://www.docusign.net/restapi`.
- `isProductionAuth` / `isProductionApi`: should be `true` when using production.
- `tenancyTemplateId`: the template ID we’re sending (should match `docusign_templates`).

If `authServer` or `baseUrl` point to **demo**, fix the secrets above and retry.

---

## 6. DocuSign account vs templates

- **Apps and Keys** (Integration Key, User ID, Account ID) and **Private Key** must all belong to the **same** DocuSign **production** account.
- Templates must exist in **that same** account.  
  Different production account → same error pattern.

---

## 7. Quick checklist

- [ ] `DOCUSIGN_AUTH_SERVER` = `https://account.docusign.com`
- [ ] `DOCUSIGN_BASE_URL` = **Account Base URI** from Apps and Keys + `/restapi` (e.g. `https://na4.docusign.net/restapi` or `https://eu.docusign.net/restapi`)
- [ ] `DOCUSIGN_CLIENT_ID`, `DOCUSIGN_USER_ID`, `DOCUSIGN_ACCOUNT_ID` match Apps and Keys (production).
- [ ] `DOCUSIGN_PRIVATE_KEY` is the full key for that app, correct format.
- [x] `STRIPE_SECRET_KEY` set (live key — production verified Feb 2026).
- [ ] Template IDs in **`docusign_templates`** are **production** IDs (from `app.docusign.com`), no spaces.
- [ ] JWT consent granted once in **production** (via the consent URL for your client ID).
- [ ] Redirect URI for that app includes your callback (e.g. `https://portal.urbanhub.uk/api/docusign/oauth/callback`).

---

## 8. Hardcoded values – do you need to change code?

**No.** Nothing in the DocuSign integration is hardcoded in a way that requires code changes for production.

| What | Where | Production action |
|------|--------|-------------------|
| **DocuSign credentials** | All from **Supabase Edge Function secrets** (`DOCUSIGN_*`). | Set **production** values in **Supabase → Edge Functions → Secrets**. No code change. |
| **Template IDs** | From **`docusign_templates`** table (Admin → DocuSign Templates). | Ensure rows use **production** template IDs. Not in code. |
| **Demo fallbacks** | Edge Functions use **demo** URLs (`account-d`, `demo.docusign.net`) only when a secret is **missing**. | Set all DocuSign secrets in production; fallbacks are never used. No code change. |
| **`portal.urbanhub.uk`** | CORS, redirect URLs, `DOCUSIGN_SIGNING_RETURN_URL` default. | Correct for your production portal. Change only if you switch domain. |
| **`.env.local`** | Local dev only; not used by Edge Functions or production build. | Production uses **Supabase secrets**. Keep .env.local for local dev only. |

**Summary:** Use **production** values in **Supabase secrets** and in **`docusign_templates`**. No DocuSign credentials or template IDs are hardcoded in code.

---

*Last updated: 2026-01*
