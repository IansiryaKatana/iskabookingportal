import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Lock, Eye, EyeOff, CheckCircle2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useBrandingSettings } from "@/hooks/useBranding";
import { useAuth } from "@/contexts/AuthContext";

const AdminResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: brandingSettings } = useBrandingSettings();
  const { profile } = useAuth();
  const faviconPath = brandingSettings?.favicon_path;
  const faviconUrl = faviconPath || "/favicon.png";
  const companyName = brandingSettings?.company_name || "StudentStaySolutions";
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [success, setSuccess] = useState(false);
  const [faviconLoaded, setFaviconLoaded] = useState(false);

  // Preload favicon
  useEffect(() => {
    setFaviconLoaded(false);
    if (faviconUrl) {
      const img = new Image();
      img.onload = () => setFaviconLoaded(true);
      img.onerror = () => setFaviconLoaded(true);
      img.src = faviconUrl;
    }
  }, [faviconUrl]);

  useEffect(() => {
    // Check if we have a valid reset token in the URL
    const checkToken = async () => {
      const hash = window.location.hash;
      const hasRecoveryToken = hash && hash.includes("type=recovery");
      
      // Also check query params (some email clients strip hash)
      const queryType = searchParams.get("type");
      const hasQueryRecovery = queryType === "recovery";
      
      if (!hasRecoveryToken && !hasQueryRecovery) {
        setError("Invalid or missing token. Please request a new link.");
        setIsValidating(false);
        return;
      }

      // Wait a moment for Supabase to process the hash automatically
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if Supabase has automatically set a session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (session && !sessionError) {
        // Session exists - token is valid
        setIsValidToken(true);
        setIsValidating(false);
        return;
      }

      // If no session, try to manually extract and set it
      if (hasRecoveryToken) {
        try {
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          
          if (accessToken && refreshToken) {
            const { error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            
            if (!setSessionError) {
              setIsValidToken(true);
              setIsValidating(false);
              return;
            }
          }
        } catch (err) {
          console.error("Error parsing token:", err);
        }
      }

      // Try query params
      if (hasQueryRecovery) {
        try {
          const accessToken = searchParams.get("access_token");
          const refreshToken = searchParams.get("refresh_token");
          
          if (accessToken && refreshToken) {
            const { error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            
            if (!setSessionError) {
              setIsValidToken(true);
              setIsValidating(false);
              return;
            }
          }
        } catch (err) {
          console.error("Error setting session from query params:", err);
        }
      }
      
      // If we get here, token is invalid or expired
      setError("Invalid or expired token. Please request a new link.");
      setIsValidating(false);
    };

    checkToken();
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Validation
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
      // Get current user to preserve existing metadata
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      // Update password and account status using Supabase auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
        data: {
          ...(currentUser?.user_metadata || {}),
          account_status: "activated",
          activated_at: new Date().toISOString(),
        },
      });

      if (updateError) {
        setError(updateError.message || "Failed to update password. The link may have expired.");
        setIsSubmitting(false);
        return;
      }

      // Success! Redirect to admin portal
      setSuccess(true);
      toast.success("Password updated successfully!");
      
      // Redirect to admin dashboard after 2 seconds
      setTimeout(() => {
        navigate("/admin", { 
          replace: true,
          state: { message: "Password updated successfully." }
        });
      }, 2000);

    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: '#fbb37c' }}>
        <Card className="w-full max-w-lg rounded-3xl shadow-xl border border-border/50 bg-background">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <p className="text-center text-muted-foreground">Validating token...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: '#fbb37c' }}>
        <Card className="w-full max-w-lg rounded-3xl shadow-xl border border-border/50 bg-background">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-display font-black uppercase tracking-wide">
              Password Updated!
            </CardTitle>
            <CardDescription>
              Your password has been successfully updated. Redirecting to admin dashboard...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: '#fbb37c' }}>
        <Card className="w-full max-w-lg rounded-3xl shadow-xl border border-border/50 bg-background">
          <CardHeader className="space-y-3 text-center">
            <CardTitle className="text-2xl font-display font-black uppercase tracking-wide">
              Invalid Link
            </CardTitle>
            <CardDescription>
              {error || "This link is invalid or has expired."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate("/admin/login")}
              className="w-full rounded-full uppercase tracking-wide"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: '#fbb37c' }}>
      <div className="w-full max-w-6xl flex rounded-2xl overflow-hidden shadow-2xl">
        {/* Left Section - Form (35%) */}
        <div className="w-full lg:w-[35%] bg-white p-6 md:p-8 lg:p-12 flex flex-col">
          {/* Favicon */}
          <div className="mb-6 md:mb-8">
            <div
              className="h-12 w-12 md:h-14 md:w-14 rounded-lg flex items-center justify-center shadow-md relative"
              style={{ backgroundColor: "hsl(350 85% 92%)" }}
            >
              {faviconLoaded ? (
                <img 
                  src={faviconUrl} 
                  alt={companyName} 
                  className="h-8 w-8 md:h-10 md:w-10"
                />
              ) : (
                <span className="text-white font-display font-black text-lg md:text-xl">SC</span>
              )}
              <img 
                src={faviconUrl} 
                alt="" 
                className="hidden"
                onLoad={() => setFaviconLoaded(true)}
                onError={() => setFaviconLoaded(true)}
              />
            </div>
          </div>

          {/* Form Title */}
          <div className="mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide text-foreground mb-2">
              Reset Password
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter your new password below. Make sure it's at least 6 characters long.
            </p>
          </div>

          {/* Form */}
          <form className="space-y-6 flex-1 flex flex-col" onSubmit={handleSubmit}>
            <div className="flex-1">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                      className="pr-10 h-12"
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">
                    Confirm Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="••••••••"
                      className="pr-10 h-12"
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive mt-4">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold uppercase tracking-wide gap-2 flex items-center justify-center mt-6"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Update Password
                  </>
                )}
              </Button>
            </div>

            {/* Links */}
            <div className="space-y-3 text-sm text-muted-foreground mt-6">
              <div>
                <button
                  onClick={() => navigate("/admin/login")}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to login
                </button>
              </div>
            </div>

            {/* Security Message */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4">
              <Lock className="h-4 w-4" />
              <span>Secure password & encrypted data</span>
            </div>
          </form>
        </div>

        {/* Right Section - Gradient (65%) */}
        <div className="hidden lg:flex lg:w-[65%] relative overflow-hidden min-h-[600px]">
          <div className="absolute inset-0 overflow-hidden">
            <div 
              className="absolute inset-0 animate-gradient-shift"
              style={{
                background: `
                  radial-gradient(ellipse 80% 50% at 20% 30%, hsl(48 96% 53%) 0%, transparent 50%),
                  radial-gradient(ellipse 60% 80% at 80% 20%, hsl(25 95% 65%) 0%, transparent 50%),
                  radial-gradient(ellipse 70% 60% at 50% 70%, hsl(0 85% 55%) 0%, transparent 50%),
                  radial-gradient(ellipse 50% 70% at 10% 80%, hsl(30 100% 60%) 0%, transparent 50%),
                  radial-gradient(ellipse 60% 50% at 90% 60%, hsl(20 85% 58%) 0%, transparent 50%),
                  hsl(0 85% 55%)
                `,
                backgroundSize: "200% 200%",
              }}
            />
            <div 
              className="absolute inset-0 opacity-40 animate-gradient-shift"
              style={{
                background: `
                  radial-gradient(ellipse 40% 60% at 30% 50%, hsl(48 96% 53%) 0%, transparent 60%),
                  radial-gradient(ellipse 50% 40% at 70% 40%, hsl(35 100% 70%) 0%, transparent 60%),
                  radial-gradient(ellipse 45% 55% at 60% 80%, hsl(25 95% 68%) 0%, transparent 60%),
                  radial-gradient(ellipse 40% 50% at 15% 75%, hsl(15 88% 62%) 0%, transparent 60%)
                `,
                backgroundSize: "180% 180%",
                animationDelay: "2s",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminResetPassword;

