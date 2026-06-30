import { useNavigate, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileSpreadsheet,
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
  Percent,
  Handshake,
  DollarSign,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Image,
  Upload,
  Wrench,
  Receipt,
  Search,
  Shield,
  Sparkles,
  AlertTriangle,
  MapPin,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandingSettings } from "@/hooks/useBranding";
import { useRoutePermissions } from "@/hooks/useRoutePermission";
import clsx from "clsx";
import { useState, useEffect, useRef, useMemo } from "react";
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
import { CommandPalette } from "./CommandPalette";
import { TitleWithTooltip } from "@/components/ui/title-with-tooltip";

export type NavItem = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type NavSection = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

export const navSections: NavSection[] = [
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
        label: "Booking Calendar",
        to: "/admin/booking-calendar",
        icon: Calendar,
      },
    ],
  },
  {
    label: "Operations",
    icon: Wrench,
    items: [
      {
        label: "Maintenance",
        to: "/maintenance",
        icon: Wrench,
      },
      {
        label: "Job Management",
        to: "/maintenance/job-management",
        icon: Users,
      },
      {
        label: "Out of Order",
        to: "/maintenance/out-of-order",
        icon: AlertTriangle,
      },
      {
        label: "Housekeeping",
        to: "/housekeeping",
        icon: Sparkles,
      },
      {
        label: "Housekeeping Roster",
        to: "/housekeeping/roster",
        icon: Calendar,
      },
      {
        label: "Communal Areas",
        to: "/housekeeping/communal-areas",
        icon: Sparkles,
      },
    ],
  },
  {
    label: "OTA",
    icon: Building2,
    items: [
      {
        label: "OTA Bookings",
        to: "/ota-bookings",
        icon: Calendar,
      },
      {
        label: "OTA Booking Chart",
        to: "/ota-bookings/booking-chart",
        icon: Calendar,
      },
      {
        label: "OTA Studio Allocation",
        to: "/ota-bookings/studio-allocation",
        icon: MapPin,
      },
      {
        label: "OTA Finance",
        to: "/ota-bookings/finance",
        icon: DollarSign,
      },
      {
        label: "OTA Payments",
        to: "/ota-bookings/payments",
        icon: CreditCard,
      },
      {
        label: "OTA Expenses",
        to: "/ota-bookings/expenses",
        icon: Receipt,
      },
      {
        label: "OTA Reports",
        to: "/ota-bookings/reports",
        icon: FileText,
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
        label: "Marketing Campaigns",
        to: "/admin/marketing-campaigns",
        icon: Send,
      },
      {
        label: "Cashback Campaigns",
        to: "/admin/cashback-campaigns",
        icon: Gift,
      },
      {
        label: "Discount Campaigns",
        to: "/admin/discount-campaigns",
        icon: Percent,
      },
    ],
  },
  {
    label: "Reports",
    icon: FileText,
    items: [
      {
        label: "Accounting Reports",
        to: "/admin/accounting-reports",
        icon: FileSpreadsheet,
      },
      {
        label: "Sales & Demographics",
        to: "/admin/sales-reports",
        icon: FileSpreadsheet,
      },
      {
        label: "Operational Reports",
        to: "/admin/reports",
        icon: FileText,
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
        label: "Permissions",
        to: "/admin/permissions",
        icon: Shield,
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
        label: "Secrets",
        to: "/admin/secrets",
        icon: Lock,
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
  /** Renders on the right of the inline page header row when hideDesktopHeader is true. */
  pageToolbar?: React.ReactNode;
  /** Hides the desktop sticky page header (e.g. dashboard provides its own). */
  hideDesktopHeader?: boolean;
};

const AdminLayout = ({
  children,
  pageTitle,
  subtitle,
  mobileActionButton,
  pageToolbar,
  hideDesktopHeader = false,
}: AdminLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut, loading } = useAuth();
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "Urban Hub";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [scrollProgress, setScrollProgress] = useState(0);
  const [canScroll, setCanScroll] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  // Get all route paths from nav sections
  const allRoutePaths = useMemo(() => {
    return navSections.flatMap((section) => section.items.map((item) => item.to));
  }, []);

  // Check permissions for all routes
  const { data: routePermissions = {}, isLoading: permissionsLoading } = useRoutePermissions(allRoutePaths);
  const { role } = useAuth();

  // Filter nav sections based on permissions
  const filteredNavSections = useMemo(() => {
    // If permissions are still loading and we have no cached data, show all routes (to avoid flickering)
    // But if we have cached data, use it immediately
    if (permissionsLoading && Object.keys(routePermissions).length === 0) {
      return navSections;
    }

    return navSections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          // Check permission for all routes including dashboard
          // Only show route if permission is explicitly true
          // Hide if false or undefined (no record yet)
          const hasPermission = routePermissions[item.to];
          return hasPermission === true;
        }),
      }))
      .filter((section) => section.items.length > 0); // Remove empty sections
  }, [routePermissions, permissionsLoading]);

  const handleSignOut = async () => {
    setShowSignOutDialog(false);
    await signOut();
    navigate("/admin/login", { replace: true });
  };

  const isActiveRoute = (path: string) => {
    // Paths that have sibling sub-routes in the nav: only active when exact match
    if (path === "/admin" || path === "/ota-bookings") {
      return location.pathname === path;
    }
    // For other routes, check if pathname starts with the route
    return location.pathname === path || location.pathname.startsWith(path + "/");
  };

  // Check if any child in a section is active
  const isSectionActive = (section: NavSection) => {
    return section.items.some((item) => isActiveRoute(item.to));
  };

    // Initialize open sections based on active routes
  useEffect(() => {
    const initialOpen: Record<string, boolean> = {};
    filteredNavSections.forEach((section) => {
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
  }, [location.pathname, filteredNavSections]);

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

  // Keyboard shortcut handler for command palette (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in an input, textarea, or contenteditable element
      const target = e.target as HTMLElement;
      const isInput = 
        target.tagName === "INPUT" || 
        target.tagName === "TEXTAREA" || 
        target.isContentEditable;
      
      // Only trigger if not in an input field (unless it's the search input itself)
      if (isInput && !target.closest('[cmdk-input-wrapper]')) {
        return;
      }

      // Check for Ctrl+K (Windows/Linux) or Cmd+K (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
          <Button
            variant="outline"
            className="w-full justify-start text-left text-muted-foreground mt-4 h-9"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <Search className="mr-2 h-4 w-4 shrink-0" />
            <span className="flex-1">Search pages...</span>
            <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
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
          {filteredNavSections.map((section) => {
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
            className="w-full flex justify-between items-center bg-black hover:bg-black/90 text-white hover:text-white border-0"
            onClick={() => setShowSignOutDialog(true)}
          >
            <span>Sign out</span>
            <ArrowUpRight className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      {/* Mobile Navigation */}
      <div className="lg:hidden">
        <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-20">
          <div className="px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <TitleWithTooltip
                  tooltip={subtitle}
                  tooltipLabel={`About ${pageTitle || "Admin Dashboard"}`}
                  titleClassName="text-lg font-display font-black uppercase tracking-wide truncate"
                >
                  {pageTitle || "Admin Dashboard"}
                </TitleWithTooltip>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {mobileActionButton}
              <Button
                variant="outline"
                size="sm"
                className="rounded-md uppercase tracking-wide gap-2 flex-shrink-0"
                onClick={() => setCommandPaletteOpen(true)}
              >
                <Search className="h-4 w-4" />
                <span className="hidden sm:inline">Search</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-md uppercase tracking-wide gap-2 flex-shrink-0"
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
              >
                <Menu className="h-4 w-4" />
                Menu
              </Button>
            </div>
          </div>
          {mobileNavOpen && (
            <nav className="px-4 py-4 border-t border-border space-y-1 bg-background max-h-[calc(100vh-80px)] overflow-y-auto">
              {filteredNavSections.map((section) => {
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
                  className="w-full rounded-md flex justify-between items-center bg-black hover:bg-black/90 text-white hover:text-white border-0"
                  onClick={() => setShowSignOutDialog(true)}
                >
                  <span>Sign out</span>
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </div>
            </nav>
          )}
        </header>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 w-full lg:ml-0 min-h-screen lg:overflow-y-auto">
        {!hideDesktopHeader && (
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
                    <TitleWithTooltip
                      tooltip={subtitle}
                      tooltipLabel={`About ${pageTitle ?? "Dashboard"}`}
                      titleClassName="text-2xl md:text-3xl font-display font-black uppercase tracking-wide"
                    >
                      {pageTitle ?? "Dashboard"}
                    </TitleWithTooltip>
                  </>
                )}
              </div>
            </div>
          </header>
        )}
        <main className="px-4 py-6 md:px-8 md:py-10">
          {hideDesktopHeader && pageTitle && (
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                {loading ? (
                  <>
                    <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-64 bg-muted animate-pulse rounded mt-2" />
                  </>
                ) : (
                  <>
                    <TitleWithTooltip
                      tooltip={subtitle}
                      tooltipLabel={`About ${pageTitle}`}
                      titleClassName="text-2xl md:text-3xl font-display font-black uppercase tracking-wide"
                    >
                      {pageTitle}
                    </TitleWithTooltip>
                  </>
                )}
              </div>
              {pageToolbar && (
                <div className="w-full md:w-auto md:shrink-0">{pageToolbar}</div>
              )}
            </div>
          )}
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette 
        open={commandPaletteOpen} 
        onOpenChange={setCommandPaletteOpen}
        routePermissions={routePermissions}
      />

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
            <AlertDialogCancel className="rounded-md uppercase tracking-wide">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSignOut}
              className="rounded-md uppercase tracking-wide bg-primary hover:bg-primary/90"
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


