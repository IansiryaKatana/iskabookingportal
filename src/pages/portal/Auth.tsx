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
import { Loader2, LogIn, UserPlus, CheckCircle2, Mail } from "lucide-react";

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

  const redirectPath =
    (location.state as { redirect?: string })?.redirect ?? "/portal";

  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState<{
    email: string;
  } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedMode = params.get("mode") === "register" ? "register" : "login";
    setMode(requestedMode);
  }, [location.search]);

  const switchMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
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
    if (user && profile?.role === "student") {
      navigate(redirectPath, { replace: true });
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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr,1.1fr]">
        <Card className="rounded-3xl bg-primary text-primary-foreground shadow-xl">
          <CardHeader className="space-y-4">
            <CardTitle className="text-3xl font-display uppercase tracking-wide">
              Urban Hub Booking
            </CardTitle>
            <CardDescription className="text-primary-foreground/80 text-base leading-relaxed">
              Log in or create an account to secure your contract, finish the
              booking journey, and manage payments online. Your progress saves
              automatically as you complete each step.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-primary-foreground/80">
            <p>
              Already paid a deposit in person? Complete the booking journey to
              upload documents and sign your tenancy agreement digitally.
            </p>
            <p>
              If you are a returning resident, log in with your existing
              credentials to review and renew your application.
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-3xl shadow-2xl border border-border/60">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl font-display uppercase tracking-wide">
              {mode === "login" ? "Student Login" : "Create Account"}
            </CardTitle>
            <CardDescription>
              {mode === "login"
                ? "Access your booking journey."
                : "Register to begin your Urban Hub booking journey."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full rounded-full uppercase tracking-wide gap-2"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Signing In
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        Sign In
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
                            autoComplete={mode === "login" ? "email" : "email"}
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
                          <Input
                            type="password"
                            placeholder="••••••••"
                            autoComplete={mode === "login" ? "current-password" : "new-password"}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full rounded-full uppercase tracking-wide gap-2"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating Account
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Register
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            )}
            {!registrationSuccess && (
              <div className="text-sm text-muted-foreground text-center">
                {mode === "login" ? (
                  <>
                    Need an account?{" "}
                    <button
                      className="font-semibold text-primary hover:underline"
                      onClick={() => {
                        switchMode("register");
                        setError(null);
                        setRegistrationSuccess(null);
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
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      className="font-semibold text-primary hover:underline"
                      onClick={() => {
                        switchMode("login");
                        setError(null);
                        setRegistrationSuccess(null);
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
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PortalAuth;

