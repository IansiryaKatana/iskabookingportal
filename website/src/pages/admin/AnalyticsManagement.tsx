import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Pencil,
  Plus,
  Trash2,
  BarChart3,
  MousePointer,
  Eye,
  Inbox,
  Settings,
  FileText,
  Zap,
  Users,
  Clock,
  ExternalLink,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { PieChart, Pie, Cell, Legend } from "recharts";
import { useAnalyticsData, formatSessionDuration } from "@/hooks/useAnalyticsData";

type AnalyticsSettingsRow = {
  id: string;
  google_analytics_id: string | null;
  google_tag_manager_id: string | null;
  is_active: boolean;
};

type TagRow = {
  id: string;
  tag_name: string;
  element_selector: string;
  event_name: string;
  category: string | null;
  is_active: boolean;
};

type EventRow = {
  id: string;
  event_name: string;
  element_id: string | null;
  element_text: string | null;
  page_path: string;
  created_at: string;
};

type PageViewRow = {
  id: string;
  page_path: string;
  session_id: string | null;
  created_at: string;
};

export default function AnalyticsManagement() {
  const queryClient = useQueryClient();
  const [tagEditId, setTagEditId] = useState<string | null>(null);
  const [tagCreateOpen, setTagCreateOpen] = useState(false);
  const [eventsPageFilter, setEventsPageFilter] = useState("");
  const [viewsPageFilter, setViewsPageFilter] = useState("");

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["admin-website-analytics-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_analytics_settings")
        .select("id, google_analytics_id, google_tag_manager_id, is_active")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as AnalyticsSettingsRow | null;
    },
  });

  const { data: tags, isLoading: tagsLoading } = useQuery({
    queryKey: ["admin-website-analytics-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_analytics_tags")
        .select("id, tag_name, element_selector, event_name, category, is_active")
        .order("tag_name");
      if (error) throw error;
      return (data || []) as TagRow[];
    },
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["admin-website-analytics-events", eventsPageFilter],
    queryFn: async () => {
      let q = supabase
        .from("website_analytics_events")
        .select("id, event_name, element_id, element_text, page_path, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (eventsPageFilter) q = q.eq("page_path", eventsPageFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as EventRow[];
    },
  });

  const { data: pageViews, isLoading: viewsLoading } = useQuery({
    queryKey: ["admin-website-analytics-page-views", viewsPageFilter],
    queryFn: async () => {
      let q = supabase
        .from("website_analytics_page_views")
        .select("id, page_path, session_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (viewsPageFilter) q = q.eq("page_path", viewsPageFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as PageViewRow[];
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (payload: Partial<AnalyticsSettingsRow>) => {
      const id = settings?.id;
      if (id) {
        const { error } = await supabase.from("website_analytics_settings").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("website_analytics_settings").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-analytics-settings"] });
      toast.success("Analytics settings saved.");
    },
    onError: () => toast.error("Failed to save."),
  });

  const createTagMutation = useMutation({
    mutationFn: async (payload: { tag_name: string; element_selector: string; event_name: string; category?: string; is_active: boolean }) => {
      const { error } = await supabase.from("website_analytics_tags").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-analytics-tags"] });
      toast.success("Tracked element added.");
      setTagCreateOpen(false);
    },
    onError: () => toast.error("Failed to add."),
  });

  const updateTagMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<TagRow> }) => {
      const { error } = await supabase.from("website_analytics_tags").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-analytics-tags"] });
      toast.success("Tracked element updated.");
      setTagEditId(null);
    },
    onError: () => toast.error("Failed to update."),
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("website_analytics_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-website-analytics-tags"] });
      toast.success("Tracked element removed.");
      setTagEditId(null);
    },
    onError: () => toast.error("Failed to delete."),
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("website_analytics_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-website-analytics-events"] }),
    onError: () => toast.error("Failed to delete."),
  });

  const editingTag = tags?.find((t) => t.id === tagEditId);

  const { data: analyticsData, isLoading: analyticsLoading } = useAnalyticsData();
  const { data: seoPages } = useQuery({
    queryKey: ["seo-pages-all"],
    queryFn: async () => {
      const { data } = await supabase.from("seo_pages").select("page_path, meta_title");
      return (data || []) as { page_path: string; meta_title: string | null }[];
    },
  });
  const pageTitleMap = new Map((seoPages || []).map((p) => [p.page_path, p.meta_title]));
  const getPageTitle = (path: string) =>
    pageTitleMap.get(path) || pageTitleMap.get(path === "/" ? "/studios" : path) || path || "/";

  return (
    <div className="space-y-6 bg-muted/30 -mx-4 -mt-4 px-4 pt-4 pb-8 md:-mx-6 md:-mt-6 md:px-6 md:pt-6 rounded-lg">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Traffic, content performance, speed metrics and analytics settings.</p>
      </div>

      <Tabs defaultValue="traffic" className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4 h-11 bg-muted/50">
          <TabsTrigger value="traffic" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BarChart3 className="h-4 w-4" />
            Traffic
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileText className="h-4 w-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="speed" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Zap className="h-4 w-4" />
            Speed
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Traffic tab */}
        <TabsContent value="traffic" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Find out how your audience is growing</CardTitle>
                <p className="text-sm text-muted-foreground">Track your site&apos;s traffic over time</p>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="flex h-[240px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : analyticsData ? (
                  <>
                    <div className="flex items-baseline gap-2 mb-4">
                      <span className="text-3xl font-bold">{analyticsData.allVisitors.toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground">All Visitors</span>
                      {analyticsData.pctChange !== 0 && (
                        <span
                          className={`flex items-center gap-0.5 text-sm font-medium ${
                            analyticsData.pctChange >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {analyticsData.pctChange >= 0 ? (
                            <ArrowUp className="h-4 w-4" />
                          ) : (
                            <ArrowDown className="h-4 w-4" />
                          )}
                          {Math.abs(analyticsData.pctChange).toFixed(1)}% compared to the previous 28 days
                        </span>
                      )}
                    </div>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analyticsData.dailyData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={{ fontSize: 12 }} />
                          <Line type="monotone" dataKey="visitors" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ) : (
                  <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white shadow-sm">
              <CardHeader>
                <div className="flex gap-2">
                  {["Channels", "Locations", "Devices"].map((tab, i) => (
                    <Button
                      key={tab}
                      variant={tab === "Devices" ? "default" : "ghost"}
                      size="sm"
                      className={tab === "Devices" ? "" : "text-muted-foreground"}
                    >
                      {tab}
                    </Button>
                  ))}
                </div>
                <CardTitle className="text-base mt-4">By Devices</CardTitle>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="flex h-[200px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : analyticsData?.deviceData?.length ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-[180px] w-full max-w-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={analyticsData.deviceData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                            label={({ name, value }) => `${value}%`}
                          >
                            {analyticsData.deviceData.map((_, i) => (
                              <Cell
                                key={i}
                                fill={["#f97316", "#a855f7", "#3b82f6", "#ec4899"][i % 4]}
                              />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => `${v}%`} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      Source: Analytics
                      <ExternalLink className="h-3 w-3" />
                    </p>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No device data yet</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Search traffic over the last 28 days</CardTitle>
              <p className="text-sm text-muted-foreground">Connect Google Search Console for search impressions and clicks</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                <div>
                  <p className="text-2xl font-bold">—</p>
                  <p className="text-sm text-muted-foreground">Total Impressions</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">—</p>
                  <p className="text-sm text-muted-foreground">Total Clicks</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">—</p>
                  <p className="text-sm text-muted-foreground">Unique Visitors from Search</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">—</p>
                  <p className="text-sm text-muted-foreground">Conversions</p>
                </div>
              </div>
              <a
                href="https://search.google.com/search-console"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Connect Search Console
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Content tab */}
        <TabsContent value="content" className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Understand how different visitor groups interact with your site</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">New visitors</CardTitle>
                <p className="text-sm text-muted-foreground">Single-page sessions</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {analyticsData && (
                  <>
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <span className="text-2xl font-bold">{analyticsData.newVisitors.toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground">Visitors</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm">1 Visits per visitor</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm">1 Pages per visit</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Eye className="h-5 w-5 text-muted-foreground" />
                      <span className="text-2xl font-bold">{analyticsData.newPageviews.toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground">
                        {analyticsData.totalPageviews > 0
                          ? ((analyticsData.newPageviews / analyticsData.totalPageviews) * 100).toFixed(1)
                          : 0}
                        % of total pageviews
                      </span>
                    </div>
                  </>
                )}
                {!analyticsData && !analyticsLoading && (
                  <p className="text-sm text-muted-foreground py-4">No data yet</p>
                )}
              </CardContent>
            </Card>
            <Card className="bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Returning visitors</CardTitle>
                <p className="text-sm text-muted-foreground">Multi-page sessions</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {analyticsData && (
                  <>
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <span className="text-2xl font-bold">{analyticsData.returningVisitors.toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground">Visitors</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm">
                        {analyticsData.returningVisitors > 0
                          ? (analyticsData.returningPageviews / analyticsData.returningVisitors).toFixed(1)
                          : 0}{" "}
                        Visits per visitor
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm">
                        {analyticsData.returningVisitors > 0
                          ? (analyticsData.returningPageviews / analyticsData.returningVisitors).toFixed(2)
                          : 0}{" "}
                        Pages per visit
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Eye className="h-5 w-5 text-muted-foreground" />
                      <span className="text-2xl font-bold">{analyticsData.returningPageviews.toLocaleString()}</span>
                      <span className="text-sm text-muted-foreground">
                        {analyticsData.totalPageviews > 0
                          ? ((analyticsData.returningPageviews / analyticsData.totalPageviews) * 100).toFixed(1)
                          : 0}
                        % of total pageviews
                      </span>
                    </div>
                  </>
                )}
                {!analyticsData && !analyticsLoading && (
                  <p className="text-sm text-muted-foreground py-4">No data yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Top content over the last 28 days</CardTitle>
              <p className="text-sm text-muted-foreground">Most viewed pages by pageviews and sessions</p>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : analyticsData?.topContent?.length ? (
                <div className="overflow-x-auto -mx-6 px-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead className="text-right">Pageviews</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                        <TableHead className="text-right">Engagement Rate</TableHead>
                        <TableHead className="text-right">Session Duration</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analyticsData.topContent.map((row, i) => (
                        <TableRow key={row.page_path}>
                          <TableCell>
                            <div>
                              <p className="font-medium">
                                {i + 1}. {getPageTitle(row.page_path)}
                              </p>
                              <p className="text-xs text-muted-foreground">{row.page_path || "/"}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{row.pageviews.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{row.sessions.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono">{row.engagementRate}%</TableCell>
                          <TableCell className="text-right font-mono">{formatSessionDuration(row.avgDurationMs)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground text-sm">No content data yet</p>
              )}
              <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
                Source: Analytics
                <ExternalLink className="h-3 w-3" />
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Top search queries for your site</CardTitle>
              <p className="text-sm text-muted-foreground">Keep track of your most popular pages and how people found them from Search</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground py-4">Connect Google Search Console to see search queries, clicks and impressions.</p>
              <a
                href="https://search.google.com/search-console"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                Connect Search Console
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Speed tab */}
        <TabsContent value="speed" className="space-y-6">
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Find out how visitors experience your site</CardTitle>
              <p className="text-sm text-muted-foreground">Keep track of how fast your pages are and get specific recommendations on what to improve</p>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-6">
                <Button variant="default" size="sm">
                  In the Lab
                </Button>
                <Button variant="outline" size="sm">
                  In the Field
                </Button>
                <Button variant="outline" size="sm">
                  How to improve
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Field data shows how real users actually loaded and interacted with your page over time.
              </p>
              <div className="space-y-6">
                <div className="flex items-center justify-between py-4 border-b">
                  <div>
                    <p className="font-semibold">Largest Contentful Paint (LCP)</p>
                    <p className="text-sm text-muted-foreground">Time it takes for the page to load</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-amber-600">—</p>
                    <p className="text-sm text-amber-600">Check PageSpeed Insights</p>
                  </div>
                </div>
                <div className="flex items-center justify-between py-4 border-b">
                  <div>
                    <p className="font-semibold">Cumulative Layout Shift (CLS)</p>
                    <p className="text-sm text-muted-foreground">How stable the elements on the page are</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">—</p>
                    <p className="text-sm text-muted-foreground">Check PageSpeed Insights</p>
                  </div>
                </div>
                <div className="flex items-center justify-between py-4 border-b">
                  <div>
                    <p className="font-semibold">Interaction to Next Paint (INP)</p>
                    <p className="text-sm text-muted-foreground">How quickly your page responds when people interact with it</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">—</p>
                    <p className="text-sm text-muted-foreground">Check PageSpeed Insights</p>
                  </div>
                </div>
              </div>
              <a
                href="https://pagespeed.web.dev/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1 mt-4"
              >
                View details at PageSpeed Insights
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings tab - all existing functionality */}
        <TabsContent value="settings" className="space-y-6">
        <Tabs defaultValue="ga" className="space-y-4">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="ga" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Google Analytics
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-2">
            <MousePointer className="h-4 w-4" />
            Tracked elements
          </TabsTrigger>
          <TabsTrigger value="events" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Events
          </TabsTrigger>
          <TabsTrigger value="views" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Page views
          </TabsTrigger>
          <TabsTrigger value="submissions" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Submissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ga" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Google Analytics & GTM</CardTitle>
              <p className="text-sm text-muted-foreground">Add your GA4 Measurement ID (e.g. G-XXXXXXXX) or Google Tag Manager ID. Script is injected on the website when enabled.</p>
            </CardHeader>
            <CardContent>
              {settingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <GaSettingsForm
                  initial={settings}
                  onSubmit={(payload) => updateSettingsMutation.mutate(payload)}
                  isLoading={updateSettingsMutation.isPending}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tags" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Define elements to track (e.g. buttons, links). Clicks are recorded as events.</p>
            <Button onClick={() => setTagCreateOpen(true)} className="w-fit">
              <Plus className="h-4 w-4 mr-2" />
              Add tracked element
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tracked elements</CardTitle>
            </CardHeader>
            <CardContent>
              {tagsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !tags?.length ? (
                <p className="py-8 text-center text-muted-foreground">No tracked elements. Add one to start recording clicks.</p>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tag name</TableHead>
                        <TableHead>Selector</TableHead>
                        <TableHead>Event name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tags.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.tag_name}</TableCell>
                          <TableCell className="font-mono text-xs max-w-[160px] truncate">{row.element_selector}</TableCell>
                          <TableCell>{row.event_name}</TableCell>
                          <TableCell>{row.category ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant={row.is_active ? "default" : "secondary"}>{row.is_active ? "Yes" : "No"}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => setTagEditId(row.id)} aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteTagMutation.mutate(row.id)} disabled={deleteTagMutation.isPending} aria-label="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Label className="w-fit">Filter by page</Label>
            <Select value={eventsPageFilter || "__all__"} onValueChange={(v) => setEventsPageFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue placeholder="All pages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All pages</SelectItem>
                <SelectItem value="/">/</SelectItem>
                <SelectItem value="/studios">/studios</SelectItem>
                <SelectItem value="/contact">/contact</SelectItem>
                <SelectItem value="/faq">/faq</SelectItem>
                <SelectItem value="/blog">/blog</SelectItem>
                <SelectItem value="/about">/about</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Click & custom events (last 500)</CardTitle>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !events?.length ? (
                <p className="py-8 text-center text-muted-foreground">No events yet.</p>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6 max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Page</TableHead>
                        <TableHead>Element</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{format(new Date(row.created_at), "MMM d, HH:mm")}</TableCell>
                          <TableCell>{row.event_name}</TableCell>
                          <TableCell className="font-mono text-xs">{row.page_path}</TableCell>
                          <TableCell className="max-w-[120px] truncate">{row.element_text || row.element_id || "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteEventMutation.mutate(row.id)} disabled={deleteEventMutation.isPending} aria-label="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="views" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Label className="w-fit">Filter by page</Label>
            <Select value={viewsPageFilter || "__all__"} onValueChange={(v) => setViewsPageFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue placeholder="All pages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All pages</SelectItem>
                <SelectItem value="/">/</SelectItem>
                <SelectItem value="/studios">/studios</SelectItem>
                <SelectItem value="/contact">/contact</SelectItem>
                <SelectItem value="/faq">/faq</SelectItem>
                <SelectItem value="/blog">/blog</SelectItem>
                <SelectItem value="/about">/about</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Page views (last 500)</CardTitle>
            </CardHeader>
            <CardContent>
              {viewsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !pageViews?.length ? (
                <p className="py-8 text-center text-muted-foreground">No page views yet.</p>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6 max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Page path</TableHead>
                        <TableHead>Session</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageViews.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{format(new Date(row.created_at), "MMM d, HH:mm")}</TableCell>
                          <TableCell className="font-mono text-xs">{row.page_path}</TableCell>
                          <TableCell className="text-muted-foreground truncate max-w-[120px]">{row.session_id ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Form submissions</CardTitle>
              <p className="text-sm text-muted-foreground">View and manage all form submissions (contact, callback, viewing, etc.).</p>
            </CardHeader>
            <CardContent>
              <Link to="/admin/form-submissions">
                <Button variant="outline">Open form submissions</Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
        </Tabs>
        </TabsContent>
      </Tabs>

      <Dialog open={!!tagEditId} onOpenChange={(open) => !open && setTagEditId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit tracked element</DialogTitle>
          </DialogHeader>
          {editingTag && (
            <TagForm
              initial={editingTag}
              onSubmit={(payload) => updateTagMutation.mutate({ id: editingTag.id, payload })}
              onCancel={() => setTagEditId(null)}
              isLoading={updateTagMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={tagCreateOpen} onOpenChange={setTagCreateOpen}>
        <DialogContent className="max-w-md" aria-describedby="add-tag-desc">
          <DialogHeader>
            <DialogTitle>Add tracked element</DialogTitle>
            <DialogDescription id="add-tag-desc" className="sr-only">Add a new tracked element with selector and event name.</DialogDescription>
          </DialogHeader>
          <TagForm
            initial={null}
            onSubmit={(payload) => createTagMutation.mutate({ ...payload, is_active: true })}
            onCancel={() => setTagCreateOpen(false)}
            isLoading={createTagMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GaSettingsForm({
  initial,
  onSubmit,
  isLoading,
}: {
  initial: AnalyticsSettingsRow | null;
  onSubmit: (payload: Partial<AnalyticsSettingsRow>) => void;
  isLoading: boolean;
}) {
  const [google_analytics_id, setGoogle_analytics_id] = useState(initial?.google_analytics_id ?? "");
  const [google_tag_manager_id, setGoogle_tag_manager_id] = useState(initial?.google_tag_manager_id ?? "");
  const [is_active, setIs_active] = useState(initial?.is_active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      google_analytics_id: google_analytics_id.trim() || null,
      google_tag_manager_id: google_tag_manager_id.trim() || null,
      is_active,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ga-id">Google Analytics 4 Measurement ID</Label>
        <Input id="ga-id" value={google_analytics_id} onChange={(e) => setGoogle_analytics_id(e.target.value)} placeholder="G-XXXXXXXXXX" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="gtm-id">Google Tag Manager ID (optional)</Label>
        <Input id="gtm-id" value={google_tag_manager_id} onChange={(e) => setGoogle_tag_manager_id(e.target.value)} placeholder="GTM-XXXXXXX" />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="ga-active" checked={is_active} onCheckedChange={setIs_active} />
        <Label htmlFor="ga-active">Inject scripts on website</Label>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </form>
  );
}

function TagForm({
  initial,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial: TagRow | null;
  onSubmit: (payload: Partial<TagRow>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [tag_name, setTag_name] = useState(initial?.tag_name ?? "");
  const [element_selector, setElement_selector] = useState(initial?.element_selector ?? "");
  const [event_name, setEvent_name] = useState(initial?.event_name ?? "button_click");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [is_active, setIs_active] = useState(initial?.is_active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tag_name.trim() || !element_selector.trim()) {
      toast.error("Tag name and selector are required");
      return;
    }
    onSubmit({
      tag_name: tag_name.trim(),
      element_selector: element_selector.trim(),
      event_name: event_name.trim() || "button_click",
      category: category.trim() || null,
      is_active,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Tag name</Label>
        <Input value={tag_name} onChange={(e) => setTag_name(e.target.value)} placeholder="e.g. Book Now CTA" required />
      </div>
      <div className="space-y-2">
        <Label>Element selector (CSS)</Label>
        <Input value={element_selector} onChange={(e) => setElement_selector(e.target.value)} placeholder="e.g. [data-track=book-now] or .book-now-btn" required />
      </div>
      <div className="space-y-2">
        <Label>Event name</Label>
        <Input value={event_name} onChange={(e) => setEvent_name(e.target.value)} placeholder="button_click" />
      </div>
      <div className="space-y-2">
        <Label>Category (optional)</Label>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. CTA" />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={is_active} onCheckedChange={setIs_active} />
        <Label>Active (track clicks)</Label>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {initial ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}
