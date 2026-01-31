import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, Menu, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandingSetting, useNavigationItems } from "@/hooks/useBranding";
import logo from "@/assets/urban-hub-logo.webp";
import { GetCallbackDialog } from "./leads/GetCallbackDialog";
import { BookViewingDialog } from "./leads/BookViewingDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { portalLoginUrl, portalRegisterUrl, portalDashboardUrl, portalAdminUrl } from "@/config";

const Navigation = () => {
  const { user, profile, role, signOut } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const logoPath = useBrandingSetting("logo_path");
  const [callbackDialogOpen, setCallbackDialogOpen] = useState(false);
  const [viewingDialogOpen, setViewingDialogOpen] = useState(false);

  const isHomePage = location.pathname === "/" || location.pathname.startsWith("/studios");
  const isContactOrFAQ = location.pathname === "/contact" || location.pathname === "/faq";
  const topLevelReserved = ["studios", "contact", "faq", "blog", "about", "short-term", "reviews", "privacy", "terms", "admin"];
  const pathSegment = location.pathname.replace(/^\/|\/$/g, "").split("/")[0];
  const isBlogPage = location.pathname === "/blog" || (pathSegment && !topLevelReserved.includes(pathSegment) && location.pathname.match(/^\/[^/]+$/));
  const isAboutPage = location.pathname === "/about";
  const isShortTermPage = location.pathname === "/short-term";
  const companyName = useBrandingSetting("company_name");
  const { data: dbNavItems } = useNavigationItems("header");
  const logoUrl = logoPath || logo;

  // Hardcoded navigation items based on pages built
  const navItems = [
    { id: "home", title: "Home", url: "/", display_order: 1, is_active: true, location: "header" as const, opens_in_new_tab: false },
    { id: "about", title: "About", url: "/about", display_order: 2, is_active: true, location: "header" as const, opens_in_new_tab: false },
    { id: "blog", title: "Blog", url: "/blog", display_order: 3, is_active: true, location: "header" as const, opens_in_new_tab: false },
    { id: "shortterm", title: "Short Term", url: "/short-term", display_order: 4, is_active: true, location: "header" as const, opens_in_new_tab: false },
    { id: "reviews", title: "Reviews", url: "/reviews", display_order: 5, is_active: true, location: "header" as const, opens_in_new_tab: false },
    { id: "faq", title: "FAQ", url: "/faq", display_order: 6, is_active: true, location: "header" as const, opens_in_new_tab: false },
    { id: "contact", title: "Contact Us", url: "/contact", display_order: 7, is_active: true, location: "header" as const, opens_in_new_tab: false },
  ];

  const initials = (() => {
    const first = profile?.first_name?.[0];
    const last = profile?.last_name?.[0];
    if (first || last) {
      return `${first ?? ""}${last ?? ""}`.toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "UH";
  })();

  const isPortalUser = Boolean(user) && (role === "student" || role === "superadmin");
  const isStaffOnly = Boolean(user) && role === "staff";

  const accountButtonLabel = user ? "Account" : "Portal";
  const dashboardHref = !user
    ? portalLoginUrl()
    : isPortalUser
    ? portalDashboardUrl()
    : portalAdminUrl();

  useEffect(() => {
    let ticking = false;
    
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          setIsScrolled(currentScrollY > 0);
          
          // Show header when scrolling up, hide when scrolling down
          if (currentScrollY < lastScrollY) {
            // Scrolling up
            setIsVisible(true);
          } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
            // Scrolling down and past 100px
            setIsVisible(false);
          }
          
          // Always show at top of page
          if (currentScrollY < 10) {
            setIsVisible(true);
          }
          
          setLastScrollY(currentScrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/studios", { replace: true });
  };

  const renderAccountMenu = (buttonClasses?: string) => {
    const isMobileNav = buttonClasses === "px-3";
    return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={isMobileNav ? "icon" : "sm"}
          className={cn(
            "font-medium text-xs gap-2 text-white hover:bg-accent-yellow hover:text-black focus-visible:ring-accent-yellow/50",
            isMobileNav
              ? "h-9 w-9 min-h-9 min-w-9 rounded-full border border-white/25 hover:border-accent-yellow/60 p-0 shrink-0"
              : "rounded-md xl:rounded-md",
            buttonClasses ?? ""
          )}
        >
          {!isMobileNav && <span className="hidden xl:inline">{accountButtonLabel}</span>}
          {user ? (
            <Avatar className={cn(
              "shrink-0 rounded-full",
              isMobileNav ? "h-8 w-8 bg-white/20 text-white" : "h-8 w-8 bg-primary/10 text-primary rounded-md"
            )}>
              <AvatarFallback className={cn(
                "text-xs font-semibold uppercase rounded-full",
                isMobileNav ? "bg-white/20 text-white" : "bg-primary/10 text-primary rounded-md"
              )}>
                {initials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <ChevronDown className="h-4 w-4 opacity-80 shrink-0" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-2xl border border-border/60">
        {user ? (
          <>
            <DropdownMenuItem asChild>
              <a href={dashboardHref} className="font-medium" target="_blank" rel="noopener noreferrer">
                {isPortalUser ? "Open Student Portal" : "Open Admin Console"}
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={dashboardHref}
                className="font-medium"
                target="_blank"
                rel="noopener noreferrer"
              >
                Manage Profile
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                void handleSignOut();
              }}
              className="text-destructive focus:text-destructive"
            >
              Sign out
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <a href={portalLoginUrl()} className="font-medium" target="_blank" rel="noopener noreferrer">
                Sign in
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={portalRegisterUrl()} className="font-medium" target="_blank" rel="noopener noreferrer">
                Create account
              </a>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    );
  };

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 pointer-events-none transition-transform duration-300 ${
        isVisible ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <nav className={isShortTermPage ? "w-full pt-3 md:pt-5 px-0 md:px-[100px]" : `container mx-auto px-2 md:px-4 ${isContactOrFAQ || isBlogPage ? "pt-4 md:pt-6" : "pt-3 md:pt-5"}`}>
        {isContactOrFAQ || isBlogPage ? (
          <div
            className={`pointer-events-auto flex items-center justify-between px-2 md:px-6 py-2 md:py-3 transition-all duration-300 ${
              (isScrolled || isBlogPage) && isVisible
                ? "bg-black rounded-xl shadow-lg backdrop-blur-md" 
                : "bg-transparent"
            }`}
          >
            {/* Logo on left */}
            <Link to="/" className="flex items-center" data-analytics="logo">
              <img src={logoUrl} alt={companyName || "StudentStaySolutions"} className="h-6 md:h-8" />
            </Link>

            {/* Nav items in center */}
            <div className="hidden lg:flex items-center gap-3 flex-1 justify-center">
              {navItems.map((item) => {
                const isActive = location.pathname === item.url || (item.url === "/" && (location.pathname === "/" || location.pathname.startsWith("/studios")));
                return (
                  <Link
                    key={item.id}
                    to={item.url}
                    className={`text-sm font-medium px-4 py-2 rounded-full transition-all duration-200 ${
                      isActive
                        ? "bg-[#1a1a1a] text-accent-yellow shadow-md"
                        : isBlogPage
                        ? "text-white hover:bg-white/10 hover:text-accent-yellow"
                        : "text-white hover:bg-white/10 hover:text-accent-yellow"
                    }`}
                  >
                    {item.title}
                  </Link>
                );
              })}
            </div>

            {/* Button on right */}
            <div className="hidden xl:flex items-center gap-2">
              <Button 
                variant="default" 
                size="sm" 
                className="font-medium text-xs"
                onClick={() => setCallbackDialogOpen(true)}
                data-analytics="nav-callback"
              >
                Get a Callback
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="font-medium text-xs bg-accent-yellow text-black hover:bg-accent-yellow/90 border-accent-yellow"
                onClick={() => setViewingDialogOpen(true)}
                data-analytics="nav-book-viewing"
              >
                Book Viewing
              </Button>
              {renderAccountMenu()}
            </div>

            {/* Mobile menu */}
            <div className="flex xl:hidden items-center gap-2">
              <Button 
                variant="default" 
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full md:h-10 md:w-10"
                onClick={() => setCallbackDialogOpen(true)}
                aria-label="Get a callback"
                data-analytics="nav-callback"
              >
                <Phone className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
              {renderAccountMenu("px-3")}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-accent-yellow hover:text-black" data-analytics="nav-menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:w-[380px] bg-white p-0">
                  <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
                      <SheetTitle className="text-xl font-display font-black uppercase tracking-wide text-gray-900 m-0">
                        Menu
                      </SheetTitle>
                    </div>

                    {/* Navigation Links */}
                    <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                      {navItems.map((item) => {
                        const isActive = location.pathname === item.url || (item.url === "/" && (location.pathname === "/" || location.pathname.startsWith("/studios")));
                        return (
                          <Link
                            key={item.id}
                            to={item.url}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`block text-base font-semibold px-4 py-3.5 rounded-xl transition-all duration-200 ${
                              isActive
                                ? "bg-[#1a1a1a] text-accent-yellow shadow-sm"
                                : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                            }`}
                          >
                            {item.title}
                          </Link>
                        );
                      })}
                    </nav>

                    {/* Action Buttons Section */}
                    <div className="border-t border-gray-200 px-4 py-5 space-y-3 bg-gray-50">
                      <Button 
                        size="lg" 
                        className="w-full font-semibold text-sm rounded-xl h-12"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setCallbackDialogOpen(true);
                        }}
                        data-analytics="nav-callback"
                      >
                        Get a Callback
                      </Button>
                      <Button 
                        size="lg" 
                        variant="outline"
                        className="w-full font-semibold text-sm bg-accent-yellow text-black hover:bg-accent-yellow/90 border-accent-yellow rounded-xl h-12"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setViewingDialogOpen(true);
                        }}
                        data-analytics="nav-book-viewing"
                      >
                        Book Viewing
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        ) : (
          <div
            className={`pointer-events-auto flex items-center justify-between px-2 md:px-6 py-2 md:py-3 transition-all duration-300 ${
              ((isScrolled || isBlogPage) && isVisible)
                ? "bg-black rounded-xl shadow-lg backdrop-blur-md" 
                : (isAboutPage && isVisible)
                ? "bg-black/60 rounded-xl shadow-lg backdrop-blur-md"
                : "bg-transparent"
            }`}
          >
            {/* Logo on left */}
            <Link to="/" className="flex items-center" data-analytics="logo">
              <img src={logoUrl} alt={companyName || "StudentStaySolutions"} className="h-6 md:h-8" />
            </Link>

            {/* Nav items in center */}
            <div className="hidden lg:flex items-center gap-3 flex-1 justify-center">
              {navItems.map((item) => {
                const isActive = location.pathname === item.url || (item.url === "/" && (location.pathname === "/" || location.pathname.startsWith("/studios")));
                return (
                  <Link
                    key={item.id}
                    to={item.url}
                    className={`text-sm font-medium px-4 py-2 rounded-full transition-all duration-200 ${
                      isActive
                        ? "bg-[#1a1a1a] text-accent-yellow shadow-md"
                        : "text-white hover:bg-white/10 hover:text-accent-yellow"
                    }`}
                  >
                    {item.title}
                  </Link>
                );
              })}
            </div>

            {/* Buttons on right */}
            <div className="hidden xl:flex items-center gap-2">
              {isHomePage ? (
                <>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="font-medium text-xs"
                    onClick={() => setCallbackDialogOpen(true)}
                    data-analytics="nav-callback"
                  >
                    Get a Callback
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="font-medium text-xs bg-accent-yellow text-black hover:bg-accent-yellow/90 border-accent-yellow"
                    onClick={() => setViewingDialogOpen(true)}
                    data-analytics="nav-book-viewing"
                  >
                    Book Viewing
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="font-medium text-xs"
                    onClick={() => setCallbackDialogOpen(true)}
                    data-analytics="nav-callback"
                  >
                    Get a Callback
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="font-medium text-xs bg-accent-yellow text-black hover:bg-accent-yellow/90 border-accent-yellow"
                    onClick={() => setViewingDialogOpen(true)}
                    data-analytics="nav-book-viewing"
                  >
                    Book Viewing
                  </Button>
                </>
              )}
              {renderAccountMenu()}
            </div>

            {/* Mobile menu */}
            <div className="flex xl:hidden items-center gap-2">
              <Button 
                variant="default" 
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full md:h-10 md:w-10"
                onClick={() => setCallbackDialogOpen(true)}
                aria-label="Get a callback"
                data-analytics="nav-callback"
              >
                <Phone className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
              {renderAccountMenu("px-3")}
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-white hover:bg-accent-yellow hover:text-black" data-analytics="nav-menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:w-[380px] bg-white p-0">
                  <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
                      <SheetTitle className="text-xl font-display font-black uppercase tracking-wide text-gray-900 m-0">
                        Menu
                      </SheetTitle>
                    </div>

                    {/* Navigation Links */}
                    <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                      {navItems.map((item) => {
                        const isActive = location.pathname === item.url || (item.url === "/" && (location.pathname === "/" || location.pathname.startsWith("/studios")));
                        return (
                          <Link
                            key={item.id}
                            to={item.url}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`block text-base font-semibold px-4 py-3.5 rounded-xl transition-all duration-200 ${
                              isActive
                                ? "bg-[#1a1a1a] text-accent-yellow shadow-sm"
                                : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                            }`}
                          >
                            {item.title}
                          </Link>
                        );
                      })}
                    </nav>

                    {/* Action Buttons Section */}
                    <div className="border-t border-gray-200 px-4 py-5 space-y-3 bg-gray-50">
                      <Button 
                        size="lg" 
                        className="w-full font-semibold text-sm rounded-xl h-12"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setCallbackDialogOpen(true);
                        }}
                        data-analytics="nav-callback"
                      >
                        Get a Callback
                      </Button>
                      <Button 
                        size="lg" 
                        variant="outline"
                        className="w-full font-semibold text-sm bg-accent-yellow text-black hover:bg-accent-yellow/90 border-accent-yellow rounded-xl h-12"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setViewingDialogOpen(true);
                        }}
                        data-analytics="nav-book-viewing"
                      >
                        Book Viewing
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        )}
      </nav>
      <GetCallbackDialog open={callbackDialogOpen} onOpenChange={setCallbackDialogOpen} />
      <BookViewingDialog open={viewingDialogOpen} onOpenChange={setViewingDialogOpen} />
    </header>
  );
};

export default Navigation;
