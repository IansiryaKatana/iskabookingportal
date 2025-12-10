# How to Generate Webhook Secret
## Quick Guide for DOCUSIGN_WEBHOOK_SECRET

**Date:** 2025-01-28  
**Purpose:** Generate a secure random string for DocuSign webhook authentication

---

## 🎯 What You Need

A **32+ character random string** to use as your webhook secret.

**Example:**
```
a7f3b9c2d4e8f1a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0
```

---

## ✅ Method 1: Online Generator (Easiest)

### Option A: Random.org
1. Go to: https://www.random.org/strings/
2. Settings:
   - **Length:** 32 (or more)
   - **Character set:** Alphanumeric (or All)
   - **Generate:** Click button
3. Copy the generated string

### Option B: LastPass Password Generator
1. Go to: https://www.lastpass.com/features/password-generator
2. Set length to 32 or more
3. Copy the generated password

### Option C: 1Password Generator
1. Go to: https://1password.com/password-generator/
2. Set length to 32 or more
3. Copy the generated password

---

## ✅ Method 2: PowerShell (Windows)

### Option A: Simple Random String
```powershell
# Generate 32 character random string
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

### Option B: More Secure (Recommended)
```powershell
# Generate 32 character hex string (most secure)
-join ((1..32) | ForEach-Object { '{0:X}' -f (Get-Random -Maximum 256) })
```

### Option C: Using .NET (Most Secure)
```powershell
# Generate 32 character random string using .NET
[Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Maximum 256 }))
```

**To run:**
1. Open PowerShell
2. Copy and paste one of the commands above
3. Press Enter
4. Copy the output

---

## ✅ Method 3: Node.js (If Installed)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**To run:**
1. Open terminal/command prompt
2. Run the command above
3. Copy the output

---

## ✅ Method 4: Python (If Installed)

```python
import secrets
print(secrets.token_hex(32))
```

**To run:**
1. Open terminal
2. Run: `python -c "import secrets; print(secrets.token_hex(32))"`
3. Copy the output

---

## ✅ Method 5: Browser Console (Quick)

1. Open your browser
2. Press `F12` (or right-click → Inspect)
3. Go to **Console** tab
4. Paste this code:
```javascript
Array.from(crypto.getRandomValues(new Uint8Array(32)))
  .map(b => b.toString(16).padStart(2, '0'))
  .join('')
```
5. Press Enter
6. Copy the output

---

## 🎯 Recommended Method

**For Windows users (easiest):**
1. Use **Random.org** (Method 1, Option A)
   - Go to: https://www.random.org/strings/
   - Generate 32+ character string
   - Copy it

**For developers:**
- Use PowerShell (Method 2, Option B) or Node.js (Method 3)

---

## 📋 What to Do With the Secret

Once you have your random string:

1. **Save it securely** (you'll need it in two places)
2. **Add to Supabase:**
   - Go to Supabase Dashboard
   - Project Settings → Edge Functions → Secrets
   - Add: `DOCUSIGN_WEBHOOK_SECRET` = your generated string
3. **Add to DocuSign:**
   - Use the same string in DocuSign webhook configuration
   - Authentication → HMAC Signature → Secret

**Important:** Use the **same secret** in both places!

---

## 🔒 Security Notes

- **Length:** 32+ characters recommended (longer is better)
- **Character set:** Alphanumeric + special characters is best
- **Storage:** Keep it secure, don't commit to git
- **Uniqueness:** Generate a new one for each environment (dev/prod)

---

## ✅ Quick Test

After generating, verify:
- ✅ Length is 32+ characters
- ✅ Contains random characters (not predictable)
- ✅ Saved securely
- ✅ Ready to add to Supabase and DocuSign

---

**Last Updated:** 2025-01-28

