import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Mail, ArrowRight, Lock, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useBrandingSettings } from "@/hooks/useBranding";
import { toast } from "sonner";

const RequestPasswordReset = () => {
  const navigate = useNavigate();
  const { data: brandingSettings, isLoading: brandingLoading } = useBrandingSettings();
  const faviconPath = brandingSettings?.favicon_path;
  const faviconUrl = faviconPath || "/favicon.png";

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [faviconLoaded, setFaviconLoaded] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Track initial load completion
  useEffect(() => {
    if (!brandingLoading) {
      const timer = setTimeout(() => setIsInitialLoad(false), 500);
      return () => clearTimeout(timer);
    }
  }, [brandingLoading]);

  // Reset favicon loaded state when favicon URL changes
  useEffect(() => {
    setFaviconLoaded(false);
    // Preload the favicon image
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
        redirectTo: `https://portal.urbanhub.uk/partner/reset-password`,
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
      <div className="min-h-screen flex">
        {/* Left Section - Promotional/Information */}
        <div 
          className="hidden lg:flex lg:w-1/2 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, hsl(0 85% 45%) 0%, hsl(0 85% 55%) 50%, hsl(0 85% 60%) 100%)"
          }}
        >
          {/* Geometric wave patterns */}
          <div className="absolute inset-0 opacity-10">
            <svg className="w-full h-full" viewBox="0 0 1200 800" preserveAspectRatio="none">
              <path
                d="M0,400 Q300,300 600,400 T1200,400 L1200,800 L0,800 Z"
                fill="white"
              />
              <path
                d="M0,500 Q400,350 800,450 T1200,500 L1200,800 L0,800 Z"
                fill="white"
              />
            </svg>
          </div>

          <div className="relative z-10 flex flex-col justify-center p-8 md:p-12 text-white w-full">
            <div>
              <div className="mb-8">
                <div className="h-14 w-14 rounded-lg bg-white flex items-center justify-center shadow-lg">
                  {faviconLoaded ? (
                    <img 
                      src={faviconUrl} 
                      alt="Urban Hub" 
                      className="h-10 w-10"
                    />
                  ) : (
                    <span className="text-primary font-display font-black text-xl">SC</span>
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
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-black uppercase leading-tight mb-4">
                CHECK YOUR EMAIL
              </h1>
              <p className="text-base md:text-lg text-white/90 max-w-md">
                We've sent you a password reset link. Please check your inbox and follow the instructions.
              </p>
            </div>
          </div>
        </div>

        {/* Right Section - Success Message */}
        <div className="w-full lg:w-1/2 flex items-center justify-center bg-white p-4 md:p-8 lg:p-12">
          <div className="w-full max-w-md space-y-6 md:space-y-8">
            <div className="mb-8">
              <div className="h-14 w-14 rounded-lg bg-primary flex items-center justify-center shadow-md relative">
                {faviconLoaded ? (
                  <img 
                    src={faviconUrl} 
                    alt="Urban Hub" 
                    className="h-10 w-10"
                  />
                ) : (
                  <span className="text-white font-display font-black text-xl">SC</span>
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

            <div>
              <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-md bg-green-100 mb-6">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>
              <h2 className="text-3xl md:text-4xl font-display font-black uppercase tracking-wide text-foreground mb-2 text-center">
                EMAIL SENT
              </h2>
              <p className="text-sm md:text-base text-muted-foreground text-center">
                We've sent a password reset link to <strong>{email}</strong>. Please check your inbox and follow the instructions to reset your password.
              </p>
            </div>

            <div className="space-y-3 text-sm text-muted-foreground text-center">
              <p>Didn't receive the email? Check your spam folder or try again.</p>
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
                onClick={() => navigate("/partner/login")}
                className="w-full"
              >
                Back to Login
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Section - Promotional/Information */}
      <div 
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, hsl(0 85% 45%) 0%, hsl(0 85% 55%) 50%, hsl(0 85% 60%) 100%)"
        }}
      >
        {/* Geometric wave patterns */}
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 1200 800" preserveAspectRatio="none">
            <path
              d="M0,400 Q300,300 600,400 T1200,400 L1200,800 L0,800 Z"
              fill="white"
            />
            <path
              d="M0,500 Q400,350 800,450 T1200,500 L1200,800 L0,800 Z"
              fill="white"
            />
          </svg>
        </div>

        <div className="relative z-10 flex flex-col justify-center p-8 md:p-12 text-white w-full">
          <div>
            {/* Logo */}
            <div className="mb-8">
              <div className="h-14 w-14 rounded-lg bg-white flex items-center justify-center shadow-lg relative">
                {faviconLoaded ? (
                  <img 
                    src={faviconUrl} 
                    alt="Urban Hub" 
                    className="h-10 w-10"
                  />
                ) : (
                  <span className="text-primary font-display font-black text-xl">SC</span>
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

            {/* Headline */}
            {isInitialLoad ? (
              <div className="mb-4 space-y-3">
                <Skeleton className="h-12 md:h-16 lg:h-20 w-full max-w-2xl bg-white/20" />
                <Skeleton className="h-12 md:h-16 lg:h-20 w-3/4 max-w-xl bg-white/20" />
              </div>
            ) : (
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-black uppercase leading-tight mb-4">
                RESET YOUR PASSWORD
              </h1>
            )}

            {/* Tagline */}
            {isInitialLoad ? (
              <div className="mb-12 max-w-md">
                <Skeleton className="h-5 w-full bg-white/20 mb-2" />
                <Skeleton className="h-5 w-4/5 bg-white/20" />
              </div>
            ) : (
              <p className="text-base md:text-lg text-white/90 mb-12 max-w-md">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right Section - Reset Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white p-4 md:p-8 lg:p-12">
        <div className="w-full max-w-md space-y-6 md:space-y-8">
          {/* Mobile Header - Show on mobile only */}
          <div className="lg:hidden mb-6">
            <div className="mb-6">
              <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center shadow-md relative">
                {faviconLoaded ? (
                  <img 
                    src={faviconUrl} 
                    alt="Urban Hub" 
                    className="h-8 w-8"
                  />
                ) : (
                  <span className="text-white font-display font-black text-lg">SC</span>
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
            {isInitialLoad ? (
              <div className="space-y-3 mb-4">
                <Skeleton className="h-7 w-full max-w-xs" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-display font-black uppercase tracking-wide text-foreground mb-2">
                  RESET YOUR PASSWORD
                </h1>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
              </>
            )}
          </div>

          {/* Logo - Desktop only */}
          <div className="hidden lg:block mb-8">
            <div className="h-14 w-14 rounded-lg bg-primary flex items-center justify-center shadow-md relative">
              {faviconLoaded ? (
                <img 
                  src={faviconUrl} 
                  alt="Urban Hub" 
                  className="h-10 w-10"
                />
              ) : (
                <span className="text-white font-display font-black text-xl">SC</span>
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

          {/* Title - Desktop only */}
          {isInitialLoad ? (
            <div className="hidden lg:block space-y-3">
              <Skeleton className="h-10 md:h-12 w-64" />
              <Skeleton className="h-5 w-80" />
            </div>
          ) : (
            <div className="hidden lg:block">
              <h2 className="text-3xl md:text-4xl font-display font-black uppercase tracking-wide text-foreground mb-2">
                RESET PASSWORD
              </h2>
              <p className="text-sm md:text-base text-muted-foreground">
                Enter your email address and we'll send you instructions to reset your password.
              </p>
            </div>
          )}

          {/* Form */}
          <form className="space-y-6" onSubmit={handleSubmit}>
            {/* Email Field */}
            <div className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="pl-11 h-12 bg-blue-50/50 border-primary/30 focus:border-primary focus:ring-0 focus:ring-offset-0 rounded-lg"
                  placeholder="Email address"
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-12 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold uppercase tracking-wide gap-2"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  SEND RESET LINK
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          {/* Links */}
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              <button
                onClick={() => navigate("/partner/login")}
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
                onClick={() => navigate("/partner/register")}
              >
                Register as a partner
              </button>
            </div>
          </div>

          {/* Security Message */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4">
            <Lock className="h-4 w-4" />
            <span>Secure password reset & encrypted data</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequestPasswordReset;

