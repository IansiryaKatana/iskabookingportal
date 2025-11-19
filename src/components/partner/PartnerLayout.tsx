import { useNavigate, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronLeft, UserCircle2, LayoutDashboard, Users, DollarSign, User } from "lucide-react";
import clsx from "clsx";
import { useState } from "react";
import { usePartner } from "@/hooks/usePartner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const navItems = [
  {
    label: "Dashboard",
    to: "/partner",
    icon: LayoutDashboard,
  },
  {
    label: "My Referrals",
    to: "/partner/referrals",
    icon: Users,
  },
  {
    label: "Commissions",
    to: "/partner/commissions",
    icon: DollarSign,
  },
  {
    label: "Profile",
    to: "/partner/profile",
    icon: User,
  },
];

type PartnerLayoutProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  hideNav?: boolean;
};

const PartnerLayout = ({
  children,
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  hideNav = false,
}: PartnerLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut, user } = useAuth();
  const { data: partner } = usePartner();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const handleSignOut = async () => {
    setShowSignOutDialog(false);
    await signOut();
    navigate("/partner/login", { replace: true });
  };

  const isActiveRoute = (path: string) => {
    if (path === "/partner") {
      return location.pathname === "/partner";
    }
    return location.pathname.startsWith(path);
  };

  const partnerName = partner?.name || profile?.first_name || "Partner";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex flex-col lg:flex-row">
      {!hideNav && (
        <>
          {/* Desktop Sidebar */}
          <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:h-screen lg:sticky lg:top-0 bg-background/80 backdrop-blur border-r border-border/50">
            <div className="px-6 py-6 border-b border-border/50 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-display font-black uppercase tracking-wide">
                    Partner Portal
                  </h1>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mt-1">
                    Urban Hub
                  </p>
                </div>
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1 min-h-0">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = isActiveRoute(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={clsx(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    onClick={() => setMobileNavOpen(false)}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
            <div className="px-4 py-4 border-t border-border/50 flex-shrink-0">
              <div className="flex items-center gap-3 px-4 py-3 text-sm">
                <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{partnerName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {user?.email || ""}
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full rounded-full uppercase tracking-wide mt-2"
                onClick={() => setShowSignOutDialog(true)}
              >
                Sign Out
              </Button>
            </div>
          </aside>

          {/* Mobile Navigation */}
          <div className="lg:hidden">
            <header className="border-b border-border/50 bg-background/80 backdrop-blur sticky top-0 z-20">
              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {onBack && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full uppercase tracking-wide gap-2"
                      onClick={handleBack}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {backLabel}
                    </Button>
                  )}
                  <div>
                    <h1 className="text-lg font-display font-black uppercase tracking-wide">
                      {title || "Partner Portal"}
                    </h1>
                    {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full uppercase tracking-wide"
                  onClick={() => setMobileNavOpen(!mobileNavOpen)}
                >
                  Menu
                </Button>
              </div>
              {mobileNavOpen && (
                <nav className="px-4 py-4 border-t border-border/50 space-y-1 bg-background">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = isActiveRoute(item.to);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={clsx(
                          "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-muted",
                        )}
                        onClick={() => setMobileNavOpen(false)}
                      >
                        <Icon className="h-5 w-5" />
                        {item.label}
                      </NavLink>
                    );
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full rounded-full uppercase tracking-wide mt-4"
                    onClick={() => setShowSignOutDialog(true)}
                  >
                    Sign Out
                  </Button>
                </nav>
              )}
            </header>
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-screen lg:overflow-y-auto">
        {hideNav && (
          <header className="border-b border-border/50 bg-background/80 backdrop-blur sticky top-0 z-20 flex-shrink-0">
            <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {onBack && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full uppercase tracking-wide gap-2"
                    onClick={handleBack}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {backLabel}
                  </Button>
                )}
                {title && (
                  <div>
                    <h1 className="text-xl md:text-2xl font-display font-black uppercase tracking-wide">
                      {title}
                    </h1>
                    {subtitle && <p className="text-xs md:text-sm text-muted-foreground">{subtitle}</p>}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <UserCircle2 className="h-6 w-6 text-muted-foreground" />
                  <div className="leading-tight">
                    <div className="font-semibold">{partnerName}</div>
                    <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Partner Portal
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full uppercase tracking-wide"
                  onClick={() => setShowSignOutDialog(true)}
                >
                  Sign Out
                </Button>
              </div>
            </div>
          </header>
        )}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12">
          {children}
        </main>
      </div>

      <AlertDialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display uppercase tracking-wide">
              Sign Out
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out? You'll need to sign in again to access your partner dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full uppercase tracking-wide">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSignOut}
              className="rounded-full uppercase tracking-wide bg-primary hover:bg-primary/90"
            >
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PartnerLayout;

