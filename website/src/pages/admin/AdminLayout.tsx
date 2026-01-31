import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Inbox,
  HelpCircle,
  Sparkles,
  Building2,
  FileText,
  LogOut,
  Menu,
  X,
  ExternalLink,
  Search,
  BarChart3,
  Star,
  ImageIcon,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/form-submissions", label: "Form Submissions", icon: Inbox },
  { path: "/admin/faqs", label: "FAQs", icon: HelpCircle },
  { path: "/admin/amenities", label: "Amenities", icon: Building2 },
  { path: "/admin/why-us", label: "Why Us", icon: Sparkles },
  { path: "/admin/reviews", label: "Reviews", icon: Star },
  { path: "/admin/blog", label: "Blog", icon: FileText },
  { path: "/admin/media", label: "Media", icon: ImageIcon },
  { path: "/admin/newsletter", label: "Newsletter", icon: Mail },
  { path: "/admin/seo", label: "SEO", icon: Search },
  { path: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="h-screen overflow-hidden bg-muted/30 flex flex-col md:flex-row">
      {/* Sidebar - mobile: drawer; desktop: fixed height, no scroll */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-card border-r shadow-sm transform transition-transform duration-200 ease-out md:relative md:translate-x-0 md:flex-shrink-0 md:h-full",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full max-h-screen">
          <div className="flex items-center justify-between p-4 border-b md:justify-center flex-shrink-0">
            <span className="font-semibold text-lg">Website Admin</span>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto min-h-0">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = path === "/admin" ? location.pathname === "/admin" : location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t space-y-1 flex-shrink-0">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-5 w-5 shrink-0" />
              Back to site
            </a>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      </aside>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}
      {/* Main content - only this area scrolls */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header className="flex-shrink-0 z-20 flex items-center gap-4 border-b bg-background/95 backdrop-blur px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <span className="text-sm text-muted-foreground truncate">
            {profile?.email ?? user?.email ?? "—"}
          </span>
        </header>
        <main className="flex-1 min-h-0 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
