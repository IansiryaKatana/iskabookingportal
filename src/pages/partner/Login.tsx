import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Mail, LogIn, Eye, EyeOff, ArrowRight, Lock } from "lucide-react";
import { useBrandingSettings } from "@/hooks/useBranding";

const PartnerLogin = () => {
  const { signIn, loading, user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectPath =
    (location.state as { from?: string })?.from ?? "/partner";
  const { data: brandingSettings, isLoading: brandingLoading } = useBrandingSettings();
  const faviconPath = brandingSettings?.favicon_path;
  const faviconUrl = faviconPath || "/favicon.png";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
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

  useEffect(() => {
    if (user && profile?.role === "partner") {
      navigate(redirectPath, { replace: true });
    }
  }, [user, profile, navigate, redirectPath]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await signIn(email.trim(), password);
    if (signInError) {
      setError(signInError);
      setIsSubmitting(false);
      return;
    }

    // Check if user is a partner
    if (profile?.role !== "partner") {
      setError("This account is not a partner account. Please use the correct login page.");
      setIsSubmitting(false);
      return;
    }

    navigate(redirectPath, { replace: true });
  };

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

        <div className="relative z-10 flex flex-col justify-between p-8 md:p-12 text-white w-full">
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
                EARN MORE WITH EVERY REFERRAL
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
                Track sign-ups, commissions and payouts in real time.
              </p>
            )}

            {/* Statistics */}
            {isInitialLoad ? (
              <div className="grid grid-cols-3 gap-6 md:gap-8 mb-12">
                {[1, 2, 3].map((i) => (
                  <div key={i}>
                    <Skeleton className="h-4 w-20 mb-3 bg-white/20" />
                    <Skeleton className="h-10 md:h-12 w-16 bg-white/20" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-6 md:gap-8 mb-12">
                <div>
                  <p className="text-xs md:text-sm uppercase tracking-[0.2em] text-white/80 mb-2">
                    ACTIVE PARTNERS
                  </p>
                  <p className="text-3xl md:text-4xl font-display font-black">10</p>
                </div>
                <div>
                  <p className="text-xs md:text-sm uppercase tracking-[0.2em] text-white/80 mb-2">
                    TOTAL PAYOUTS
                  </p>
                  <p className="text-3xl md:text-4xl font-display font-black">£23,116</p>
                </div>
                <div>
                  <p className="text-xs md:text-sm uppercase tracking-[0.2em] text-white/80 mb-2">
                    AVG. COMMISSION
                  </p>
                  <p className="text-3xl md:text-4xl font-display font-black">5%</p>
                </div>
              </div>
            )}
          </div>

          {/* Dashboard Visualization */}
          {isInitialLoad ? (
            <div className="relative mt-auto opacity-20">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="space-y-4">
                  {/* Bar Chart Skeleton */}
                  <div className="flex items-end gap-2 h-24">
                    <Skeleton className="flex-1 bg-white/30 rounded-t h-16" />
                    <Skeleton className="flex-1 bg-white/30 rounded-t h-20" />
                    <Skeleton className="flex-1 bg-white/30 rounded-t h-12" />
                    <Skeleton className="flex-1 bg-white/30 rounded-t h-24" />
                    <Skeleton className="flex-1 bg-white/30 rounded-t h-8" />
                  </div>
                  
                  {/* Line Graph Skeleton */}
                  <Skeleton className="h-16 w-full bg-white/30 rounded" />
                  
                  {/* Progress Cards Skeleton */}
                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2].map((i) => (
                      <div key={i} className="bg-white/10 rounded-lg p-3">
                        <Skeleton className="h-3 w-16 mb-2 bg-white/30" />
                        <Skeleton className="h-2 w-full mb-1 bg-white/30 rounded-md" />
                        <Skeleton className="h-3 w-8 bg-white/30" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative mt-auto opacity-20">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                <div className="space-y-4">
                  {/* Bar Chart */}
                  <div className="flex items-end gap-2 h-24">
                    <div className="flex-1 bg-white rounded-t h-16"></div>
                    <div className="flex-1 bg-white rounded-t h-20"></div>
                    <div className="flex-1 bg-white rounded-t h-12"></div>
                    <div className="flex-1 bg-white rounded-t h-24"></div>
                    <div className="flex-1 bg-white rounded-t h-8"></div>
                  </div>
                  
                  {/* Line Graph */}
                  <div className="relative h-16">
                    <svg className="w-full h-full" viewBox="0 0 200 60">
                      <polyline
                        points="0,50 30,45 60,40 90,35 120,30 150,25 180,20 200,15"
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                      />
                    </svg>
                  </div>

                  {/* Progress Cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/10 rounded-lg p-3">
                      <div className="text-xs mb-2 text-white/80">Referrals</div>
                      <div className="h-2 bg-white/20 rounded-md overflow-hidden">
                        <div className="h-full bg-white w-[75%]"></div>
                      </div>
                      <div className="text-xs mt-1 text-white/80">75%</div>
                    </div>
                    <div className="bg-white/10 rounded-lg p-3">
                      <div className="text-xs mb-2 text-white/80">Commissions</div>
                      <div className="h-2 bg-white/20 rounded-md overflow-hidden">
                        <div className="h-full bg-white w-[90%]"></div>
                      </div>
                      <div className="text-xs mt-1 text-white/80">90%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Section - Login Form */}
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
                  EARN MORE WITH EVERY REFERRAL
                </h1>
                <p className="text-sm text-muted-foreground mb-4">
                  Track sign-ups, commissions and payouts in real time.
                </p>
              </>
            )}
            {isInitialLoad ? (
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                {[1, 2, 3].map((i) => (
                  <div key={i}>
                    <Skeleton className="h-3 w-12 mb-2" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground mb-1">ACTIVE</p>
                  <p className="text-xl font-display font-black text-primary">10</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground mb-1">PAYOUTS</p>
                  <p className="text-xl font-display font-black text-primary">£23,116</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.1em] text-muted-foreground mb-1">COMMISSION</p>
                  <p className="text-xl font-display font-black text-primary">5%</p>
                </div>
              </div>
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

          {/* Title */}
          {isInitialLoad ? (
            <div className="space-y-3">
              <Skeleton className="h-10 md:h-12 w-64" />
              <Skeleton className="h-5 w-80" />
            </div>
          ) : (
            <div>
              <h2 className="text-3xl md:text-4xl font-display font-black uppercase tracking-wide text-foreground mb-2">
                PARTNER PORTAL
              </h2>
              <p className="text-sm md:text-base text-muted-foreground">
                Sign in to manage your referrals, links and commissions.
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
                  className="pl-11 h-12 bg-blue-50/50 border-primary/30 focus:border-primary focus:ring-primary rounded-lg"
                  placeholder="Email address"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  className="pr-11 h-12 bg-blue-50/50 border-primary/30 focus:border-primary focus:ring-primary rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">At least 8 characters</p>
            </div>

            {/* Keep Signed In Checkbox */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="keepSignedIn"
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="keepSignedIn" className="text-sm text-muted-foreground cursor-pointer">
                Keep me signed in on this device
              </Label>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Sign In Button */}
            <Button
              type="submit"
              className="w-full h-12 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold uppercase tracking-wide gap-2"
              disabled={isSubmitting || loading}
            >
              {isSubmitting || loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing In
                </>
              ) : (
                <>
                  SIGN IN
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          {/* Links */}
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              Don't have an account?{" "}
              <button
                className="font-semibold text-primary hover:underline"
                onClick={() => navigate("/partner/register")}
              >
                Register as a partner
              </button>
            </div>
            <div>
              Forgot your password?{" "}
              <button
                className="font-semibold text-primary hover:underline"
                onClick={() => navigate("/partner/request-password-reset")}
              >
                Reset it here
              </button>
            </div>
          </div>

          {/* Security Message */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-4">
            <Lock className="h-4 w-4" />
            <span>Secure login & encrypted data</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerLogin;


