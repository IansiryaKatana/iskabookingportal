import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/utils/auditLog";

type IntegrationStatus = {
  stripe: { connected: boolean; account?: string; error?: string };
  docusign: { connected: boolean; account?: string; error?: string };
  resend: { connected: boolean; domain?: string; error?: string };
};

const Settings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [socialMediaSettings, setSocialMediaSettings] = useState<Record<string, { url: string; is_enabled: boolean }>>({});

  const checkIntegrations = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("check-integration-status");

      if (error) {
        throw error;
      }

      setIntegrationStatus(data as IntegrationStatus);
    } catch (error) {
      console.error("Failed to check integration status:", error);
      toast({
        title: "Error",
        description: "Failed to check integration status. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch social media settings
  const { data: socialMediaData, isLoading: isLoadingSocial } = useQuery({
    queryKey: ["social-media-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_media_settings")
        .select("platform, url, is_enabled, display_order")
        .order("display_order", { ascending: true });

      if (error) throw error;

      const settingsMap: Record<string, { url: string; is_enabled: boolean }> = {};
      (data || []).forEach((item) => {
        settingsMap[item.platform] = {
          url: item.url || "",
          is_enabled: item.is_enabled,
        };
      });

      return settingsMap;
    },
  });

  useEffect(() => {
    if (socialMediaData) {
      setSocialMediaSettings(socialMediaData);
    }
  }, [socialMediaData]);

  // Update social media settings mutation
  const updateSocialMedia = useMutation({
    mutationFn: async (updates: Record<string, { url: string; is_enabled: boolean }>) => {
      const updatePromises = Object.entries(updates).map(async ([platform, { url, is_enabled }]) => {
        const { error } = await supabase
          .from("social_media_settings")
          .update({ url, is_enabled })
          .eq("platform", platform);

        if (error) throw error;
      });

      await Promise.all(updatePromises);

      // Log activity
      await logActivity({
        action: "update",
        entityType: "social_media_settings",
        payload: { platforms: Object.keys(updates) },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-media-settings"] });
      toast({
        title: "Social media settings updated",
        description: "Your social media URLs have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update social media settings",
        variant: "destructive",
      });
    },
  });

  const handleSocialMediaChange = (platform: string, field: "url" | "is_enabled", value: string | boolean) => {
    setSocialMediaSettings((prev) => ({
      ...prev,
      [platform]: {
        ...prev[platform],
        [field]: value,
      },
    }));
  };

  const handleSaveSocialMedia = () => {
    updateSocialMedia.mutate(socialMediaSettings);
  };

  useEffect(() => {
    checkIntegrations();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    checkIntegrations();
  };

  const getStatusBadge = (connected: boolean) => {
    if (connected) {
      return (
        <Badge className="bg-green-500 hover:bg-green-600 text-white gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Connected
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Not Connected
      </Badge>
    );
  };

  return (
    <AdminLayout
      pageTitle="Settings"
      subtitle="Manage platform preferences, notifications, and integrations."
    >
      <div className="space-y-6">
        {/* Social Media Settings */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-semibold">
              Social Media Links
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Manage your social media profile URLs displayed throughout the site.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingSocial ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <>
                {["instagram", "tiktok", "linkedin", "facebook", "whatsapp"].map((platform) => (
                  <div key={platform} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm md:text-base font-medium capitalize">{platform}</Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={socialMediaSettings[platform]?.is_enabled || false}
                          onCheckedChange={(checked) =>
                            handleSocialMediaChange(platform, "is_enabled", checked)
                          }
                        />
                        <span className="text-xs md:text-sm text-muted-foreground">
                          {socialMediaSettings[platform]?.is_enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                    </div>
                    <Input
                      type="url"
                      placeholder={`https://www.${platform === "whatsapp" ? "wa.me" : platform}.com/...`}
                      value={socialMediaSettings[platform]?.url || ""}
                      onChange={(e) => handleSocialMediaChange(platform, "url", e.target.value)}
                      disabled={!socialMediaSettings[platform]?.is_enabled}
                      className="w-full text-sm md:text-base"
                    />
                  </div>
                ))}
                <div className="pt-4">
                  <Button
                    onClick={handleSaveSocialMedia}
                    disabled={updateSocialMedia.isPending}
                    className="rounded-full uppercase tracking-wide gap-2 text-xs md:text-sm"
                  >
                    <Save className="h-3 w-3 md:h-4 md:w-4" />
                    {updateSocialMedia.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Notifications
            </CardTitle>
            <CardDescription>
              Control automated reminders and operational updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Upcoming instalments</Label>
                <p className="text-sm text-muted-foreground">
                  Email staff three days before a payment is due.
                </p>
              </div>
              <Switch disabled />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Document uploads</Label>
                <p className="text-sm text-muted-foreground">
                  Alert admins when a student submits new documentation.
                </p>
              </div>
              <Switch disabled defaultChecked />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">
                  Integrations
                </CardTitle>
                <CardDescription>
                  Connection status for Stripe, DocuSign, and Resend.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="rounded-full uppercase tracking-wide gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : integrationStatus ? (
              <>
                {/* Stripe Integration */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="font-semibold text-base">Stripe</Label>
                      {getStatusBadge(integrationStatus.stripe.connected)}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => window.open("https://dashboard.stripe.com", "_blank")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                  {integrationStatus.stripe.connected ? (
                    <p className="text-sm text-muted-foreground">
                      Account: {integrationStatus.stripe.account || "Connected"}
                    </p>
                  ) : (
                    <p className="text-sm text-destructive">
                      {integrationStatus.stripe.error || "Not configured"}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Used for payment processing, refunds, and payment intents.
                  </p>
                </div>

                {/* DocuSign Integration */}
                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="font-semibold text-base">DocuSign</Label>
                      {getStatusBadge(integrationStatus.docusign.connected)}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => window.open("https://app.docusign.com", "_blank")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                  {integrationStatus.docusign.connected ? (
                    <p className="text-sm text-muted-foreground">
                      Account: {integrationStatus.docusign.account || "Connected"}
                    </p>
                  ) : (
                    <p className="text-sm text-destructive">
                      {integrationStatus.docusign.error || "Not configured"}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Used for tenancy and guarantor agreement signing.
                  </p>
                </div>

                {/* Resend Integration */}
                <div className="space-y-2 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="font-semibold text-base">Resend</Label>
                      {getStatusBadge(integrationStatus.resend.connected)}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => window.open("https://resend.com", "_blank")}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                  {integrationStatus.resend.connected ? (
                    <p className="text-sm text-muted-foreground">
                      Domain: {integrationStatus.resend.domain || "Connected"}
                    </p>
                  ) : (
                    <p className="text-sm text-destructive">
                      {integrationStatus.resend.error || "Not configured"}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Used for transactional emails and bulk messaging.
                  </p>
                </div>

                <div className="border-t pt-4 mt-4">
                  <p className="text-xs text-muted-foreground">
                    API keys and credentials are managed in Supabase Dashboard → Project Settings → Edge Functions → Secrets.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Unable to load integration status.</p>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </AdminLayout>
  );
};

export default Settings;


