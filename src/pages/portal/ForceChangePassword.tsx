import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { userMustChangePassword } from "@/utils/mustChangePassword";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useBrandingSettings } from "@/hooks/useBranding";

const PortalForceChangePassword = () => {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "Urban Hub";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/portal/login", { replace: true });
      return;
    }
    if (!userMustChangePassword(user)) {
      navigate("/portal", { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: {
          ...(user?.user_metadata || {}),
          account_status: "activated",
          activated_at: new Date().toISOString(),
        },
      });

      if (updateError) {
        setError(updateError.message || "Failed to update password");
        setIsSubmitting(false);
        return;
      }

      const { data: clearData, error: clearError } = await supabase.functions.invoke(
        "clear-must-change-password",
        { body: {} },
      );

      if (clearError || clearData?.error) {
        setError(clearError?.message || clearData?.error || "Password updated but flag clear failed. Please contact support.");
        setIsSubmitting(false);
        return;
      }

      await supabase.auth.refreshSession();
      await refreshProfile(user?.id);

      toast.success("Password updated successfully");
      // Hard navigate so AuthContext picks up cleared app_metadata from the refreshed JWT
      window.location.assign("/portal");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg rounded-3xl shadow-xl border border-border/50 bg-background">
        <CardHeader>
          <CardTitle className="text-xl font-display font-bold uppercase tracking-wide">
            Set a new password
          </CardTitle>
          <CardDescription>
            Your account was opened with a temporary password. Choose a new password to continue to the portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="pl-9 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  className="pl-9 pr-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save password and continue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PortalForceChangePassword;
