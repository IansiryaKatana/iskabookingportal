import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type IntegrationStatus = {
  stripe: { connected: boolean; account?: string; error?: string };
  docusign: { connected: boolean; account?: string; error?: string };
  resend: { connected: boolean; domain?: string; error?: string };
};

const Settings = () => {
  const { toast } = useToast();
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    </AdminLayout>
  );
};

export default Settings;


