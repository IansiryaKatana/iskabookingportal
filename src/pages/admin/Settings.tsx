import { useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, RefreshCw, ExternalLink, Save, Trash2, AlertTriangle, Eye, EyeOff, Lock, Download, Database, Upload } from "lucide-react";
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
  const [deleteApplicationsByYear, setDeleteApplicationsByYear] = useState(true);
  const [deleteCustomContractsByYear, setDeleteCustomContractsByYear] = useState(false);
  const [deleteOrphanedContractsByYear, setDeleteOrphanedContractsByYear] = useState(false);
  const [deleteOrphanedUsers, setDeleteOrphanedUsers] = useState(false);
  // Search-based deletion state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchType, setSearchType] = useState<"student_name" | "studio_number">("student_name");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedApplications, setSelectedApplications] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [deleteBySearchOpen, setDeleteBySearchOpen] = useState(false);
  const [deleteOrphanedUsersSearch, setDeleteOrphanedUsersSearch] = useState(false);
  const [credentials, setCredentials] = useState<{ resend_api_key: string; resend_from_email: string }>({
    resend_api_key: "",
    resend_from_email: "",
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSavingCredentials, setIsSavingCredentials] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isExportingDatabase, setIsExportingDatabase] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [isImportingDatabase, setIsImportingDatabase] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [deleteAllMatchesOpen, setDeleteAllMatchesOpen] = useState(false);

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

  // Fetch credentials
  const { data: credentialsData, isLoading: isLoadingCredentials } = useQuery({
    queryKey: ["credentials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credentials")
        .select("credential_key, credential_value")
        .in("credential_key", ["resend_api_key", "resend_from_email"]);

      if (error) throw error;

      const credsMap: { resend_api_key: string; resend_from_email: string } = {
        resend_api_key: "",
        resend_from_email: "",
      };

      (data || []).forEach((item) => {
        if (item.credential_key === "resend_api_key") {
          credsMap.resend_api_key = item.credential_value || "";
        } else if (item.credential_key === "resend_from_email") {
          credsMap.resend_from_email = item.credential_value || "";
        }
      });

      return credsMap;
    },
  });

  useEffect(() => {
    if (credentialsData) {
      setCredentials(credentialsData);
    }
  }, [credentialsData]);

  // Update social media settings mutation
  const updateSocialMedia = useMutation({
    mutationFn: async (updates: Record<string, { url: string; is_enabled: boolean }>) => {
      const updatePromises = Object.entries(updates).map(async ([platform, { url, is_enabled }]) => {
        // Use upsert to handle both insert and update cases
        // This ensures the update works even if the row doesn't exist
        const { data, error } = await supabase
          .from("social_media_settings")
          .upsert(
            {
              platform,
              url,
              is_enabled,
            },
            {
              onConflict: "platform",
            }
          )
          .select()
          .single();

        if (error) throw error;
        if (!data) throw new Error(`Failed to save ${platform} settings`);
        
        return data;
      });

      const results = await Promise.all(updatePromises);

      // Log activity
      await logActivity({
        action: "update",
        entityType: "social_media_settings",
        payload: { platforms: Object.keys(updates) },
      });

      return results;
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

  // Update credentials mutation
  const updateCredentials = useMutation({
    mutationFn: async (updates: { resend_api_key: string; resend_from_email: string }) => {
      const updatePromises = [
        supabase
          .from("credentials")
          .upsert(
            {
              credential_key: "resend_api_key",
              credential_value: updates.resend_api_key,
              credential_type: "api_key",
              description: "Resend API key for sending emails",
              sync_to_edge_function: true,
            },
            { onConflict: "credential_key" }
          ),
        supabase
          .from("credentials")
          .upsert(
            {
              credential_key: "resend_from_email",
              credential_value: updates.resend_from_email,
              credential_type: "email",
              description: "Default from email address for Resend",
              sync_to_edge_function: true,
            },
            { onConflict: "credential_key" }
          ),
      ];

      const results = await Promise.all(updatePromises);
      results.forEach(({ error }) => {
        if (error) throw error;
      });

      await logActivity({
        action: "update",
        entityType: "credentials",
        payload: { updated_keys: ["resend_api_key", "resend_from_email"] },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credentials"] });
      queryClient.invalidateQueries({ queryKey: ["integration-status"] });
      toast({
        title: "Credentials updated",
        description: "Email credentials have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update credentials",
        variant: "destructive",
      });
    },
  });

  const handleCredentialsChange = (key: "resend_api_key" | "resend_from_email", value: string) => {
    setCredentials((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveCredentials = () => {
    if (!credentials.resend_api_key.trim()) {
      toast({
        title: "Validation Error",
        description: "Resend API key is required",
        variant: "destructive",
      });
      return;
    }

    if (!credentials.resend_from_email.trim() || !credentials.resend_from_email.includes("@")) {
      toast({
        title: "Validation Error",
        description: "Valid email address is required",
        variant: "destructive",
      });
      return;
    }

    setIsSavingCredentials(true);
    updateCredentials.mutate(credentials, {
      onSettled: () => {
        setIsSavingCredentials(false);
      },
    });
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      // Refresh integration status to test connection
      await checkIntegrations();
      toast({
        title: "Connection Test",
        description: integrationStatus?.resend?.connected
          ? "Successfully connected to Resend"
          : integrationStatus?.resend?.error || "Failed to connect to Resend",
        variant: integrationStatus?.resend?.connected ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to test connection",
        variant: "destructive",
      });
    } finally {
      setIsTestingConnection(false);
    }
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
      // 1) Fetch all applications with their contract_id
      const { data: allApps, error: allError } = await supabase
        .from("student_applications")
        .select("id, contract_id");

      if (allError) throw allError;

      const apps = allApps || [];
      const total = apps.length;

      // If there are no applications, short-circuit
      if (apps.length === 0) {
        return {
          total: 0,
          byYear: {} as Record<string, number>,
        };
      }

      // 2) Load the contracts for these applications so we can map to academic years
      const contractIds = Array.from(
        new Set(
          apps
            .map((app: any) => app.contract_id)
            .filter((id: string | null) => !!id)
        )
      );

      if (contractIds.length === 0) {
        return {
          total,
          byYear: {} as Record<string, number>,
        };
      }

      const { data: contracts, error: contractsError } = await supabase
        .from("contracts")
        .select("id, academic_year_id")
        .in("id", contractIds);

      if (contractsError) throw contractsError;

      const yearByContract = new Map<string, string | null>();
      (contracts || []).forEach((c: any) => {
        yearByContract.set(c.id, c.academic_year_id);
      });

      const statsByYear: Record<string, number> = {};
      apps.forEach((app: any) => {
        const yearId = yearByContract.get(app.contract_id);
        if (yearId) {
          statsByYear[yearId] = (statsByYear[yearId] || 0) + 1;
        }
      });

      return {
        total,
        byYear: statsByYear,
      };
    },
  });

  // Delete all applications mutation
  const deleteAllApplications = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("delete_all_student_applications", {
        p_delete_orphaned_users: deleteOrphanedUsers,
      });

      if (error) {
        console.error("Delete all applications error:", error);
        throw error;
      }
      return data;
    },
    onSuccess: async (data) => {
      const deletedCount = data?.deleted_count || 0;
      const usersDeleted = data?.users_deleted || 0;
      const usersPreserved = data?.users_preserved || 0;
      const message = data?.message;
      const debug = data?.debug;
      const totalFound = data?.total_found;
      const details = data?.details || [];
      const userDetails = data?.user_details || [];
      
      if (import.meta.env.DEV) console.log("Delete all applications result:", { 
        data, 
        deletedCount, 
        usersDeleted,
        usersPreserved,
        totalFound, 
        debug,
        details,
        userDetails,
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
        payload: { 
          type: "all", 
          count: deletedCount, 
          total_found: totalFound,
          delete_orphaned_users: deleteOrphanedUsers,
          users_deleted: usersDeleted,
          users_preserved: usersPreserved,
        },
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
        let description = `Successfully deleted ${deletedCount} application(s) and all related records.`;
        if (deleteOrphanedUsers) {
          description += ` Users: ${usersDeleted} deleted, ${usersPreserved} preserved.`;
        }
        toast({
          title: "Applications deleted",
          description,
        });
      }
      setDeleteAllOpen(false);
      setDeleteOrphanedUsers(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete applications",
        variant: "destructive",
      });
    },
  });

  // Search applications mutation
  const searchApplications = useMutation({
    mutationFn: async () => {
      if (!searchTerm.trim()) {
        throw new Error("Please enter a search term");
      }
      setIsSearching(true);
      const { data, error } = await supabase.rpc("search_applications_by_criteria", {
        p_search_term: searchTerm.trim(),
        p_search_type: searchType,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setSearchResults(data || []);
      setSelectedApplications(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: "Search Error",
        description: error.message || "Failed to search applications",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSearching(false);
    },
  });

  // Delete applications by IDs mutation
  const deleteBySearch = useMutation({
    mutationFn: async (applicationIds: string[]) => {
      if (applicationIds.length === 0) {
        throw new Error("No applications selected");
      }
      const { data, error } = await supabase.rpc("delete_applications_by_ids", {
        p_application_ids: applicationIds,
        p_delete_orphaned_users: deleteOrphanedUsersSearch,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      const deletedCount = data?.deleted_count || 0;
      const usersDeleted = data?.users_deleted || 0;
      const usersPreserved = data?.users_preserved || 0;
      const message = data?.message;

      await logActivity({
        action: "delete",
        entityType: "student_applications",
        payload: {
          type: "by_search",
          search_term: searchTerm,
          search_type: searchType,
          count: deletedCount,
          delete_orphaned_users: deleteOrphanedUsersSearch,
          users_deleted: usersDeleted,
          users_preserved: usersPreserved,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["application-stats"] });
      queryClient.invalidateQueries({ queryKey: ["student-applications"] });

      let description = `Successfully deleted ${deletedCount} application(s) and all related records.`;
      if (deleteOrphanedUsersSearch) {
        description += ` Users: ${usersDeleted} deleted, ${usersPreserved} preserved.`;
      }
      toast({
        title: "Applications deleted",
        description,
      });

      // Reset state
      setSearchResults([]);
      setSelectedApplications(new Set());
      setSearchTerm("");
      setDeleteBySearchOpen(false);
      setDeleteOrphanedUsersSearch(false);
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
        p_delete_applications: deleteApplicationsByYear,
        p_delete_custom_contracts_and_plans: deleteCustomContractsByYear,
        p_delete_orphaned_contracts_and_plans: deleteOrphanedContractsByYear,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: async (data, academicYearId) => {
      const deletedCount = data?.deleted_count ?? 0;
      const customDeleted = data?.custom_contracts_deleted ?? 0;
      const orphanedDeleted = data?.orphaned_contracts_deleted ?? 0;
      const yearName = academicYears?.find((y) => y.id === academicYearId)?.name || "Unknown";
      const message = data?.message;
      
      await logActivity({
        action: "delete",
        entityType: "student_applications",
        payload: { 
          type: "by_academic_year", 
          academic_year_id: academicYearId, 
          count: deletedCount,
          custom_contracts_deleted: customDeleted,
          orphaned_contracts_deleted: orphanedDeleted,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["application-stats"] });
      queryClient.invalidateQueries({ queryKey: ["student-applications"] });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      
      if (deletedCount === 0 && customDeleted === 0 && orphanedDeleted === 0) {
        toast({
          title: "Nothing deleted",
          description: message || `No applications or contracts found for ${yearName} to delete.`,
          variant: "default",
        });
      } else {
        const parts: string[] = [];
        if (deletedCount > 0) parts.push(`${deletedCount} application(s) and related records`);
        if (customDeleted > 0) parts.push(`${customDeleted} custom contract(s) and plans`);
        if (orphanedDeleted > 0) parts.push(`${orphanedDeleted} orphaned contract(s) and plans`);
        toast({
          title: "Delete complete",
          description: `Successfully deleted for ${yearName}: ${parts.join("; ")}.`,
        });
      }
      setDeleteByYearOpen(false);
      setSelectedAcademicYear("");
      setDeleteApplicationsByYear(true);
      setDeleteCustomContractsByYear(false);
      setDeleteOrphanedContractsByYear(false);
      setDeleteOrphanedUsers(false);
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

  const handleExportDatabase = async () => {
    setIsExportingDatabase(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-database");

      if (error) {
        throw error;
      }

      // Create a blob and download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `supabase-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await logActivity({
        action: "export",
        entityType: "database",
        payload: { type: "full_migration_export" },
      });

      toast({
        title: "Export successful",
        description: "Database export has been downloaded successfully.",
      });

      setExportDialogOpen(false);
    } catch (error) {
      console.error("Failed to export database:", error);
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export database. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExportingDatabase(false);
    }
  };

  const handleImportDatabase = async () => {
    if (!importFile) {
      toast({
        title: "No file selected",
        description: "Please select an export JSON file to import.",
        variant: "destructive",
      });
      return;
    }

    setIsImportingDatabase(true);
    try {
      // Read the file
      const fileContent = await importFile.text();
      const exportPackage = JSON.parse(fileContent);

      // Call import function
      const { data, error } = await supabase.functions.invoke("import-database", {
        body: { exportPackage },
      });

      if (error) {
        throw error;
      }

      await logActivity({
        action: "import",
        entityType: "database",
        payload: {
          source_export_date: exportPackage.metadata?.export_date,
          storage_buckets_imported: data?.imported?.storage_buckets || 0,
        },
      });

      toast({
        title: "Import successful",
        description: `Successfully imported ${data?.imported?.storage_buckets || 0} storage bucket(s). See notes for next steps.`,
      });

      setImportDialogOpen(false);
      setImportFile(null);
    } catch (error) {
      console.error("Failed to import database:", error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Failed to import database. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsImportingDatabase(false);
    }
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
                    className="rounded-md uppercase tracking-wide gap-2 text-xs md:text-sm"
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
                className="rounded-md uppercase tracking-wide gap-2"
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

              </>
            ) : (
              <p className="text-sm text-muted-foreground">Unable to load integration status.</p>
            )}
          </CardContent>
        </Card>
        </div>

        {/* Email Credentials Section */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Email Credentials
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Manage Resend API key and from email address for sending transactional emails.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingCredentials ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <>
                {/* Resend API Key */}
                <div className="space-y-2">
                  <Label htmlFor="resend_api_key" className="text-sm md:text-base font-medium">
                    Resend API Key
                  </Label>
                  <div className="relative">
                    <Input
                      id="resend_api_key"
                      type={showApiKey ? "text" : "password"}
                      placeholder="re_..."
                      value={credentials.resend_api_key}
                      onChange={(e) => handleCredentialsChange("resend_api_key", e.target.value)}
                      className="pr-10 text-sm md:text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showApiKey ? "Hide API key" : "Show API key"}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your Resend API key. Keep this secure and never share it publicly.
                  </p>
                </div>

                {/* Resend From Email */}
                <div className="space-y-2">
                  <Label htmlFor="resend_from_email" className="text-sm md:text-base font-medium">
                    From Email Address
                  </Label>
                  <Input
                    id="resend_from_email"
                    type="email"
                    placeholder="noreply@send.portal.urbanhub.uk"
                    value={credentials.resend_from_email}
                    onChange={(e) => handleCredentialsChange("resend_from_email", e.target.value)}
                    className="text-sm md:text-base"
                  />
                  <p className="text-xs text-muted-foreground">
                    The email address that will appear as the sender for all transactional emails.
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button
                    onClick={handleSaveCredentials}
                    disabled={isSavingCredentials}
                    className="rounded-md uppercase tracking-wide gap-2 text-xs md:text-sm flex-1"
                  >
                    <Save className="h-3 w-3 md:h-4 md:w-4" />
                    {isSavingCredentials ? "Saving..." : "Save Credentials"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection}
                    className="rounded-md uppercase tracking-wide gap-2 text-xs md:text-sm"
                  >
                    {isTestingConnection ? (
                      <>
                        <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3 w-3 md:h-4 md:w-4" />
                        Test Connection
                      </>
                    )}
                  </Button>
                </div>

                {/* Status Info */}
                {integrationStatus?.resend && (
                  <div className="rounded-lg border p-3 bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium">Connection Status:</span>
                      {getStatusBadge(integrationStatus.resend.connected)}
                    </div>
                    {integrationStatus.resend.connected ? (
                      <p className="text-xs text-muted-foreground">
                        Domain: {integrationStatus.resend.domain || "Connected"}
                      </p>
                    ) : (
                      <p className="text-xs text-destructive">
                        {integrationStatus.resend.error || "Not configured"}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

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
            <div className="space-y-6">
              {/* Delete All and Delete by Year - Side by Side */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Delete All */}
                <AlertDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="w-full rounded-md uppercase tracking-wide"
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
                          <div className="mt-4 pt-4 border-t space-y-3">
                            <div className="flex items-start space-x-3">
                              <Checkbox
                                id="delete-orphaned-users-all"
                                checked={deleteOrphanedUsers}
                                onCheckedChange={(checked) => setDeleteOrphanedUsers(checked === true)}
                                className="mt-1"
                              />
                              <div className="space-y-1 flex-1">
                                <Label
                                  htmlFor="delete-orphaned-users-all"
                                  className="text-sm font-medium cursor-pointer"
                                >
                                  Also delete orphaned user accounts (Smart Deletion)
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  Users will only be deleted if they have no important data (refunds, maintenance requests, etc.). 
                                  Staff accounts are never deleted. This helps clean up orphaned accounts automatically.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-md" onClick={() => setDeleteOrphanedUsers(false)}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteAllApplications.mutate()}
                        className="rounded-md bg-destructive hover:bg-destructive/90"
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
                      <SelectTrigger className="w-full rounded-md">
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
                        className="w-full rounded-md uppercase tracking-wide"
                        disabled={
                          !selectedAcademicYear ||
                          deleteByAcademicYear.isPending
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
                        Delete by Academic Year: {academicYears?.find((y) => y.id === selectedAcademicYear)?.name}?
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="text-sm space-y-2">
                          <p>Choose what to permanently delete for this academic year. This action cannot be undone.</p>
                          {deleteApplicationsByYear && (
                            <>
                              <p>
                                <strong>Applications:</strong> {appStats?.byYear[selectedAcademicYear] || 0} application(s) and all related records:
                              </p>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>Application steps and data</li>
                                <li>Documents and signatures</li>
                                <li>Payment records</li>
                                <li>Partner referrals</li>
                                <li>Studio allocations</li>
                              </ul>
                            </>
                          )}
                          {deleteCustomContractsByYear && (
                            <p><strong>Custom contracts and payment plans</strong> (slug starts with &quot;custom&quot;) will be deleted.</p>
                          )}
                          {deleteOrphanedContractsByYear && (
                            <p><strong>Orphaned contracts and plans</strong> (no application linked) will be deleted.</p>
                          )}
                          {!deleteApplicationsByYear && !deleteCustomContractsByYear && !deleteOrphanedContractsByYear && (
                            <p className="font-medium text-muted-foreground">Select at least one option below.</p>
                          )}
                          <div className="mt-4 pt-4 border-t space-y-3">
                            <div className="flex items-start space-x-3">
                              <Checkbox
                                id="delete-apps-by-year"
                                checked={deleteApplicationsByYear}
                                onCheckedChange={(c) => setDeleteApplicationsByYear(c === true)}
                                className="mt-1"
                              />
                              <div className="flex-1">
                                <Label htmlFor="delete-apps-by-year" className="text-sm font-medium cursor-pointer">
                                  Delete applications and all related records
                                </Label>
                              </div>
                            </div>
                            <div className="flex items-start space-x-3">
                              <Checkbox
                                id="delete-custom-contracts-year"
                                checked={deleteCustomContractsByYear}
                                onCheckedChange={(c) => setDeleteCustomContractsByYear(c === true)}
                                className="mt-1"
                              />
                              <div className="flex-1">
                                <Label htmlFor="delete-custom-contracts-year" className="text-sm font-medium cursor-pointer">
                                  Also delete custom contracts and payment plans
                                </Label>
                              </div>
                            </div>
                            <div className="flex items-start space-x-3">
                              <Checkbox
                                id="delete-orphaned-contracts-year"
                                checked={deleteOrphanedContractsByYear}
                                onCheckedChange={(c) => setDeleteOrphanedContractsByYear(c === true)}
                                className="mt-1"
                              />
                              <div className="flex-1">
                                <Label htmlFor="delete-orphaned-contracts-year" className="text-sm font-medium cursor-pointer">
                                  Also delete orphaned contracts and payment plans
                                </Label>
                              </div>
                            </div>
                            <div className="flex items-start space-x-3">
                              <Checkbox
                                id="delete-orphaned-users-year"
                                checked={deleteOrphanedUsers}
                                onCheckedChange={(checked) => setDeleteOrphanedUsers(checked === true)}
                                className="mt-1"
                              />
                              <div className="space-y-1 flex-1">
                                <Label
                                  htmlFor="delete-orphaned-users-year"
                                  className="text-sm font-medium cursor-pointer"
                                >
                                  Also delete orphaned user accounts (Smart Deletion)
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  Users with no important data may be removed. Staff accounts are never deleted. Not yet applied in this flow.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel
                        className="rounded-md"
                        onClick={() => {
                          setDeleteApplicationsByYear(true);
                          setDeleteCustomContractsByYear(false);
                          setDeleteOrphanedContractsByYear(false);
                          setDeleteOrphanedUsers(false);
                        }}
                      >
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => selectedAcademicYear && deleteByAcademicYear.mutate(selectedAcademicYear)}
                        className="rounded-md bg-destructive hover:bg-destructive/90"
                        disabled={
                          deleteByAcademicYear.isPending ||
                          !selectedAcademicYear ||
                          (!deleteApplicationsByYear && !deleteCustomContractsByYear && !deleteOrphanedContractsByYear)
                        }
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

              {/* Delete by Search - Full Width */}
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold mb-1">Delete by Search</h4>
                  <p className="text-xs text-muted-foreground">
                    Search for applications by student name or studio number, then delete selected or all matches.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder={searchType === "student_name" ? "Enter student name..." : "Enter studio number..."}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && searchTerm.trim()) {
                          searchApplications.mutate();
                        }
                      }}
                      className="rounded-md"
                      disabled={isSearching || deleteBySearch.isPending}
                    />
                    <Select
                      value={searchType}
                      onValueChange={(value: "student_name" | "studio_number") => setSearchType(value)}
                      disabled={isSearching || deleteBySearch.isPending}
                    >
                      <SelectTrigger className="w-full sm:w-[160px] rounded-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student_name">Student Name</SelectItem>
                        <SelectItem value="studio_number">Studio Number</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex sm:block">
                    <Button
                      onClick={() => searchApplications.mutate()}
                      disabled={!searchTerm.trim() || isSearching || deleteBySearch.isPending}
                      className="w-full sm:w-auto rounded-md"
                      variant="outline"
                    >
                      {isSearching ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Search
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-3 mt-4 pt-4 border-t">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <p className="text-sm font-medium">
                        Found {searchResults.length} application{searchResults.length !== 1 ? "s" : ""}
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (selectedApplications.size === searchResults.length) {
                              setSelectedApplications(new Set());
                            } else {
                              setSelectedApplications(new Set(searchResults.map((r) => r.application_id)));
                            }
                          }}
                          className="rounded-md text-xs w-full sm:w-auto"
                        >
                          {selectedApplications.size === searchResults.length ? "Deselect All" : "Select All"}
                        </Button>
                        <AlertDialog open={deleteBySearchOpen} onOpenChange={setDeleteBySearchOpen}>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="rounded-md text-xs w-full sm:w-auto"
                              disabled={selectedApplications.size === 0 || deleteBySearch.isPending}
                            >
                              {deleteBySearch.isPending ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete Selected ({selectedApplications.size})
                                </>
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-3xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-destructive">
                                Delete {selectedApplications.size} Application{selectedApplications.size !== 1 ? "s" : ""}?
                              </AlertDialogTitle>
                              <AlertDialogDescription asChild>
                                <div className="text-sm space-y-2">
                                  <p>
                                    This will permanently delete <strong>{selectedApplications.size} selected application(s)</strong> and all
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
                                  <div className="mt-4 pt-4 border-t space-y-3">
                                    <div className="flex items-start space-x-3">
                                      <Checkbox
                                        id="delete-orphaned-users-search"
                                        checked={deleteOrphanedUsersSearch}
                                        onCheckedChange={(checked) => setDeleteOrphanedUsersSearch(checked === true)}
                                        className="mt-1"
                                      />
                                      <div className="space-y-1 flex-1">
                                        <Label
                                          htmlFor="delete-orphaned-users-search"
                                          className="text-sm font-medium cursor-pointer"
                                        >
                                          Also delete orphaned user accounts (Smart Deletion)
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                          Users will only be deleted if they have no important data (refunds, maintenance requests, etc.). 
                                          Staff accounts are never deleted. This helps clean up orphaned accounts automatically.
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-md" onClick={() => setDeleteOrphanedUsersSearch(false)}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteBySearch.mutate(Array.from(selectedApplications))}
                                className="rounded-md bg-destructive hover:bg-destructive/90"
                                disabled={deleteBySearch.isPending}
                              >
                                {deleteBySearch.isPending ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Deleting...
                                  </>
                                ) : (
                                  "Delete Selected"
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <AlertDialog open={deleteAllMatchesOpen} onOpenChange={setDeleteAllMatchesOpen}>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="rounded-md text-xs w-full sm:w-auto"
                              disabled={deleteBySearch.isPending || searchResults.length === 0}
                            >
                              {deleteBySearch.isPending ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Deleting...
                                </>
                              ) : (
                                "Delete All Matches"
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-3xl">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-destructive">
                                Delete All {searchResults.length} Matching Application
                                {searchResults.length !== 1 ? "s" : ""}?
                              </AlertDialogTitle>
                              <AlertDialogDescription asChild>
                                <div className="text-sm space-y-2">
                                  <p>
                                    This will permanently delete <strong>all {searchResults.length} matching application(s)</strong> and all
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
                                  <div className="mt-4 pt-4 border-t space-y-3">
                                    <div className="flex items-start space-x-3">
                                      <Checkbox
                                        id="delete-orphaned-users-search-all"
                                        checked={deleteOrphanedUsersSearch}
                                        onCheckedChange={(checked) =>
                                          setDeleteOrphanedUsersSearch(checked === true)
                                        }
                                        className="mt-1"
                                      />
                                      <div className="space-y-1 flex-1">
                                        <Label
                                          htmlFor="delete-orphaned-users-search-all"
                                          className="text-sm font-medium cursor-pointer"
                                        >
                                          Also delete orphaned user accounts (Smart Deletion)
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                          Users will only be deleted if they have no important data (refunds, maintenance requests, etc.).
                                          Staff accounts are never deleted. This helps clean up orphaned accounts automatically.
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel
                                className="rounded-md"
                                onClick={() => setDeleteOrphanedUsersSearch(false)}
                              >
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  deleteBySearch.mutate(searchResults.map((r) => r.application_id));
                                }}
                                disabled={deleteBySearch.isPending}
                                className="rounded-md bg-destructive hover:bg-destructive/90"
                              >
                                {deleteBySearch.isPending ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Deleting...
                                  </>
                                ) : (
                                  "Delete All Matches"
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto border rounded-lg">
                      <div className="divide-y">
                        {searchResults.map((result) => (
                          <div
                            key={result.application_id}
                            className="p-3 hover:bg-muted/50 flex items-start gap-3"
                          >
                            <Checkbox
                              checked={selectedApplications.has(result.application_id)}
                              onCheckedChange={(checked) => {
                                const newSelected = new Set(selectedApplications);
                                if (checked) {
                                  newSelected.add(result.application_id);
                                } else {
                                  newSelected.delete(result.application_id);
                                }
                                setSelectedApplications(newSelected);
                              }}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{result.student_name}</span>
                                {result.studio_number && (
                                  <Badge variant="outline" className="text-xs">
                                    Studio {result.studio_number}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {result.status}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 space-x-2">
                                {result.student_email && <span>{result.student_email}</span>}
                                {result.contract_name && <span>• {result.contract_name}</span>}
                                {result.studio_grade_name && <span>• {result.studio_grade_name}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {searchResults.length === 0 && searchTerm && !isSearching && (
                  <p className="text-sm text-muted-foreground text-center py-2">No applications found.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database Export Section */}
        <Card className="rounded-3xl border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-semibold flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Migration Export
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Export complete database schema, functions, storage buckets, and configuration for migration to a new Supabase project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 p-4">
              <h4 className="text-sm font-semibold mb-2">What's Included:</h4>
              <ul className="text-xs md:text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Complete database schema (tables, columns, constraints, indexes)</li>
                <li>All database functions and triggers</li>
                <li>Views and custom types (enums)</li>
                <li>Row Level Security (RLS) policies</li>
                <li>Storage bucket configurations and policies</li>
                <li>Edge functions metadata</li>
                <li>Required secrets checklist</li>
                <li>Migration guide</li>
              </ul>
            </div>

            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Important Notes:</p>
                  <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1 list-disc list-inside">
                    <li>This export contains <strong>schema and configuration only</strong> - actual data is not included</li>
                    <li>Storage files must be downloaded separately using Supabase CLI or Dashboard</li>
                    <li>Edge function source code is in your repository at <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">supabase/functions/</code></li>
                    <li>Secrets must be manually configured in the new project's dashboard</li>
                    <li>This action is logged in the audit trail</li>
                  </ul>
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                    📖 See <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">docs/DATABASE_MIGRATION_GUIDE.md</code> for complete migration instructions
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <AlertDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="default"
                    className="w-full rounded-md uppercase tracking-wide gap-2"
                    disabled={isExportingDatabase}
                  >
                    {isExportingDatabase ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Export Database
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Export Database for Migration?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="text-sm space-y-2">
                        <p>
                          This will generate a complete export of your database schema, functions, storage configurations, and migration metadata.
                        </p>
                        <p className="font-semibold">The export will include:</p>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          <li>All database tables, columns, constraints, and indexes</li>
                          <li>Database functions, triggers, views, and enums</li>
                          <li>Row Level Security (RLS) policies</li>
                          <li>Storage bucket configurations and policies</li>
                          <li>Edge functions list and secrets checklist</li>
                          <li>Step-by-step migration guide</li>
                        </ul>
                        <p className="mt-3 text-muted-foreground">
                          <strong>Note:</strong> This export contains schema only. Actual data and storage files are not included.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleExportDatabase}
                      className="rounded-md"
                      disabled={isExportingDatabase}
                    >
                      {isExportingDatabase ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-2" />
                          Export Database
                        </>
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full rounded-md uppercase tracking-wide gap-2"
                    disabled={isImportingDatabase}
                  >
                    {isImportingDatabase ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Import Database Config
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-3xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Import Database Configuration?</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="text-sm space-y-2">
                        <p>
                          This will import storage bucket configurations from an export file.
                        </p>
                        <p className="font-semibold text-amber-600 dark:text-amber-400">
                          <strong>Important:</strong> Database schema must be imported via migrations. This function only imports storage buckets.
                        </p>
                        <div className="mt-4">
                          <Label htmlFor="import-file" className="text-sm font-medium">
                            Select Export JSON File
                          </Label>
                          <Input
                            id="import-file"
                            type="file"
                            accept=".json"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setImportFile(file);
                              }
                            }}
                            className="mt-2"
                          />
                          {importFile && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Selected: {importFile.name}
                            </p>
                          )}
                        </div>
                        <p className="mt-3 text-muted-foreground text-xs">
                          See the migration guide for complete instructions on importing database schema.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-md" onClick={() => setImportFile(null)}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleImportDatabase}
                      className="rounded-md"
                      disabled={isImportingDatabase || !importFile}
                    >
                      {isImportingDatabase ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Import
                        </>
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


