import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LogIn, UserPlus, CheckCircle2, Mail, Eye, EyeOff, ArrowRight, Check, Lock } from "lucide-react";
import { useBrandingSettings } from "@/hooks/useBranding";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const registerSchema = loginSchema.extend({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
});

const PortalAuth = () => {
  const { user, profile, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: brandingSettings } = useBrandingSettings();
  const faviconPath = brandingSettings?.favicon_path;
  const faviconUrl = faviconPath || "/favicon.png";

  const redirectPath =
    (location.state as { redirect?: string })?.redirect ?? "/portal";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState<{
    email: string;
  } | null>(null);
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

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedMode = params.get("mode") === "register" ? "register" : "login";
    setMode(requestedMode);
  }, [location.search]);

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

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setShowPassword(false);
    const params = new URLSearchParams(location.search);
    if (nextMode === "register") {
      params.set("mode", "register");
    } else {
      params.delete("mode");
    }
    navigate(
      {
        pathname: location.pathname,
        search: params.toString(),
      },
      { replace: true, state: location.state },
    );
  };

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (user && profile) {
      // Redirect staff/admin to admin portal
      const isStaff = profile.role === "staff" || profile.role === "superadmin" || profile.role === "admin" || 
                     profile.role === "operations_manager" || profile.role === "reservationist" || 
                     profile.role === "accountant" || profile.role === "front_desk";
      if (isStaff) {
        navigate("/admin", { replace: true });
        return;
      }
      // Redirect partners to partner portal
      if (profile.role === "partner") {
        navigate("/partner", { replace: true });
        return;
      }
      // Only students can access portal
      if (profile.role === "student") {
        navigate(redirectPath, { replace: true });
      }
    }
  }, [user, profile, navigate, redirectPath]);

  const handleLogin = async (values: z.infer<typeof loginSchema>) => {
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await signIn(values.email, values.password);
    if (signInError) {
      setError(signInError);
      setSubmitting(false);
      return;
    }
    navigate(redirectPath, { replace: true });
  };

  const handleRegister = async (values: z.infer<typeof registerSchema>) => {
    setSubmitting(true);
    setError(null);
    setRegistrationSuccess(null);
    const result = await signUp(
      values.email,
      values.password,
      {
        first_name: values.first_name,
        last_name: values.last_name,
      },
    );
    
    // Check if email confirmation is required
    if ("requiresConfirmation" in result && result.requiresConfirmation) {
      setRegistrationSuccess({ email: result.email });
      setSubmitting(false);
      return;
    }
    
    // Check for errors
    if ("error" in result && result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    
    // Success - user is logged in (email confirmation disabled or already confirmed)
    navigate(redirectPath, { replace: true });
  };

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-6xl flex rounded-2xl overflow-hidden shadow-2xl">
        {/* Left Section - Login/Register Form (35%) */}
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
                  alt={brandingSettings?.company_name || "Urban Hub"} 
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
              {mode === "login" ? "Student Login" : "Create Account"}
            </h2>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              {mode === "login" ? (
                <>
                  <Lock className="h-4 w-4" />
                  <span>Secure login & encrypted data</span>
                </>
              ) : (
                `Register to begin your ${brandingSettings?.company_name || "Urban Hub"} booking journey.`
              )}
            </p>
          </div>

          {/* Form Content */}
          <div className="flex-1 flex flex-col">
            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
                {error}
              </div>
            )}
            {registrationSuccess ? (
              <div className="space-y-6 text-center py-4">
                <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-xl font-display font-semibold uppercase tracking-wide">
                    Account Created Successfully!
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    We've sent a confirmation email to{" "}
                    <span className="font-semibold text-foreground">
                      {registrationSuccess.email}
                    </span>
                  </p>
                </div>
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3 text-left">
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">Next steps:</p>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li>Check your email inbox (and spam folder)</li>
                        <li>Click the confirmation link in the email</li>
                        <li>Return here to sign in and continue your booking journey</li>
                      </ol>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-full uppercase tracking-wide"
                  onClick={() => {
                    setRegistrationSuccess(null);
                    setMode("login");
                    registerForm.reset({
                      first_name: "",
                      last_name: "",
                      email: "",
                      password: "",
                    });
                  }}
                >
                  Back to Sign In
                </Button>
              </div>
            ) : mode === "login" ? (
              <Form {...loginForm} key="login">
                <form
                  className="space-y-4"
                  autoComplete="off"
                  onSubmit={loginForm.handleSubmit(handleLogin)}
                >
                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="you@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              className="pr-10"
                              {...field}
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
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full h-12 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold uppercase tracking-wide gap-2 flex items-center justify-center"
                    disabled={submitting}
                  >
                    {submitting ? (
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
                </form>
              </Form>
            ) : (
              <Form {...registerForm} key="register">
                <form
                  className="space-y-4"
                  autoComplete="off"
                  onSubmit={registerForm.handleSubmit(handleRegister)}
                >
                  <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={registerForm.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="First name"
                            autoComplete="given-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                    <FormField
                      control={registerForm.control}
                      name="last_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                          <Input
                            placeholder="Last name"
                            autoComplete="family-name"
                            {...field}
                          />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={registerForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="you@example.com"
                            type="email"
                            autoComplete="email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={registerForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="••••••••"
                              autoComplete="new-password"
                              className="pr-10"
                              {...field}
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
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full h-12 rounded-lg bg-primary hover:bg-primary/90 text-white font-semibold uppercase tracking-wide gap-2 flex items-center justify-center"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        Creating Account
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </>
                    ) : (
                      <>
                        Register
                        <Check className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            )}
            {!registrationSuccess && mode === "login" && (
              <>
                {/* Links */}
                <div className="space-y-3 text-sm text-muted-foreground mt-4">
                  <div>
                    Don't have an account?{" "}
                    <button
                      className="font-semibold text-primary hover:underline"
                      onClick={() => {
                        switchMode("register");
                        setError(null);
                        setRegistrationSuccess(null);
                        setShowPassword(false);
                        registerForm.reset({
                          first_name: "",
                          last_name: "",
                          email: "",
                          password: "",
                        });
                        loginForm.reset({
                          email: "",
                          password: "",
                        });
                      }}
                    >
                      Register here
                    </button>
                  </div>
                  <div>
                    Forgot your password?{" "}
                    <button
                      className="font-semibold text-primary hover:underline"
                      onClick={() => navigate("/portal/request-password-reset")}
                    >
                      Reset it here
                    </button>
                  </div>
                </div>
              </>
            )}
            {!registrationSuccess && mode === "register" && (
              <div className="text-sm text-muted-foreground text-center mt-6">
                Already have an account?{" "}
                <button
                  className="font-semibold text-primary hover:underline"
                  onClick={() => {
                    switchMode("login");
                    setError(null);
                    setRegistrationSuccess(null);
                    setShowPassword(false);
                    loginForm.reset({
                      email: "",
                      password: "",
                    });
                    registerForm.reset({
                      first_name: "",
                      last_name: "",
                      email: "",
                      password: "",
                    });
                  }}
                >
                  Sign in
                </button>
              </div>
            )}
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
              {/* Welcome - Large text */}
              <div className="mb-4">
                <p className="text-4xl md:text-5xl lg:text-6xl font-display font-black uppercase tracking-wide text-white">
                  {greeting}
                </p>
              </div>

              {/* Descriptive Text - Small size, single paragraph with emphasis */}
              <div className="max-w-lg ml-auto">
                <p className="text-[10px] md:text-[11px] leading-relaxed text-white/95">
                  Log in or create an account to <span className="font-bold">secure your contract</span>, finish the booking journey, and manage payments online. <span className="font-bold">Your progress saves automatically</span> as you complete each step. Already paid a deposit in person? Complete the booking journey to upload documents and <span className="font-bold">sign your tenancy agreement digitally</span>. If you are a returning resident, log in with your existing credentials to review and renew your application.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalAuth;

