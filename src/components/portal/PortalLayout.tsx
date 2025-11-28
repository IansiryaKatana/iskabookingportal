import { useNavigate, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentName } from "@/hooks/useStudentName";
import { ChevronLeft, UserCircle2, LayoutDashboard, CreditCard, FileText, FolderOpen, User, Bell } from "lucide-react";
import clsx from "clsx";
import { useState } from "react";
import NotificationBell from "./NotificationBell";
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
    to: "/portal",
    icon: LayoutDashboard,
  },
  {
    label: "Payments",
    to: "/portal/payments",
    icon: CreditCard,
  },
  {
    label: "Contracts",
    to: "/portal/contracts",
    icon: FileText,
  },
  {
    label: "Documents",
    to: "/portal/documents",
    icon: FolderOpen,
  },
  {
    label: "Notifications",
    to: "/portal/notifications",
    icon: Bell,
  },
  {
    label: "Profile",
    to: "/portal/profile",
    icon: User,
  },
];

type PortalLayoutProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  hideNav?: boolean;
  mobileHeaderActions?: React.ReactNode;
};

const PortalLayout = ({
  children,
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  hideNav = false,
  mobileHeaderActions,
}: PortalLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const studentName = useStudentName();
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
    navigate("/portal/login", { replace: true });
  };

  const isActiveRoute = (path: string) => {
    if (path === "/portal") {
      return location.pathname === "/portal";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex flex-col lg:flex-row">
      {!hideNav && (
        <>
          {/* Desktop Sidebar - Fixed height, only nav scrolls */}
          <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:h-screen lg:sticky lg:top-0 bg-background/80 backdrop-blur border-r border-border/50">
            {/* Sidebar Header - Fixed */}
            <div className="px-6 py-6 border-b border-border/50 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-display font-black uppercase tracking-wide">
                    Student Portal
                  </h1>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mt-1">
                    Urban Hub
                  </p>
                </div>
                <NotificationBell />
              </div>
            </div>
            {/* Sidebar Nav - Scrollable if needed */}
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
            {/* Sidebar Footer with Sign Out - Fixed */}
            <div className="px-4 py-4 border-t border-border/50 flex-shrink-0">
              <div className="flex items-center gap-3 px-4 py-3 text-sm">
                <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {studentName.full_name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {profile?.email || ""}
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
                      {title || "Student Portal"}
                    </h1>
                    {subtitle && (
                      <p className="text-xs text-muted-foreground">
                        {subtitle}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <NotificationBell />
                  {mobileHeaderActions}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full uppercase tracking-wide"
                    onClick={() => setMobileNavOpen(!mobileNavOpen)}
                  >
                    Menu
                  </Button>
                </div>
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

      {/* Main Content - Scrollable */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen lg:overflow-y-auto">
        {hideNav && (
          <header className="border-b border-border/50 bg-background/80 backdrop-blur sticky top-0 z-20 flex-shrink-0">
            <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-3 md:py-4">
              {/* Mobile Layout - Stacked */}
              <div className="flex flex-col gap-3 md:hidden">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {onBack && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-full shrink-0 border-border/60"
                        onClick={handleBack}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    )}
                    {title && (
                      <h1 className="text-lg font-display font-black uppercase tracking-wide truncate">
                        {title}
                      </h1>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full uppercase tracking-wide text-xs shrink-0"
                    onClick={() => setShowSignOutDialog(true)}
                  >
                    Sign Out
                  </Button>
                </div>
                {subtitle && (
                  <p className="text-xs text-muted-foreground">
                    {subtitle}
                  </p>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <UserCircle2 className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="leading-tight min-w-0">
                    <div className="font-semibold truncate">
                      {studentName.full_name}
                    </div>
                    <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Student Portal
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Desktop Layout - Horizontal */}
              <div className="hidden md:flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {onBack && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={clsx(
                        "rounded-full uppercase tracking-wide gap-2",
                        "bg-background/80 border-border/60",
                      )}
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
                      {subtitle && (
                        <p className="text-xs md:text-sm text-muted-foreground">
                          {subtitle}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <UserCircle2 className="h-6 w-6 text-muted-foreground" />
                    <div className="leading-tight">
                      <div className="font-semibold">
                        {studentName.full_name}
                      </div>
                      <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                        Student Portal
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
            </div>
          </header>
        )}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12">
          {children}
        </main>
      </div>

      {/* Sign Out Confirmation Dialog */}
      <AlertDialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-display uppercase tracking-wide">
              Sign Out
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out of the student portal? You'll need to sign in again to access your account.
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

export default PortalLayout;

