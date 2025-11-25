import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, ArrowRight, Lock, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useBrandingSettings } from "@/hooks/useBranding";
import { toast } from "sonner";

const RequestPasswordReset = () => {
  const navigate = useNavigate();
  const { data: brandingSettings } = useBrandingSettings();
  const faviconPath = brandingSettings?.favicon_path;
  const faviconUrl = faviconPath || "/favicon.png";

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (!email.trim()) {
      setError("Please enter your email address");
      setIsSubmitting(false);
      return;
    }

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/portal/reset-password`,
      });

      if (resetError) {
        setError(resetError.message || "Failed to send reset email. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // Success!
      setSuccess(true);
      toast.success("Password reset email sent!");
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-6xl flex rounded-2xl overflow-hidden shadow-2xl">
          {/* Left Section - Success Message (35%) */}
          <div className="w-full lg:w-[35%] bg-white p-6 md:p-8 lg:p-12 flex flex-col">
            {/* Favicon */}
            <div className="mb-6 md:mb-8">
              <div className="h-12 w-12 md:h-14 md:w-14 rounded-lg flex items-center justify-center shadow-md relative" style={{ backgroundColor: 'hsl(350 85% 95%)' }}>
                {faviconLoaded ? (
                  <img 
                    src={faviconUrl} 
                    alt="Urban Hub" 
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

            <div className="flex-1 flex flex-col justify-center">
              <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-full bg-green-100 mb-6">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <h2 className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide text-foreground mb-2 text-center">
                EMAIL SENT
              </h2>
              <p className="text-sm md:text-base text-muted-foreground text-center mb-6">
                We've sent a password reset link to <strong>{email}</strong>. Please check your inbox and follow the instructions to reset your password.
              </p>
              <div className="space-y-3">
                <Button
                  onClick={() => {
                    setSuccess(false);
                    setEmail("");
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Try Again
                </Button>
                <Button
                  onClick={() => navigate("/portal/login")}
                  className="w-full"
                >
                  Back to Login
                </Button>
              </div>
            </div>
          </div>

          {/* Right Section - Gradient (65%) */}
          <div className="hidden lg:flex lg:w-[65%] relative overflow-hidden min-h-[600px]">
            {/* Warm Fluid Mesh Gradient Background */}
            <div className="absolute inset-0 overflow-hidden">
              {/* Base gradient layer */}
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
              {/* Organic flowing mesh layers */}
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
  }

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-6xl flex rounded-2xl overflow-hidden shadow-2xl">
        {/* Left Section - Reset Form (35%) */}
        <div className="w-full lg:w-[35%] bg-white p-6 md:p-8 lg:p-12 flex flex-col">
          {/* Favicon */}
          <div className="mb-6 md:mb-8">
            <div className="h-12 w-12 md:h-14 md:w-14 rounded-lg flex items-center justify-center shadow-md relative" style={{ backgroundColor: 'hsl(350 85% 95%)' }}>
              {faviconLoaded ? (
                <img 
                  src={faviconUrl} 
                  alt="Urban Hub" 
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
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {/* Form */}
          <form className="space-y-6 flex-1 flex flex-col" onSubmit={handleSubmit}>
            <div className="flex-1">
              {/* Email Field */}
              <div className="space-y-2 mb-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="pl-11 h-12"
                    placeholder="Email address"
                  />
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive mb-4">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full h-12 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold uppercase tracking-wide gap-2 flex items-center justify-center"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    Sending...
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </>
                ) : (
                  <>
                    Send Reset Link
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            {/* Links */}
            <div className="space-y-3 text-sm text-muted-foreground mt-6">
              <div>
                <button
                  onClick={() => navigate("/portal/login")}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to login
                </button>
              </div>
              <div>
                Don't have an account?{" "}
                <button
                  className="font-semibold text-primary hover:underline"
                  onClick={() => navigate("/portal/login?mode=register")}
                >
                  Register here
                </button>
              </div>
            </div>

            {/* Security Message */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4">
              <Lock className="h-4 w-4" />
              <span>Secure password reset & encrypted data</span>
            </div>
          </form>
        </div>

        {/* Right Section - Gradient with Content (65%) */}
        <div className="hidden lg:flex lg:w-[65%] relative overflow-hidden min-h-[600px]">
          {/* Warm Fluid Mesh Gradient Background */}
          <div className="absolute inset-0 overflow-hidden">
            {/* Base gradient layer */}
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
            {/* Organic flowing mesh layers */}
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

export default RequestPasswordReset;

