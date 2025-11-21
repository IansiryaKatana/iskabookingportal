import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, LogIn, Eye, EyeOff } from "lucide-react";

const PartnerLogin = () => {
  const { signIn, loading, user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectPath =
    (location.state as { from?: string })?.from ?? "/partner";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg rounded-3xl shadow-xl border border-border/50 bg-background">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center">
            <img src="/favicon.png" alt="Urban Hub" className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl font-display font-black uppercase tracking-wide">
            Partner Portal
          </CardTitle>
          <CardDescription>
            Access your partner dashboard to track referrals and commissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email" className="uppercase text-xs tracking-[0.3em]">
                Email Address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="pl-10"
                  placeholder="partner@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="uppercase text-xs tracking-[0.3em]">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
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

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full rounded-full uppercase tracking-wide gap-2"
              disabled={isSubmitting || loading}
            >
              {isSubmitting || loading ? (
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

          <div className="mt-6 text-sm text-muted-foreground text-center">
            Don't have an account?{" "}
            <button
              className="font-semibold text-primary hover:underline"
              onClick={() => navigate("/partner/register")}
            >
              Register here
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PartnerLogin;

