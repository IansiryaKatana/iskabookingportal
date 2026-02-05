# Console errors: CSP, passive listener, and extension messages

This doc explains the console errors you may see on the portal and what (if anything) to do.

---

## 1. Content-Security-Policy (CSP) blocking fonts and styles

**What you see:**  
`Loading the font '<URL>' violates... "font-src 'none'"` or `"style-src 'self'"... The action has been blocked.`  
Stylesheets from `fonts.googleapis.com`, Stripe, or hCaptcha may be blocked.

**Cause:**  
A strict Content-Security-Policy is being sent that does not allow:
- Fonts from Google (e.g. `fonts.gstatic.com`)
- Styles from Google Fonts, Stripe, or hCaptcha

**Fix (in this repo):**  
`netlify.toml` now sets a `Content-Security-Policy` header that allows:
- **font-src:** `'self'` `https://fonts.gstatic.com` `data:`
- **style-src:** `'self'` `'unsafe-inline'` plus `fonts.googleapis.com`, Stripe, and hCaptcha style origins
- **script-src / frame-src / connect-src:** as needed for Stripe and hCaptcha

After you deploy, these CSP errors should go away **if** no other layer is sending a stricter CSP.

**If errors persist after deploy:**  
Check Netlify dashboard → Site settings → Build & deploy → Post processing (or Security / Headers). If a stricter CSP is set there (e.g. “Enable strict CSP”), remove it or relax it so the policy in `netlify.toml` is the one in effect.

---

## 2. “Unable to preventDefault inside passive event listener invocation”

**What you see:**  
`vendor-BRSxN7yp.js:29 Unable to preventDefault inside passive event listener invocation` (often repeated on scroll/touch).

**Cause:**  
Browsers make touch/scroll listeners **passive** by default for performance. Some dependency in the vendor bundle (e.g. carousel, chart, or UI lib) is calling `preventDefault()` on such a listener, which the browser ignores and logs.

**Impact:**  
Usually cosmetic only: one specific scroll/touch behaviour might not be preventable. The app still works.

**What you can do:**  
- **Ignore** if the app behaves correctly.
- **Track down the library** (e.g. Embla Carousel, a chart lib) and update it or open an issue; the fix is for that lib to register the listener as non-passive if it really needs `preventDefault()`.
- There is no one-line fix in our app code without patching the dependency.

---

## 3. “A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received”

**What you see:**  
`Uncaught (in promise) Error: A listener indicated an asynchronous response by returning true...`  
Often from URLs like `js.stripe.com`, `newassets.hcaptcha.com`, or your page URL.

**Cause:**  
This comes from **browser extensions** (e.g. ad blockers, password managers, React DevTools). The extension’s content script sends a message and the receiver doesn’t respond in time, so the message channel closes. It is **not** from your application code.

**Impact:**  
None on your app. Stripe and hCaptcha still work; we already catch and handle similar-looking errors in the payment flow where needed.

**What you can do:**  
- **Ignore** these in production.
- To reduce noise during development: test in an incognito window with extensions disabled, or disable extensions that inject scripts on Stripe/hCaptcha pages.

---

## Summary

| Error | Source | Action |
|-------|--------|--------|
| CSP blocking font/style | Your (or Netlify) CSP too strict | Use CSP in `netlify.toml`; remove stricter CSP elsewhere if needed |
| preventDefault in passive listener | Vendor dependency (e.g. carousel) | Ignore or update the dependency |
| Message channel closed | Browser extensions | Ignore; not from your code |

After deploying with the updated `netlify.toml`, re-check the console; the CSP-related errors should be resolved as long as no other CSP overrides them.
