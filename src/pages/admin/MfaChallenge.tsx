import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { StaffAuthShell } from "@/components/admin/StaffAuthShell";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getDefaultRouteForRole } from "@/utils/getDefaultRoute";
import { MFA_SETUP_PATH, getStaffMfaRedirect } from "@/utils/staffMfa";

const MfaChallenge = () => {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const continueToApp = async () => {
    await queryClient.invalidateQueries({ queryKey: ["staff-mfa-redirect"] });
    const from = (location.state as { from?: string } | null)?.from;
    if (from && !from.startsWith("/admin/mfa")) {
      navigate(from, { replace: true });
      return;
    }
    const role = profile?.staff_subrole ?? profile?.role ?? "staff";
    const dest = await getDefaultRouteForRole(role);
    navigate(dest || "/admin", { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const redirect = await getStaffMfaRedirect();
      if (cancelled) return;
      if (redirect === null) {
        await continueToApp();
        return;
      }
      if (redirect === MFA_SETUP_PATH) {
        navigate(MFA_SETUP_PATH, { replace: true, state: location.state });
        return;
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async (value: string) => {
    if (value.length !== 6 || verifying) return;
    setError(null);
    setVerifying(true);
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const totpFactor = factors.data.totp[0];
      if (!totpFactor) {
        navigate(MFA_SETUP_PATH, { replace: true, state: location.state });
        return;
      }
      const challenge = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
      if (challenge.error) throw challenge.error;
      const verifyResult = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challenge.data.id,
        code: value,
      });
      if (verifyResult.error) throw verifyResult.error;
      await continueToApp();
    } catch (verifyErr) {
      setError(verifyErr instanceof Error ? verifyErr.message : "That code was not accepted. Try again.");
      setCode("");
      setVerifying(false);
    }
  };

  return (
    <StaffAuthShell
      title="Authenticator code"
      subtitle="Open your authenticator app and enter the 6-digit code for Urban Hub."
    >
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-5">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(value) => {
              setCode(value);
              if (value.length === 6) void verify(value);
            }}
            disabled={verifying}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button
            className="w-full h-12 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold uppercase tracking-wide gap-2"
            disabled={verifying || code.length !== 6}
            onClick={() => void verify(code)}
          >
            {verifying ? (
              <>
                Verifying
                <Loader2 className="h-4 w-4 animate-spin" />
              </>
            ) : (
              <>
                Continue
                <ShieldCheck className="h-4 w-4" />
              </>
            )}
          </Button>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={async () => {
              await signOut();
              navigate("/admin/login", { replace: true });
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </StaffAuthShell>
  );
};

export default MfaChallenge;
