import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2 } from "lucide-react";

const STORAGE_KEY = "newsletter_popup_shown";
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_SETTINGS = {
  is_enabled: true,
  show_after_seconds: 5,
  show_once_per_session: true,
  show_once_per_day: false,
  headline: "Stay Updated",
  subheadline: "Get the latest news and tips about student life at Urban Hub.",
  button_text: "Subscribe",
  success_message: "Thanks for subscribing!",
};

export default function NewsletterPopup() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<typeof DEFAULT_SETTINGS | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from("website_newsletter_settings").select("*").limit(1).maybeSingle();
      if (data) {
        setSettings({
          is_enabled: data.is_enabled ?? true,
          show_after_seconds: data.show_after_seconds ?? 5,
          show_once_per_session: data.show_once_per_session ?? true,
          show_once_per_day: data.show_once_per_day ?? false,
          headline: data.headline ?? DEFAULT_SETTINGS.headline,
          subheadline: data.subheadline ?? DEFAULT_SETTINGS.subheadline,
          button_text: data.button_text ?? DEFAULT_SETTINGS.button_text,
          success_message: data.success_message ?? DEFAULT_SETTINGS.success_message,
        });
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (isAdmin) return;
    const s = settings ?? DEFAULT_SETTINGS;
    if (!s.is_enabled) return;

    if (s.show_once_per_session && sessionStorage.getItem(STORAGE_KEY) === "1") return;
    if (s.show_once_per_day) {
      const shown = localStorage.getItem(STORAGE_KEY);
      if (shown && Date.now() - parseInt(shown, 10) < DAY_MS) return;
    }

    const delay = (s.show_after_seconds || 5) * 1000;
    const t = setTimeout(() => setOpen(true), delay);
    return () => clearTimeout(t);
  }, [settings, isAdmin]);

  const handleClose = () => {
    setOpen(false);
    const s = settings ?? DEFAULT_SETTINGS;
    if (s.show_once_per_session) sessionStorage.setItem(STORAGE_KEY, "1");
    if (s.show_once_per_day) localStorage.setItem(STORAGE_KEY, String(Date.now()));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email.trim())) {
      setError("Please enter a valid email.");
      return;
    }
    setLoading(true);
    const { error: insertError } = await supabase.from("website_newsletter_subscribers").insert({
      email: email.trim().toLowerCase(),
      source: "popup",
    });
    setLoading(false);
    if (insertError) {
      if (insertError.code === "23505") {
        setError("This email is already subscribed.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      return;
    }
    setSubmitted(true);
  };

  if (isAdmin) return null;
  const s = settings ?? DEFAULT_SETTINGS;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); setOpen(o); }}>
      <DialogContent
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={handleClose}
        onEscapeKeyDown={handleClose}
      >
        <DialogHeader className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <DialogTitle className="text-xl font-display font-black uppercase tracking-wide">
              {s.headline}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="shrink-0 rounded-full h-8 w-8 bg-accent-yellow text-black hover:bg-black hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <DialogDescription className="text-muted-foreground text-sm">
            {s.subheadline}
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-6 flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-green-100 p-3">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-lg font-semibold text-green-700">{s.success_message}</p>
            <Button variant="outline" size="sm" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <Input
                id="newsletter-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="h-12"
                disabled={loading}
                required
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <Button type="submit" className="w-full h-12" disabled={loading} data-analytics="newsletter-subscribe">
              {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
              {s.button_text}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
