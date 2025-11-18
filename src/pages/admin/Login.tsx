import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail } from "lucide-react";

const Login = () => {
  const { signIn, loading, user, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectPath =
    (location.state as { from?: string })?.from ?? "/admin";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <div className="min-h-screen bg-primary flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg rounded-3xl shadow-xl border border-border/50 bg-background">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center">
            <img src="/favicon.png" alt="Urban Hub" className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl font-display font-black uppercase tracking-wide">
            Admin Portal
          </CardTitle>
          <CardDescription>
            Manage Urban Hub bookings and student journeys.
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
                  placeholder="staff@urbanhub.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="uppercase text-xs tracking-[0.3em]">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full rounded-full uppercase tracking-wide"
              disabled={isSubmitting || loading}
            >
              {isSubmitting || loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing In
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;

