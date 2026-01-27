import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
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

const Navigation = () => {
  const { user, profile, role, signOut } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const logoPath = useBrandingSetting("logo_path");
  const [callbackDialogOpen, setCallbackDialogOpen] = useState(false);
  const [viewingDialogOpen, setViewingDialogOpen] = useState(false);

  const isHomePage = location.pathname === "/" || location.pathname.startsWith("/studios");
  const companyName = useBrandingSetting("company_name");
  const { data: navItems } = useNavigationItems("header");
  const logoUrl = logoPath || logo;

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
    ? "/portal/login"
    : isPortalUser
    ? "/portal"
    : "/admin";

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/studios", { replace: true });
  };

  const renderAccountMenu = (buttonClasses?: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          className={`font-medium text-xs gap-2 ${buttonClasses ?? ""}`}
        >
          <span className="hidden md:inline">{accountButtonLabel}</span>
          {user ? (
            <Avatar className="h-8 w-8 bg-primary/10 text-primary rounded-md">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold uppercase rounded-md">
                {initials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <ChevronDown className="h-4 w-4 opacity-80" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-2xl border border-border/60">
        {user ? (
          <>
            <DropdownMenuItem asChild>
              <Link to={dashboardHref} className="font-medium">
                {isPortalUser ? "Open Student Portal" : "Open Admin Console"}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to={isPortalUser ? "/portal" : dashboardHref}
                state={{ focus: "profile" }}
                className="font-medium"
              >
                Manage Profile
              </Link>
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
              <Link to="/portal/login" className="font-medium">
                Sign in
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/portal/login?mode=register" className="font-medium">
                Create account
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled ? "bg-black" : "bg-transparent"
    }`}>
      <nav className="container mx-auto px-4 py-3 md:py-4">
        <div className="flex items-center justify-between">
          <div className="hidden lg:flex items-center gap-6 flex-1">
            {navItems?.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target={item.opens_in_new_tab ? "_blank" : undefined}
                rel={item.opens_in_new_tab ? "noopener noreferrer" : undefined}
                className="text-sm font-medium text-white hover:bg-accent-yellow hover:text-black transition-colors px-3 py-2 rounded"
              >
                {item.title}
              </a>
            ))}
          </div>
          
          <a href="/" className="flex items-center lg:absolute lg:left-1/2 lg:transform lg:-translate-x-1/2">
            <img src={logoUrl} alt={companyName || "StudentStaySolutions"} className="h-8 md:h-12" />
          </a>

          <div className="hidden xl:flex items-center gap-2">
            {isHomePage ? (
              <>
                <Button 
                  variant="default" 
                  size="sm" 
                  className="font-medium text-xs"
                  onClick={() => setCallbackDialogOpen(true)}
                >
                  Get a Callback
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="font-medium text-xs bg-accent-yellow text-black hover:bg-accent-yellow/90 border-accent-yellow"
                  onClick={() => setViewingDialogOpen(true)}
                >
                  Book Viewing
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="default" size="sm" className="font-medium text-xs">
                  <Link to="/studios">Discover Our Studios</Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="font-medium text-xs bg-accent-yellow text-black hover:bg-accent-yellow/90 border-accent-yellow">
                  <Link to="/studios">Book Viewing</Link>
                </Button>
              </>
            )}
            {renderAccountMenu()}
          </div>

          <div className="flex xl:hidden items-center gap-2">
            {isHomePage ? (
              <Button 
                variant="default" 
                size="sm" 
                className="font-medium text-xs"
                onClick={() => setCallbackDialogOpen(true)}
              >
                Callback
              </Button>
            ) : (
              <Button asChild variant="default" size="sm" className="font-medium text-xs">
                <Link to="/studios">Discover</Link>
              </Button>
            )}
            {renderAccountMenu("px-3")}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-accent-yellow hover:text-black">
              <Menu className="h-5 w-5" />
            </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px] bg-background">
                <SheetHeader>
                  <SheetTitle className="text-left">Menu</SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-4 mt-6">
                  {navItems?.map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target={item.opens_in_new_tab ? "_blank" : undefined}
                      rel={item.opens_in_new_tab ? "noopener noreferrer" : undefined}
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-base font-medium hover:text-primary transition-colors py-2"
                    >
                      {item.title}
                    </a>
                  ))}
                  <div className="pt-2">
                    {isHomePage ? (
                      <Button 
                        size="sm" 
                        className="w-full font-medium text-xs bg-accent-yellow text-black hover:bg-accent-yellow/90"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setViewingDialogOpen(true);
                        }}
                      >
                        Book Viewing
                      </Button>
                    ) : (
                      <Button 
                        asChild 
                        size="sm" 
                        className="w-full font-medium text-xs bg-accent-yellow text-black hover:bg-accent-yellow/90"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <Link to="/studios">Book Viewing</Link>
                      </Button>
                    )}
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>
      <GetCallbackDialog open={callbackDialogOpen} onOpenChange={setCallbackDialogOpen} />
      <BookViewingDialog open={viewingDialogOpen} onOpenChange={setViewingDialogOpen} />
    </header>
  );
};

export default Navigation;
