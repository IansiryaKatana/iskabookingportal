import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Eye, EyeOff, ArrowRight, Lock, ArrowLeft } from "lucide-react";
import { useBrandingSettings } from "@/hooks/useBranding";

const Login = () => {
  const { signIn, loading, user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: brandingSettings } = useBrandingSettings();
  const faviconPath = brandingSettings?.favicon_path;
  const faviconUrl = faviconPath || "/favicon.png";

  const redirectPath =
    (location.state as { from?: string })?.from ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [faviconLoaded, setFaviconLoaded] = useState(false);

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return "GOOD MORNING";
    } else if (hour >= 12 && hour < 18) {
      return "GOOD AFTERNOON";
    } else {
      return "GOOD EVENING";
    }
  };

  const greeting = getGreeting();

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
    if (user && profile?.role && profile.role !== "student") {
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

    navigate(redirectPath, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ backgroundColor: '#fbb37c' }}>
      <div className="w-full max-w-6xl flex rounded-2xl overflow-hidden shadow-2xl">
        {/* Left Section - Login Form (35%) */}
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
              Staff Login
            </h2>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span>Access the admin dashboard</span>
            </p>
          </div>

          {/* Form Content */}
          <div className="flex-1 flex flex-col">
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

                {/* Password Field */}
                <div className="space-y-2 mb-4">
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Password"
                      className="pr-11 h-12"
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
                </div>

                {/* Error Message */}
                {error && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive mb-4">
                    {error}
                  </div>
                )}

                {/* Sign In Button */}
                <Button
                  type="submit"
                  className="w-full h-12 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold uppercase tracking-wide gap-2 flex items-center justify-center"
                  disabled={isSubmitting || loading}
                >
                  {isSubmitting || loading ? (
                    <>
                      Signing In
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>

            {/* Links */}
            <div className="space-y-3 text-sm text-muted-foreground mt-6">
              <div>
                Forgot your password?{" "}
                <button
                  className="font-semibold text-primary hover:underline"
                  onClick={() => navigate("/admin/request-password-reset")}
                >
                  Reset it here
                </button>
              </div>
              <div>
                <button
                  onClick={() => navigate("/studios")}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to homepage
                </button>
              </div>
            </div>
          </div>
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
            <div 
              className="absolute inset-0 opacity-30 animate-gradient-shift"
              style={{
                background: `
                  radial-gradient(ellipse 35% 50% at 15% 60%, hsl(30 100% 65%) 0%, transparent 70%),
                  radial-gradient(ellipse 55% 45% at 85% 30%, hsl(20 90% 60%) 0%, transparent 70%),
                  radial-gradient(ellipse 40% 60% at 45% 90%, hsl(10 85% 58%) 0%, transparent 70%)
                `,
                backgroundSize: "220% 220%",
                animationDelay: "4s",
              }}
            />
            {/* Subtle highlight layers for depth */}
            <div 
              className="absolute inset-0 opacity-20"
              style={{
                background: `
                  radial-gradient(ellipse 30% 40% at 25% 25%, hsl(48 96% 53%) 0%, transparent 80%),
                  radial-gradient(ellipse 35% 50% at 75% 75%, hsl(40 100% 75%) 0%, transparent 80%),
                  radial-gradient(ellipse 30% 45% at 65% 25%, hsl(25 95% 70%) 0%, transparent 80%)
                `,
              }}
            />
          </div>

          {/* Content - Positioned at bottom right */}
          <div className="relative z-10 w-full h-full">
            <div className="absolute bottom-0 right-0 text-right" style={{ paddingBottom: '50px', paddingRight: '50px' }}>
              {/* Greeting - Large text */}
              <div className="mb-4">
                <p className="text-4xl md:text-5xl lg:text-6xl font-display font-black uppercase tracking-wide text-white">
                  {greeting}
                </p>
              </div>

              {/* Descriptive Text - Small size, single paragraph with emphasis */}
              <div className="max-w-lg ml-auto">
                <p className="text-[10px] md:text-[11px] leading-relaxed text-white/95">
                  Log in to access the admin dashboard and manage student bookings, applications, and payments. Monitor application statuses, process payments, review documents, and oversee the complete student journey from enquiry to confirmation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
