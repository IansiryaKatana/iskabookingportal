import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Loader2, UserPlus, CheckCircle2, Mail, Info, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";

const registerSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  referral_code: z.string().min(1, "Referral code is required").toUpperCase(),
  phone: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const PartnerRegister = () => {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState<{
    email: string;
  } | null>(null);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      first_name: "",
      last_name: "",
      referral_code: "",
      phone: "",
    },
  });

  const referralCode = form.watch("referral_code");
  const normalizedCode = referralCode?.trim().toUpperCase() || "";

  // Validate referral code in real-time
  const { data: codeValidation, isLoading: isValidatingCode } = useQuery({
    queryKey: ["check-referral-code", normalizedCode],
    queryFn: async () => {
      if (!normalizedCode || normalizedCode.length === 0) return null;

      const { data, error } = await supabase.rpc("check_referral_code_available", {
        p_referral_code: normalizedCode,
      });

      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!normalizedCode && normalizedCode.length > 0,
    staleTime: 30000,
  });

  const handleRegister = async (values: z.infer<typeof registerSchema>) => {
    setSubmitting(true);
    setRegistrationSuccess(null);

    try {
      // Validate referral code one more time
      if (isValidatingCode) {
        toast({
          variant: "destructive",
          title: "Validating referral code",
          description: "Please wait while we validate your referral code.",
        });
        return;
      }

      if (!codeValidation?.is_available) {
        if (codeValidation?.is_already_linked) {
          form.setError("referral_code", {
            message: "This referral code is already linked to another account. Please contact admin.",
          });
        } else {
          form.setError("referral_code", {
            message: "Invalid referral code. Please check and try again.",
          });
        }
        setSubmitting(false);
        return;
      }

      // Create auth user
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
        toast({
          variant: "destructive",
          title: "Registration failed",
          description: result.error,
        });
        setSubmitting(false);
        return;
      }

      // Link account to partner using referral code
      const { data: session } = await supabase.auth.getSession();
      if (session?.user) {
        const { error: linkError } = await supabase.rpc("link_partner_account", {
          p_referral_code: normalizedCode,
          p_user_id: session.user.id,
        });

        if (linkError) {
          // Improved error handling: Attempt to clean up orphaned account
          console.error("Failed to link partner account:", linkError);

          toast({
            variant: "destructive",
            title: "Account created but linking failed",
            description: linkError.message || "Please contact admin to link your account. You can still log in.",
          });
          // Still allow login, admin can fix later via admin panel
          // Note: Account exists but is not linked - admin can link via "Create Account" button
        } else {
          toast({
            title: "Account created successfully",
            description: "Your partner account has been linked. Redirecting to dashboard...",
          });
          setTimeout(() => {
            navigate("/partner", { replace: true });
          }, 1500);
          return;
        }
      }

      // Success - redirect to dashboard
      navigate("/partner", { replace: true });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: error.message || "An error occurred. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-2xl rounded-3xl shadow-2xl border border-border/60">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-display uppercase tracking-wide">
            Partner Registration
          </CardTitle>
          <CardDescription>
            Create your partner account to track referrals and commissions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
                      <li>Return here to sign in and access your partner dashboard</li>
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
                  form.reset();
                  navigate("/partner/login");
                }}
              >
                Back to Sign In
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form
                className="space-y-4"
                autoComplete="off"
                onSubmit={form.handleSubmit(handleRegister)}
              >
                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="First name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Last name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="you@example.com" type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="+44 123 456 7890" type="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
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
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="referral_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Referral Code *</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="Enter your referral code"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e.target.value.toUpperCase().trim());
                            }}
                            className={codeValidation && (
                              codeValidation.is_available
                                ? "border-green-500 focus-visible:ring-green-500"
                                : "border-red-500 focus-visible:ring-red-500"
                            )}
                          />
                          {normalizedCode && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              {isValidatingCode ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : codeValidation?.is_available ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : codeValidation?.is_already_linked ? (
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              ) : null}
                            </div>
                          )}
                        </div>
                      </FormControl>
                      {normalizedCode && codeValidation && (
                        <div className="mt-2">
                          {codeValidation.is_available ? (
                            <Alert className="border-green-500/50 bg-green-500/10">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <AlertDescription className="text-green-700 text-sm">
                                Valid code - {codeValidation.partner_name}
                              </AlertDescription>
                            </Alert>
                          ) : codeValidation.is_already_linked ? (
                            <Alert className="border-red-500/50 bg-red-500/10">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                              <AlertDescription className="text-red-700 text-sm">
                                This referral code is already linked to another account. Please contact admin.
                              </AlertDescription>
                            </Alert>
                          ) : (
                            <Alert className="border-red-500/50 bg-red-500/10">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                              <AlertDescription className="text-red-700 text-sm">
                                Invalid referral code. Please check and try again.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter the referral code provided by your admin
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full rounded-full uppercase tracking-wide gap-2"
                  disabled={submitting || isValidatingCode || !codeValidation?.is_available}
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
              Already have an account?{" "}
              <button
                className="font-semibold text-primary hover:underline"
                onClick={() => navigate("/partner/login")}
              >
                Sign in
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PartnerRegister;

