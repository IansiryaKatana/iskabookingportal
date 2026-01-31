import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Inbox, HelpCircle, Building2, Sparkles, FileText, Search, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const links = [
  { to: "/admin/form-submissions", label: "Form Submissions", icon: Inbox, color: "text-blue-600" },
  { to: "/admin/faqs", label: "FAQs", icon: HelpCircle, color: "text-green-600" },
  { to: "/admin/amenities", label: "Amenities", icon: Building2, color: "text-amber-600" },
  { to: "/admin/why-us", label: "Why Us", icon: Sparkles, color: "text-purple-600" },
  { to: "/admin/blog", label: "Blog", icon: FileText, color: "text-slate-600" },
  { to: "/admin/seo", label: "SEO", icon: Search, color: "text-teal-600" },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, color: "text-indigo-600" },
];

export default function AdminDashboard() {
  const { data: newCount } = useQuery({
    queryKey: ["admin-form-submissions-new-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("website_form_submissions")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Manage website content and form submissions.</p>
      </div>
      {typeof newCount === "number" && newCount > 0 && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">New form submissions</CardTitle>
            <CardDescription>You have {newCount} unread submission{newCount !== 1 ? "s" : ""}.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/admin/form-submissions?status=new" className="text-sm font-medium text-primary hover:underline">
              View form submissions →
            </Link>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(({ to, label, icon: Icon, color }) => (
          <Link key={to} to={to}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
                <div className={color}>
                  <Icon className="h-8 w-8" />
                </div>
                <CardTitle className="text-base">{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>Manage {label.toLowerCase()}.</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
