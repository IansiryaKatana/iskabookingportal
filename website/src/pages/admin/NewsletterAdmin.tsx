import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, Settings, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Subscriber = {
  id: string;
  email: string;
  subscribed_at: string;
  source: string | null;
  unsubscribed_at: string | null;
  created_at: string;
};

type NewsletterSettings = {
  id: string;
  is_enabled: boolean;
  show_after_seconds: number;
  show_once_per_session: boolean;
  show_once_per_day: boolean;
  headline: string | null;
  subheadline: string | null;
  button_text: string | null;
  success_message: string | null;
};

export default function NewsletterAdmin() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: subscribers, isLoading } = useQuery({
    queryKey: ["admin-newsletter-subscribers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_newsletter_subscribers")
        .select("id, email, subscribed_at, source, unsubscribed_at, created_at")
        .is("unsubscribed_at", null)
        .order("subscribed_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Subscriber[];
    },
  });

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["admin-newsletter-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_newsletter_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as NewsletterSettings | null;
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (payload: Partial<NewsletterSettings>) => {
      const id = settings?.id;
      if (!id) throw new Error("No settings row");
      const { error } = await supabase.from("website_newsletter_settings").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-newsletter-settings"] });
      queryClient.invalidateQueries({ queryKey: ["website-newsletter-settings"] });
      toast.success("Popup settings saved.");
    },
    onError: () => toast.error("Failed to save."),
  });

  const handleExportCsv = () => {
    if (!subscribers?.length) {
      toast.error("No subscribers to export.");
      return;
    }
    const headers = ["Email", "Subscribed At", "Source"];
    const rows = subscribers.map((s) => [
      s.email,
      format(new Date(s.subscribed_at), "yyyy-MM-dd HH:mm:ss"),
      s.source || "popup",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `newsletter-subscribers-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported to CSV.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Newsletter</h1>
        <p className="text-muted-foreground">Manage subscribers and popup display behaviour.</p>
      </div>

      <Tabs defaultValue="subscribers" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="subscribers" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Subscribers ({subscribers?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="popup" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Popup Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subscribers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">All subscribers</CardTitle>
                <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!subscribers?.length}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !subscribers?.length ? (
                <p className="py-12 text-center text-muted-foreground">No subscribers yet. The popup will capture emails when visitors subscribe.</p>
              ) : (
                <div className="overflow-x-auto -mx-6 px-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Subscribed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subscribers.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.email}</TableCell>
                          <TableCell className="text-muted-foreground">{s.source || "popup"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(new Date(s.subscribed_at), "dd MMM yyyy, HH:mm")}
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

        <TabsContent value="popup" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Popup display behaviour</CardTitle>
              <p className="text-sm text-muted-foreground">Control when and how the newsletter popup appears on the website.</p>
            </CardHeader>
            <CardContent>
              {settingsLoading || !settings ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <PopupSettingsForm
                  initial={settings}
                  onSubmit={(p) => updateSettingsMutation.mutate(p)}
                  isLoading={updateSettingsMutation.isPending}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PopupSettingsForm({
  initial,
  onSubmit,
  isLoading,
}: {
  initial: NewsletterSettings;
  onSubmit: (p: Partial<NewsletterSettings>) => void;
  isLoading: boolean;
}) {
  const [is_enabled, setIs_enabled] = useState(initial.is_enabled);
  const [show_after_seconds, setShow_after_seconds] = useState(initial.show_after_seconds);
  const [show_once_per_session, setShow_once_per_session] = useState(initial.show_once_per_session);
  const [show_once_per_day, setShow_once_per_day] = useState(initial.show_once_per_day);
  const [headline, setHeadline] = useState(initial.headline ?? "");
  const [subheadline, setSubheadline] = useState(initial.subheadline ?? "");
  const [button_text, setButton_text] = useState(initial.button_text ?? "");
  const [success_message, setSuccess_message] = useState(initial.success_message ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      is_enabled,
      show_after_seconds: Math.max(0, parseInt(String(show_after_seconds), 10) || 5),
      show_once_per_session,
      show_once_per_day,
      headline: headline.trim() || null,
      subheadline: subheadline.trim() || null,
      button_text: button_text.trim() || null,
      success_message: success_message.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-2">
        <Switch id="is_enabled" checked={is_enabled} onCheckedChange={setIs_enabled} />
        <Label htmlFor="is_enabled">Enable newsletter popup</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="show_after_seconds">Show popup after (seconds)</Label>
        <Input
          id="show_after_seconds"
          type="number"
          min={0}
          value={show_after_seconds}
          onChange={(e) => setShow_after_seconds(e.target.value)}
          placeholder="5"
        />
        <p className="text-xs text-muted-foreground">Delay before popup appears. 0 = immediately.</p>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="show_once_per_session" checked={show_once_per_session} onCheckedChange={setShow_once_per_session} />
        <Label htmlFor="show_once_per_session">Show once per session</Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="show_once_per_day" checked={show_once_per_day} onCheckedChange={setShow_once_per_day} />
        <Label htmlFor="show_once_per_day">Show once per day (uses localStorage)</Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="headline">Headline</Label>
        <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Stay Updated" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="subheadline">Subheadline</Label>
        <Textarea id="subheadline" value={subheadline} onChange={(e) => setSubheadline(e.target.value)} rows={2} placeholder="Get the latest news and tips about student life at Urban Hub." />
      </div>

      <div className="space-y-2">
        <Label htmlFor="button_text">Button text</Label>
        <Input id="button_text" value={button_text} onChange={(e) => setButton_text(e.target.value)} placeholder="Subscribe" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="success_message">Success message</Label>
        <Input id="success_message" value={success_message} onChange={(e) => setSuccess_message(e.target.value)} placeholder="Thanks for subscribing!" />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save
        </Button>
      </div>
    </form>
  );
}
