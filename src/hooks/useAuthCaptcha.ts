import { useCallback, useRef, useState } from "react";
import type HCaptcha from "@hcaptcha/react-hcaptcha";
import { CAPTCHA_REQUIRED_MESSAGE } from "@/utils/hcaptcha";

export function useAuthCaptcha() {
  const captchaRef = useRef<HCaptcha>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null);
    captchaRef.current?.resetCaptcha();
  }, []);

  const consumeCaptchaToken = useCallback((): { token?: string; error?: string } => {
    if (!captchaToken) {
      return { error: CAPTCHA_REQUIRED_MESSAGE };
    }
    return { token: captchaToken };
  }, [captchaToken]);

  return {
    captchaRef,
    captchaToken,
    onVerify: setCaptchaToken,
    onExpire: resetCaptcha,
    resetCaptcha,
    consumeCaptchaToken,
  };
}
