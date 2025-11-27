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
import { CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink, Save, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/utils/auditLog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>("");
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteByYearOpen, setDeleteByYearOpen] = useState(false);

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

  // Fetch academic years for deletion dropdown
  const { data: academicYears, isLoading: isLoadingYears } = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, name")
        .order("start_date", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch application statistics
  const { data: appStats, refetch: refetchStats } = useQuery({
    queryKey: ["application-stats"],
    queryFn: async () => {
      const { data: allApps, error: allError } = await supabase
        .from("student_applications")
        .select(`
          id,
          contract_id,
          contracts!inner(
            academic_year_id
          )
        `);

      if (allError) throw allError;

      const statsByYear: Record<string, number> = {};
      (allApps || []).forEach((app: any) => {
        const yearId = app.contracts?.academic_year_id;
        if (yearId) {
          statsByYear[yearId] = (statsByYear[yearId] || 0) + 1;
        }
      });

      return {
        total: allApps?.length || 0,
        byYear: statsByYear,
      };
    },
  });

  // Delete all applications mutation
  const deleteAllApplications = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("delete_all_student_applications", {});

      if (error) {
        console.error("Delete all applications error:", error);
        throw error;
      }
      return data;
    },
    onSuccess: async (data) => {
      const deletedCount = data?.deleted_count || 0;
      const message = data?.message;
      const debug = data?.debug;
      const totalFound = data?.total_found;
      const details = data?.details || [];
      
      console.log("Delete all applications result:", { 
        data, 
        deletedCount, 
        totalFound, 
        debug,
        details,
        detailsCount: details.length,
        firstDetail: details[0],
        allDetails: details
      });
      
      // Check if there are errors in details
      const errors = details.filter((d: any) => d.error || !d.success);
      if (errors.length > 0) {
        console.error("Deletion errors found:", errors);
      }
      
      await logActivity({
        action: "delete",
        entityType: "student_applications",
        payload: { type: "all", count: deletedCount, total_found: totalFound },
      });
      queryClient.invalidateQueries({ queryKey: ["application-stats"] });
      queryClient.invalidateQueries({ queryKey: ["student-applications"] });
      
      if (deletedCount === 0) {
        toast({
          title: "No applications found",
          description: message || `There are no applications in the database to delete. (Found: ${totalFound || 0})`,
          variant: "default",
        });
      } else {
        toast({
          title: "Applications deleted",
          description: `Successfully deleted ${deletedCount} application(s) and all related records.`,
        });
      }
      setDeleteAllOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete applications",
        variant: "destructive",
      });
    },
  });

  // Delete applications by academic year mutation
  const deleteByAcademicYear = useMutation({
    mutationFn: async (academicYearId: string) => {
      const { data, error } = await supabase.rpc("delete_student_applications_by_academic_year", {
        p_academic_year_id: academicYearId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async (data, academicYearId) => {
      const deletedCount = data?.deleted_count || 0;
      const yearName = academicYears?.find((y) => y.id === academicYearId)?.name || "Unknown";
      const message = data?.message;
      
      await logActivity({
        action: "delete",
        entityType: "student_applications",
        payload: { type: "by_academic_year", academic_year_id: academicYearId, count: deletedCount },
      });
      queryClient.invalidateQueries({ queryKey: ["application-stats"] });
      queryClient.invalidateQueries({ queryKey: ["student-applications"] });
      
      if (deletedCount === 0) {
        toast({
          title: "No applications found",
          description: message || `No applications found for ${yearName} to delete.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Applications deleted",
          description: `Successfully deleted ${deletedCount} application(s) for ${yearName} and all related records.`,
        });
      }
      setDeleteByYearOpen(false);
      setSelectedAcademicYear("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete applications",
        variant: "destructive",
      });
    },
  });

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

        {/* Data Management Section */}
        <Card className="rounded-3xl border-destructive/20">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Data Management
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Development/Testing: Delete student applications and all related records. This action cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Statistics */}
            <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
              <h4 className="text-sm font-semibold mb-3">Current Application Statistics</h4>
              {appStats ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total Applications:</span>
                    <Badge variant="outline" className="font-semibold">
                      {appStats.total}
                    </Badge>
                  </div>
                  {Object.keys(appStats.byYear).length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium mb-2 text-muted-foreground">By Academic Year:</p>
                      <div className="space-y-1">
                        {academicYears
                          ?.filter((year) => appStats.byYear[year.id])
                          .map((year) => (
                            <div key={year.id} className="flex items-center justify-between text-xs">
                              <span>{year.name}:</span>
                              <Badge variant="outline" className="text-xs">
                                {appStats.byYear[year.id]}
                              </Badge>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Skeleton className="h-20 w-full" />
              )}
            </div>

            {/* Warning Alert */}
            <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-destructive mb-1">Warning: Irreversible Action</p>
                  <p className="text-muted-foreground text-xs">
                    Deleting applications will permanently remove:
                  </p>
                  <ul className="list-disc list-inside mt-2 text-xs text-muted-foreground space-y-1">
                    <li>Application records and all steps</li>
                    <li>Uploaded documents and signatures</li>
                    <li>Payment records (Stripe and manual)</li>
                    <li>Partner referrals and commissions</li>
                    <li>DocuSign envelopes</li>
                    <li>Studio allocations (studios will be freed)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Delete Actions */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Delete All */}
              <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    className="w-full rounded-full uppercase tracking-wide"
                    disabled={deleteAllApplications.isPending || (appStats?.total || 0) === 0}
                  >
                    {deleteAllApplications.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete All Applications
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-destructive">Delete All Applications?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="text-sm space-y-2">
                        <p>
                          This will permanently delete <strong>all {appStats?.total || 0} application(s)</strong> and all
                          related records including:
                        </p>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Application steps and data</li>
                          <li>Documents and signatures</li>
                          <li>Payment records</li>
                          <li>Partner referrals</li>
                          <li>Studio allocations</li>
                        </ul>
                        <p className="mt-3 font-semibold text-destructive">This action cannot be undone.</p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteAllApplications.mutate()}
                      className="rounded-full bg-destructive hover:bg-destructive/90"
                      disabled={deleteAllApplications.isPending}
                    >
                      {deleteAllApplications.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        "Delete All"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Delete by Academic Year */}
              <AlertDialog open={deleteByYearOpen} onOpenChange={setDeleteByYearOpen}>
                <div className="space-y-3">
                  <Select
                    value={selectedAcademicYear || ""}
                    onValueChange={setSelectedAcademicYear}
                    disabled={isLoadingYears || deleteByAcademicYear.isPending}
                  >
                    <SelectTrigger className="w-full rounded-full">
                      <SelectValue placeholder="Select academic year" />
                    </SelectTrigger>
                    <SelectContent>
                      {academicYears?.map((year) => {
                        const count = appStats?.byYear[year.id] || 0;
                        return (
                          <SelectItem key={year.id} value={year.id}>
                            {year.name} ({count} application{count !== 1 ? "s" : ""})
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="w-full rounded-full uppercase tracking-wide"
                      disabled={
                        !selectedAcademicYear ||
                        deleteByAcademicYear.isPending ||
                        (appStats?.byYear[selectedAcademicYear] || 0) === 0
                      }
                    >
                      {deleteByAcademicYear.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete by Academic Year
                        </>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                </div>
                <AlertDialogContent className="rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-destructive">
                      Delete Applications for {academicYears?.find((y) => y.id === selectedAcademicYear)?.name}?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="text-sm space-y-2">
                        <p>
                          This will permanently delete{" "}
                          <strong>
                            {appStats?.byYear[selectedAcademicYear] || 0} application(s)
                          </strong>{" "}
                          for this academic year and all related records including:
                        </p>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>Application steps and data</li>
                          <li>Documents and signatures</li>
                          <li>Payment records</li>
                          <li>Partner referrals</li>
                          <li>Studio allocations</li>
                        </ul>
                        <p className="mt-3 font-semibold text-destructive">This action cannot be undone.</p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => selectedAcademicYear && deleteByAcademicYear.mutate(selectedAcademicYear)}
                      className="rounded-full bg-destructive hover:bg-destructive/90"
                      disabled={deleteByAcademicYear.isPending || !selectedAcademicYear}
                    >
                      {deleteByAcademicYear.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        "Delete"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default Settings;


