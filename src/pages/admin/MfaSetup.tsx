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
import {
  MFA_CHALLENGE_PATH,
  clearPendingStaffTotpEnrollment,
  getStaffMfaRedirect,
  startStaffTotpEnrollment,
} from "@/utils/staffMfa";

const MfaSetup = () => {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
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
      if (redirect === MFA_CHALLENGE_PATH) {
        navigate(MFA_CHALLENGE_PATH, { replace: true, state: location.state });
        return;
      }
      try {
        const enrollment = await startStaffTotpEnrollment();
        if (cancelled) return;
        setFactorId(enrollment.factorId);
        setQr(enrollment.qr);
        setSecret(enrollment.secret);
      } catch (enrollErr) {
        if (!cancelled) {
          setError(enrollErr instanceof Error ? enrollErr.message : "Could not start authenticator setup");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async (value: string) => {
    if (value.length !== 6 || verifying || !factorId) return;
    setError(null);
    setVerifying(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const verifyResult = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: value,
      });
      if (verifyResult.error) throw verifyResult.error;
      clearPendingStaffTotpEnrollment();
      await continueToApp();
    } catch (verifyErr) {
      const message =
        verifyErr instanceof Error ? verifyErr.message : "That code was not accepted. Try again.";
      if (/factor not found/i.test(message)) {
        clearPendingStaffTotpEnrollment();
        try {
          const enrollment = await startStaffTotpEnrollment();
          setFactorId(enrollment.factorId);
          setQr(enrollment.qr);
          setSecret(enrollment.secret);
          setError("That QR expired. Scan the new code, then enter a fresh 6-digit code.");
        } catch (enrollErr) {
          setError(enrollErr instanceof Error ? enrollErr.message : message);
        }
        setCode("");
        setVerifying(false);
        return;
      }
      setError(message);
      setCode("");
      setVerifying(false);
    }
  };

  return (
    <StaffAuthShell
      title="Set up authenticator"
      subtitle="Scan the QR code with Google Authenticator, Authy, or 1Password, then enter the 6-digit code."
    >
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-5">
          {qr && (
            <div className="flex justify-center">
              <img src={qr} alt="Authenticator QR code" className="h-44 w-44 rounded-lg border bg-white p-2" />
            </div>
          )}
          {secret && (
            <p className="text-xs text-muted-foreground break-all">
              Can&apos;t scan? Enter this key manually:{" "}
              <span className="font-mono text-foreground">{secret}</span>
            </p>
          )}
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
                Enable authenticator
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

export default MfaSetup;
