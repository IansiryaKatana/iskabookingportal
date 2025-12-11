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
  Send,
  Menu,
  CheckCircle2,
  Gift,
  Handshake,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Image,
  Upload,
  Wrench,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandingSettings } from "@/hooks/useBranding";
import clsx from "clsx";
import { useState, useEffect, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      {
        label: "Dashboard",
        to: "/admin",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "Academic",
    icon: Calendar,
    items: [
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
        label: "Studios",
        to: "/admin/studios",
        icon: Building2,
      },
    ],
  },
  {
    label: "Finance",
    icon: CreditCard,
    items: [
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
        label: "Manual Payment Entry",
        to: "/admin/manual-payment-entry",
        icon: FileText,
      },
      {
        label: "Payment History",
        to: "/admin/payment-history",
        icon: CreditCard,
      },
      {
        label: "Weekly Payments",
        to: "/admin/weekly-payment-report",
        icon: TrendingUp,
      },
      {
        label: "Fully Paid Students",
        to: "/admin/fully-paid-students",
        icon: CheckCircle2,
      },
      {
        label: "Financial Forecast",
        to: "/admin/financial-forecast",
        icon: TrendingUp,
      },
      {
        label: "Expenses",
        to: "/admin/expenses",
        icon: Receipt,
      },
      {
        label: "Refunds",
        to: "/admin/refunds",
        icon: CreditCard,
      },
    ],
  },
  {
    label: "Students",
    icon: Users,
    items: [
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
        label: "Maintenance",
        to: "/admin/maintenance",
        icon: Wrench,
      },
    ],
  },
  {
    label: "Partners",
    icon: Handshake,
    items: [
      {
        label: "Partners",
        to: "/admin/partners",
        icon: Handshake,
      },
      {
        label: "Partner Commissions",
        to: "/admin/partner-commissions",
        icon: DollarSign,
      },
    ],
  },
  {
    label: "Communications",
    icon: MessageSquare,
    items: [
      {
        label: "Bulk Messages",
        to: "/admin/bulk-messages",
        icon: MessageSquare,
      },
      {
        label: "Bulk Invitations",
        to: "/admin/bulk-invitations",
        icon: Send,
      },
      {
        label: "Targeted Messages",
        to: "/admin/targeted-messages",
        icon: Users,
      },
      {
        label: "Email Templates",
        to: "/admin/email-templates",
        icon: Mail,
      },
      {
        label: "Cashback Campaigns",
        to: "/admin/cashback-campaigns",
        icon: Gift,
      },
    ],
  },
  {
    label: "Reports",
    icon: FileText,
    items: [
      {
        label: "Reports",
        to: "/admin/reports",
        icon: FileText,
      },
      {
        label: "Accounting Reports",
        to: "/admin/accounting-reports",
        icon: FileSpreadsheet,
      },
      {
        label: "Booking Calendar",
        to: "/admin/booking-calendar",
        icon: Calendar,
      },
    ],
  },
  {
    label: "System",
    icon: Settings,
    items: [
      {
        label: "Users",
        to: "/admin/users",
        icon: UserCog,
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
      {
        label: "Branding",
        to: "/admin/branding",
        icon: Image,
      },
      {
        label: "DocuSign Templates",
        to: "/admin/docusign-templates",
        icon: FileText,
      },
      {
        label: "Data Import",
        to: "/admin/data-import",
        icon: Upload,
      },
    ],
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
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "StudentStaySolutions";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [scrollProgress, setScrollProgress] = useState(0);
  const [canScroll, setCanScroll] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  const handleSignOut = async () => {
    setShowSignOutDialog(false);
    await signOut();
    navigate("/admin/login", { replace: true });
  };

  const isActiveRoute = (path: string) => {
    if (path === "/admin") {
      // Dashboard should only be active when exactly on /admin
      return location.pathname === "/admin";
    }
    // For other routes, check if pathname starts with the route
    // But ensure it's not just matching /admin prefix
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  // Check if any child in a section is active
  const isSectionActive = (section: NavSection) => {
    return section.items.some((item) => isActiveRoute(item.to));
  };

  // Initialize open sections based on active routes
  useEffect(() => {
    const initialOpen: Record<string, boolean> = {};
    navSections.forEach((section) => {
      // Open section if it has an active child
      if (isSectionActive(section)) {
        initialOpen[section.label] = true;
      }
    });
    setOpenSections((prev) => {
      // Only update if there are new sections to open
      const hasChanges = Object.keys(initialOpen).some(
        (key) => initialOpen[key] !== prev[key]
      );
      return hasChanges ? { ...prev, ...initialOpen } : prev;
    });
  }, [location.pathname]);

  const toggleSection = (sectionLabel: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionLabel]: !prev[sectionLabel],
    }));
  };

  // Track scroll progress for navigation
  useEffect(() => {
    const navElement = navRef.current;
    if (!navElement) return;

    const updateScrollProgress = () => {
      const { scrollTop, scrollHeight, clientHeight } = navElement;
      const maxScroll = scrollHeight - clientHeight;
      
      if (maxScroll > 0) {
        setCanScroll(true);
        const progress = (scrollTop / maxScroll) * 100;
        setScrollProgress(progress);
      } else {
        setCanScroll(false);
        setScrollProgress(0);
      }
    };

    // Initial check
    updateScrollProgress();

    // Update on scroll
    navElement.addEventListener("scroll", updateScrollProgress);
    
    // Update when sections expand/collapse
    const resizeObserver = new ResizeObserver(updateScrollProgress);
    resizeObserver.observe(navElement);

    return () => {
      navElement.removeEventListener("scroll", updateScrollProgress);
      resizeObserver.disconnect();
    };
  }, [openSections]);

  return (
    <div className="min-h-screen bg-muted flex flex-col lg:flex-row">
      {/* Desktop Sidebar - Fixed height, only nav scrolls */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:h-screen lg:sticky lg:top-0 bg-background border-r border-border">
        {/* Sidebar Header - Fixed */}
        <div className="px-6 py-6 border-b border-border flex-shrink-0">
          <h1 className="text-2xl font-display font-bold uppercase tracking-wide">
            {companyName} Admin
          </h1>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Staff Console
          </p>
        </div>
        {/* Sidebar Nav - Scrollable if needed */}
        <div className="flex-1 relative min-h-0 flex flex-col">
          {/* Scroll Progress Indicator */}
          {canScroll && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-muted z-20">
              <div
                className="h-full bg-primary transition-all duration-150 ease-out"
                style={{ width: `${scrollProgress}%` }}
              />
            </div>
          )}
          {/* Gradient fade at top */}
          {canScroll && scrollProgress > 0 && (
            <div className="absolute top-0.5 left-0 right-0 h-8 bg-gradient-to-b from-background via-background/80 to-transparent pointer-events-none z-10" />
          )}
          {/* Gradient fade at bottom */}
          {canScroll && scrollProgress < 100 && (
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none z-10" />
          )}
          <nav
            ref={navRef}
            className="flex-1 overflow-y-auto px-4 py-6 space-y-1 min-h-0 scrollbar-hide"
          >
          {navSections.map((section) => {
            const SectionIcon = section.icon;
            const isActive = isSectionActive(section);
            const isOpen = openSections[section.label] ?? false;

            // Single item sections (no collapsible needed)
            if (section.items.length === 1) {
              const item = section.items[0];
              const ItemIcon = item.icon;
              const itemIsActive = isActiveRoute(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={clsx(
                    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                    itemIsActive
                      ? "bg-primary text-primary-foreground shadow-lg"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <ItemIcon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            }

            // Multi-item sections (collapsible)
            return (
              <Collapsible
                key={section.label}
                open={isOpen}
                onOpenChange={() => toggleSection(section.label)}
              >
                <CollapsibleTrigger
                  className={clsx(
                    "w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <SectionIcon className="h-4 w-4" />
                    <span>{section.label}</span>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 space-y-1 pl-4">
                  {section.items.map((item) => {
                    const ItemIcon = item.icon;
                    const itemIsActive = isActiveRoute(item.to);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        className={clsx(
                          "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                          itemIsActive
                            ? "bg-primary text-primary-foreground shadow-md"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <ItemIcon className="h-3.5 w-3.5" />
                        {item.label}
                      </NavLink>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          </nav>
        </div>
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
                <h1 className="text-lg font-display font-black uppercase tracking-wide truncate">
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
              {navSections.map((section) => {
                const SectionIcon = section.icon;
                const isActive = isSectionActive(section);
                const isOpen = openSections[section.label] ?? false;

                // Single item sections
                if (section.items.length === 1) {
                  const item = section.items[0];
                  const ItemIcon = item.icon;
                  const itemIsActive = isActiveRoute(item.to);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={clsx(
                        "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                        itemIsActive
                          ? "bg-primary text-primary-foreground shadow-lg"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      onClick={() => setMobileNavOpen(false)}
                    >
                      <ItemIcon className="h-5 w-5" />
                      {item.label}
                    </NavLink>
                  );
                }

                // Multi-item sections
                return (
                  <Collapsible
                    key={section.label}
                    open={isOpen}
                    onOpenChange={() => toggleSection(section.label)}
                  >
                    <CollapsibleTrigger
                      className={clsx(
                        "w-full flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all",
                        isActive
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <SectionIcon className="h-5 w-5" />
                        <span>{section.label}</span>
                      </div>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1 space-y-1 pl-4">
                      {section.items.map((item) => {
                        const ItemIcon = item.icon;
                        const itemIsActive = isActiveRoute(item.to);
                        return (
                          <NavLink
                            key={item.to}
                            to={item.to}
                            className={clsx(
                              "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all",
                              itemIsActive
                                ? "bg-primary text-primary-foreground shadow-md"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                            onClick={() => setMobileNavOpen(false)}
                          >
                            <ItemIcon className="h-4 w-4" />
                            {item.label}
                          </NavLink>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
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
                  <h2 className="text-2xl md:text-3xl font-display font-black uppercase tracking-wide">
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

