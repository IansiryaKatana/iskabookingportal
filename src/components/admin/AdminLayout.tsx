import { useNavigate, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileSpreadsheet,
  LogOut,
  Settings,
  Calendar,
  Layers,
  Building2,
  ClipboardCheck,
  CreditCard,
  TrendingUp,
  Users,
  FileText,
  Mail,
  MessageSquare,
  UserCog,
  Menu,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import clsx from "clsx";
import { useState } from "react";
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
    label: "Overview",
    to: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Academic Years",
    to: "/admin/academic-years",
    icon: Calendar,
  },
  {
    label: "Studio Grades",
    to: "/admin/studio-grades",
    icon: Layers,
  },
  {
    label: "Payment Plans",
    to: "/admin/payment-plans",
    icon: CreditCard,
  },
  {
    label: "Contracts",
    to: "/admin/contracts",
    icon: FileSpreadsheet,
  },
  {
    label: "Studios",
    to: "/admin/studios",
    icon: Building2,
  },
  {
    label: "Applications",
    to: "/admin/applications",
    icon: ClipboardCheck,
  },
  {
    label: "Students",
    to: "/admin/students",
    icon: Users,
  },
  {
    label: "Reports",
    to: "/admin/reports",
    icon: FileText,
  },
  {
    label: "Bulk Messages",
    to: "/admin/bulk-messages",
    icon: MessageSquare,
  },
  {
    label: "Email Templates",
    to: "/admin/email-templates",
    icon: Mail,
  },
  {
    label: "Financial Forecast",
    to: "/admin/financial-forecast",
    icon: TrendingUp,
  },
  {
    label: "Payment History",
    to: "/admin/payment-history",
    icon: CreditCard,
  },
  {
    label: "Fully Paid Students",
    to: "/admin/fully-paid-students",
    icon: CheckCircle2,
  },
  {
    label: "Users",
    to: "/admin/users",
    icon: UserCog,
  },
  {
    label: "Refunds",
    to: "/admin/refunds",
    icon: CreditCard,
  },
  {
    label: "Audit Logs",
    to: "/admin/audit-logs",
    icon: FileText,
  },
  {
    label: "Settings",
    to: "/admin/settings",
    icon: Settings,
  },
];

type AdminLayoutProps = {
  children: React.ReactNode;
  pageTitle?: string;
  subtitle?: string;
  mobileActionButton?: React.ReactNode;
};

const AdminLayout = ({ children, pageTitle, subtitle, mobileActionButton }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut, loading } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  const handleSignOut = async () => {
    setShowSignOutDialog(false);
    await signOut();
    navigate("/admin/login", { replace: true });
  };

  const isActiveRoute = (path: string) => {
    if (path === "/admin") {
      return location.pathname === "/admin";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-muted flex flex-col lg:flex-row">
      {/* Desktop Sidebar - Fixed height, only nav scrolls */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:h-screen lg:sticky lg:top-0 bg-background border-r border-border">
        {/* Sidebar Header - Fixed */}
        <div className="px-6 py-6 border-b border-border flex-shrink-0">
          <h1 className="text-2xl font-display font-bold uppercase tracking-wide">
            Urban Hub Admin
          </h1>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Staff Console
          </p>
        </div>
        {/* Sidebar Nav - Scrollable if needed */}
        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1 min-h-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        {/* Sidebar Footer with Sign Out - Fixed */}
        <div className="px-4 py-6 border-t border-border space-y-2 flex-shrink-0">
          {loading ? (
            <div className="rounded-xl bg-muted/40 px-4 py-3 space-y-2">
              <div className="h-3 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="h-3 w-16 bg-muted animate-pulse rounded" />
            </div>
          ) : (
            <div className="rounded-xl bg-muted/40 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Signed in as
              </p>
              <p className="text-sm font-semibold">
                {profile?.first_name} {profile?.last_name}
              </p>
              <p className="text-xs text-muted-foreground">{profile?.role}</p>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => setShowSignOutDialog(true)}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile Navigation */}
      <div className="lg:hidden">
        <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-20">
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-display font-bold uppercase tracking-wide truncate">
                  {pageTitle || "Admin Dashboard"}
                </h1>
                {subtitle && (
                  <p className="text-xs text-muted-foreground truncate">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {mobileActionButton}
              <Button
                variant="outline"
                size="sm"
                className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0"
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
              >
                <Menu className="h-4 w-4" />
                Menu
              </Button>
            </div>
          </div>
          {mobileNavOpen && (
            <nav className="px-4 py-4 border-t border-border space-y-1 bg-background max-h-[calc(100vh-80px)] overflow-y-auto">
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
              <div className="pt-4 mt-4 border-t border-border">
                {loading ? (
                  <div className="rounded-xl bg-muted/40 px-4 py-3 space-y-2">
                    <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  </div>
                ) : (
                  <div className="rounded-xl bg-muted/40 px-4 py-3 mb-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Signed in as
                    </p>
                    <p className="text-sm font-semibold">
                      {profile?.first_name} {profile?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{profile?.role}</p>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-full uppercase tracking-wide gap-2"
                  onClick={() => setShowSignOutDialog(true)}
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              </div>
            </nav>
          )}
        </header>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 w-full lg:ml-0 min-h-screen lg:overflow-y-auto">
        <header className="hidden lg:block sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-border px-4 py-4 md:px-8 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              {loading ? (
                <>
                  <div className="h-7 w-48 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-64 bg-muted animate-pulse rounded mt-2" />
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-display font-bold uppercase tracking-wide">
                    {pageTitle ?? "Dashboard"}
                  </h2>
                  {subtitle && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {subtitle}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8 md:py-10">{children}</main>
      </div>

      {/* Sign Out Confirmation Dialog */}
      <AlertDialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display uppercase tracking-wide">
              Sign Out
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out of the admin portal? You'll need to sign in again to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full uppercase tracking-wide">
              Cancel
            </AlertDialogCancel>
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

export default AdminLayout;

