/** Public hCaptcha sitekey. The secret stays in the Supabase dashboard only. */
export const HCAPTCHA_SITE_KEY =
  import.meta.env.VITE_HCAPTCHA_SITE_KEY ||
  "8f141984-5694-4426-a6ce-3e28e8ec9704";

export const CAPTCHA_REQUIRED_MESSAGE =
  "Please complete the captcha before continuing.";
