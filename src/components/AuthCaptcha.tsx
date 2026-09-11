import { forwardRef } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { HCAPTCHA_SITE_KEY } from "@/utils/hcaptcha";

type AuthCaptchaProps = {
  onVerify: (token: string) => void;
  onExpire?: () => void;
};

const AuthCaptcha = forwardRef<HCaptcha, AuthCaptchaProps>(
  function AuthCaptcha({ onVerify, onExpire }, ref) {
    return (
      <div className="flex justify-center overflow-x-auto py-1">
        <HCaptcha
          ref={ref}
          sitekey={HCAPTCHA_SITE_KEY}
          onVerify={onVerify}
          onExpire={() => onExpire?.()}
          onError={() => onExpire?.()}
        />
      </div>
    );
  },
);

export default AuthCaptcha;
