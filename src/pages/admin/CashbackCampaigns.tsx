import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Gift, Calendar, Users, Edit, Trash2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import type { CashbackCampaign } from "@/hooks/useCashback";
import { useRemoveCashback } from "@/hooks/useCashback";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { logActivity } from "@/utils/auditLog";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";

const CashbackCampaigns = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CashbackCampaign | null>(null);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [confirmAction, setConfirmAction] = useState<{
    action: "deactivate" | "reactivate";
    campaign: CashbackCampaign;
  } | null>(null);
  const [usageCampaign, setUsageCampaign] = useState<CashbackCampaign | null>(null);

  const removeCashback = useRemoveCashback();

  const { data: usageApplications, isLoading: isUsageLoading } = useQuery({
    queryKey: ["cashback-campaign-usage", usageCampaign?.id],
    enabled: !!usageCampaign?.id,
    queryFn: async () => {
      if (!usageCampaign?.id) return [];
      const { data, error } = await supabase
        .from("application_cashbacks")
        .select(
          `
          id,
          application_id,
          cashback_amount,
          applied_at,
          application:student_applications(
            id,
            status,
            created_at
          )
        `,
        )
        .eq("campaign_id", usageCampaign.id)
        .order("applied_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["cashback-campaigns", selectedAcademicYearId],
    enabled: true, // Always enabled - will refetch when selectedAcademicYearId changes
    queryFn: async () => {
      let query = supabase
        .from("cashback_campaigns")
        .select(`
          *,
          academic_year:academic_years(id, name)
        `)
        .order("created_at", { ascending: false });

      // Filter by academic year if selected
      // Show campaigns for the selected year OR campaigns with no academic year (applies to all)
      if (selectedAcademicYearId) {
        // Fetch campaigns matching the academic year OR null academic year
        const { data: yearCampaigns, error: yearError } = await supabase
          .from("cashback_campaigns")
          .select("*")
          .eq("academic_year_id", selectedAcademicYearId)
          .order("created_at", { ascending: false });

        const { data: allYearCampaigns, error: allYearError } = await supabase
          .from("cashback_campaigns")
          .select("*")
          .is("academic_year_id", null)
          .order("created_at", { ascending: false });

        if (yearError || allYearError) {
          console.error("Error fetching campaigns:", yearError || allYearError);
          throw yearError || allYearError;
        }

        // Fetch academic year names for campaigns that have academic_year_id
        const academicYearIds = [
          ...new Set(
            [...(yearCampaigns || [])]
              .map((c) => c.academic_year_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];

        let academicYearsMap = new Map<string, { id: string; name: string }>();
        if (academicYearIds.length > 0) {
          const { data: years } = await supabase
            .from("academic_years")
            .select("id, name")
            .in("id", academicYearIds);

          if (years) {
            years.forEach((year) => {
              academicYearsMap.set(year.id, year);
            });
          }
        }

        // Combine and enrich with academic year data
        const combined = [...(yearCampaigns || []), ...(allYearCampaigns || [])];
        const unique = combined
          .filter((campaign, index, self) => 
            index === self.findIndex((c) => c.id === campaign.id)
          )
          .map((campaign) => ({
            ...campaign,
            academic_year: campaign.academic_year_id
              ? academicYearsMap.get(campaign.academic_year_id) || null
              : null,
          }));

        return unique as CashbackCampaign[];
      }

      // Fetch academic year names for campaigns that have academic_year_id
      const academicYearIds = [
        ...new Set(
          (data || [])
            .map((c: any) => c.academic_year_id)
            .filter((id: any): id is string => Boolean(id))
        ),
      ];

      let academicYearsMap = new Map<string, { id: string; name: string }>();
      if (academicYearIds.length > 0) {
        const { data: years } = await supabase
          .from("academic_years")
          .select("id, name")
          .in("id", academicYearIds);

        if (years) {
          years.forEach((year) => {
            academicYearsMap.set(year.id, year);
          });
        }
      }

      // Enrich campaigns with academic year data
      const enriched = (data || []).map((campaign: any) => ({
        ...campaign,
        academic_year: campaign.academic_year_id
          ? academicYearsMap.get(campaign.academic_year_id) || null
          : null,
      }));

      return enriched as CashbackCampaign[];

      if (error) throw error;
      return (data || []) as CashbackCampaign[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      cashback_amount: number;
      applies_to: "all" | "new" | "rebooking" | "staff_assigned";
      start_date: string;
      end_date: string;
      max_uses?: number;
      academic_year_id?: string | null;
    }) => {
      const { data: result, error } = await supabase.from("cashback_campaigns").insert({
        ...data,
        created_by: user?.id,
      }).select("*").single();

      if (error) throw error;

      // Log cashback campaign creation
      await logActivity({
        action: "create",
        entityType: "cashback_campaign",
        entityId: result.id,
        payload: {
          name: data.name,
          cashback_amount: data.cashback_amount,
          applies_to: data.applies_to,
          start_date: data.start_date,
          end_date: data.end_date,
          academic_year_id: data.academic_year_id,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashback-campaigns"] });
      setIsDialogOpen(false);
      toast({
        title: "Campaign created",
        description: "Cashback campaign has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create campaign.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CashbackCampaign>;
    }) => {
      // Get old campaign data for logging
      const { data: oldCampaign } = await supabase
        .from("cashback_campaigns")
        .select("name, is_active, cashback_amount")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("cashback_campaigns")
        .update(data)
        .eq("id", id);

      if (error) throw error;

      // Log cashback campaign update
      await logActivity({
        action: "update",
        entityType: "cashback_campaign",
        entityId: id,
        payload: {
          changes: {
            name: data.name !== undefined
              ? { from: oldCampaign?.name, to: data.name }
              : undefined,
            is_active: data.is_active !== undefined
              ? { from: oldCampaign?.is_active, to: data.is_active }
              : undefined,
            cashback_amount: data.cashback_amount !== undefined
              ? { from: oldCampaign?.cashback_amount, to: data.cashback_amount }
              : undefined,
          },
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashback-campaigns"] });
      setIsDialogOpen(false);
      setEditingCampaign(null);
      toast({
        title: "Campaign updated",
        description: "Cashback campaign has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update campaign.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Get campaign name for logging
      const { data: campaign } = await supabase
        .from("cashback_campaigns")
        .select("name")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("cashback_campaigns")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;

      // Log cashback campaign deactivation
      await logActivity({
        action: "deactivate",
        entityType: "cashback_campaign",
        entityId: id,
        payload: {
          name: campaign?.name,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashback-campaigns"] });
      toast({
        title: "Campaign deactivated",
        description: "Cashback campaign has been deactivated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to deactivate campaign.",
        variant: "destructive",
      });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: campaign } = await supabase
        .from("cashback_campaigns")
        .select("name")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("cashback_campaigns")
        .update({ is_active: true })
        .eq("id", id);

      if (error) throw error;

      await logActivity({
        action: "reactivate",
        entityType: "cashback_campaign",
        entityId: id,
        payload: { name: campaign?.name },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashback-campaigns"] });
      toast({
        title: "Campaign reactivated",
        description: "Cashback campaign has been reactivated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reactivate campaign.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (campaign: CashbackCampaign) => {
    setEditingCampaign(campaign);
    setIsDialogOpen(true);
  };

  const handleClose = () => {
    setIsDialogOpen(false);
    setEditingCampaign(null);
  };

  const isActive = (campaign: CashbackCampaign) => {
    const today = new Date();
    const startDate = new Date(campaign.start_date);
    const endDate = new Date(campaign.end_date);
    return (
      campaign.is_active &&
      today >= startDate &&
      today <= endDate &&
      (campaign.max_uses === null || campaign.current_uses < campaign.max_uses)
    );
  };

  const isEndDatePassed = (campaign: CashbackCampaign) =>
    new Date(campaign.end_date) < new Date();

  const filteredCampaigns =
    campaigns?.filter((c) => {
      if (statusFilter === "active") return c.is_active;
      if (statusFilter === "inactive") return !c.is_active;
      return true;
    }) ?? [];

  return (
    <AdminLayout
      pageTitle="Cashback Campaigns"
      subtitle="Manage cashback campaigns for student bookings"
      mobileActionButton={
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="rounded-md uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
              onClick={() => setEditingCampaign(null)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </Dialog>
      }
    >
      <div className="space-y-6">
        <div className="mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-start md:justify-end">
          <AcademicYearSelector
            value={selectedAcademicYearId}
            onValueChange={(value) => setSelectedAcademicYearId(value)}
            className="w-full md:w-64"
            allowEmpty={true}
          />
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}
          >
            <SelectTrigger className="w-full md:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="hidden lg:flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display uppercase tracking-wide">
              Cashback Campaigns
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Create and manage cashback campaigns to incentivize bookings
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="rounded-md uppercase tracking-wide"
                onClick={() => setEditingCampaign(null)}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-display uppercase tracking-wide">
                  {editingCampaign ? "Edit Campaign" : "Create Cashback Campaign"}
                </DialogTitle>
                <DialogDescription>
                  {editingCampaign
                    ? "Update the cashback campaign details"
                    : "Create a new cashback campaign to incentivize student bookings"}
                </DialogDescription>
              </DialogHeader>
              <CampaignForm
                campaign={editingCampaign}
                onSubmit={(data) => {
                  if (editingCampaign) {
                    updateMutation.mutate({ id: editingCampaign.id, data });
                  } else {
                    createMutation.mutate(data);
                  }
                }}
                onCancel={handleClose}
                isSubmitting={createMutation.isPending || updateMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="rounded-3xl">
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                  <Skeleton className="h-4 w-48 mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : campaigns && campaigns.length > 0 ? (
          filteredCampaigns.length === 0 ? (
            <Card className="rounded-3xl border-dashed">
              <CardHeader>
                <CardTitle className="text-xl font-display uppercase tracking-wide">
                  No campaigns match filter
                </CardTitle>
                <CardDescription>
                  Try changing the status filter or academic year to see more campaigns.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCampaigns.map((campaign) => (
              <Card
                key={campaign.id}
                className={`rounded-3xl ${
                  isActive(campaign) ? "border-primary/50 bg-primary/5" : ""
                }`}
                onClick={() => setUsageCampaign(campaign)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg font-display uppercase tracking-wide flex items-center gap-2">
                        <Gift className="h-5 w-5" />
                        {campaign.name}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {campaign.description || "No description"}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(campaign);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {campaign.is_active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmAction({ action: "deactivate", campaign });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmAction({ action: "reactivate", campaign });
                          }}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Cashback Amount</span>
                    <span className="text-lg font-bold text-primary">
                      £{campaign.cashback_amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Applies To</span>
                    <Badge variant="outline" className="uppercase">
                      {campaign.applies_to}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Academic Year</span>
                    <Badge variant="outline">
                      {campaign.academic_year?.name || "All Years"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      {format(new Date(campaign.start_date), "d MMM yyyy")} -{" "}
                      {format(new Date(campaign.end_date), "d MMM yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Usage</span>
                    <span className="text-sm font-medium">
                      {campaign.current_uses}
                      {campaign.max_uses ? ` / ${campaign.max_uses}` : " / ∞"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge
                      className={
                        isActive(campaign)
                          ? "bg-green-600 text-white"
                          : "bg-gray-500 text-white"
                      }
                    >
                      {isActive(campaign) ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          )
        ) : (
          <Card className="rounded-3xl border-dashed">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide">
                No Campaigns
              </CardTitle>
              <CardDescription>
                Create your first cashback campaign to incentivize student bookings.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      {/* Campaign usage: sheet on desktop, drawer on mobile */}
      {usageCampaign &&
        (isMobile ? (
          <Drawer open={!!usageCampaign} onOpenChange={(open) => !open && setUsageCampaign(null)}>
            <DrawerContent className="max-h-[90vh] rounded-t-[28px]">
              <DrawerHeader className="text-left px-4 pt-6 pb-2">
                <DrawerTitle className="text-lg font-display uppercase tracking-wide">
                  Cashback applications
                </DrawerTitle>
                <DrawerDescription>
                  {`Applications with cashback from "${usageCampaign.name}".`}
                </DrawerDescription>
              </DrawerHeader>
              <ScrollArea className="flex-1 px-4 pb-4">
                <div className="mt-2">
                  {isUsageLoading ? (
                    <p className="text-sm text-muted-foreground">Loading applications…</p>
                  ) : !usageApplications || usageApplications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No applications currently have this cashback applied.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="border-b text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="py-2 text-left">Application</th>
                          <th className="py-2 text-left">Status</th>
                          <th className="py-2 text-left">Applied At</th>
                          <th className="py-2 text-left">Amount</th>
                          <th className="py-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usageApplications.map((row: any) => {
                          const app = row.application as {
                            id: string;
                            status: string;
                            created_at: string;
                          } | null;
                          return (
                            <tr key={row.id} className="border-b last:border-0">
                              <td className="py-2">{app?.id ?? row.application_id}</td>
                              <td className="py-2 capitalize">{app?.status ?? "—"}</td>
                              <td className="py-2">
                                {row.applied_at
                                  ? new Date(row.applied_at).toLocaleDateString("en-GB")
                                  : "—"}
                              </td>
                              <td className="py-2">
                                £{Number(row.cashback_amount || 0).toLocaleString("en-GB", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="py-2 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-md uppercase tracking-wide text-xs"
                                  disabled={removeCashback.isPending}
                                  onClick={async () => {
                                    if (!app?.id) return;
                                    try {
                                      await removeCashback.mutateAsync({ applicationId: app.id });
                                      setUsageCampaign(null);
                                      navigate(`/admin/applications/${app.id}`);
                                    } catch {
                                      // toast handled in hook
                                    }
                                  }}
                                >
                                  {removeCashback.isPending ? "Removing..." : "Remove & open"}
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </ScrollArea>
              <DrawerFooter className="px-4 pb-6">
                <Button
                  variant="outline"
                  className="rounded-md uppercase tracking-wide"
                  onClick={() => setUsageCampaign(null)}
                >
                  Close
                </Button>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        ) : (
          <Sheet open={!!usageCampaign} onOpenChange={(open) => !open && setUsageCampaign(null)}>
            <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="text-lg font-display uppercase tracking-wide">
                  Cashback applications
                </SheetTitle>
                <SheetDescription>
                  {`Applications with cashback from "${usageCampaign.name}".`}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                {isUsageLoading ? (
                  <p className="text-sm text-muted-foreground">Loading applications…</p>
                ) : !usageApplications || usageApplications.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No applications currently have this cashback applied.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 text-left">Application</th>
                        <th className="py-2 text-left">Status</th>
                        <th className="py-2 text-left">Applied At</th>
                        <th className="py-2 text-left">Amount</th>
                        <th className="py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageApplications.map((row: any) => {
                        const app = row.application as {
                          id: string;
                          status: string;
                          created_at: string;
                        } | null;
                        return (
                          <tr key={row.id} className="border-b last:border-0">
                            <td className="py-2">{app?.id ?? row.application_id}</td>
                            <td className="py-2 capitalize">{app?.status ?? "—"}</td>
                            <td className="py-2">
                              {row.applied_at
                                ? new Date(row.applied_at).toLocaleDateString("en-GB")
                                : "—"}
                            </td>
                            <td className="py-2">
                              £{Number(row.cashback_amount || 0).toLocaleString("en-GB", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td className="py-2 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-md uppercase tracking-wide text-xs"
                                disabled={removeCashback.isPending}
                                onClick={async () => {
                                  if (!app?.id) return;
                                  try {
                                    await removeCashback.mutateAsync({ applicationId: app.id });
                                    setUsageCampaign(null);
                                    navigate(`/admin/applications/${app.id}`);
                                  } catch {
                                    // toast handled in hook
                                  }
                                }}
                              >
                                {removeCashback.isPending ? "Removing..." : "Remove & open"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <SheetFooter className="mt-4">
                <Button
                  variant="outline"
                  className="rounded-md uppercase tracking-wide"
                  onClick={() => setUsageCampaign(null)}
                >
                  Close
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        ))}

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display uppercase tracking-wide">
              {confirmAction?.action === "deactivate"
                ? "Deactivate cashback campaign?"
                : "Reactivate cashback campaign?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "deactivate" ? (
                "Are you sure you want to deactivate this campaign? It will no longer be available for new applications."
              ) : confirmAction?.campaign && isEndDatePassed(confirmAction.campaign) ? (
                "This campaign's end date has passed. It will not apply to new applications until you update the dates. Reactivate anyway?"
              ) : (
                "Are you sure you want to reactivate this campaign? It will be available for new applications within its date range."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-md uppercase tracking-wide" onClick={() => setConfirmAction(null)}>
              Cancel
            </AlertDialogCancel>
            {confirmAction?.action === "deactivate" ? (
              <AlertDialogAction
                className="rounded-md uppercase tracking-wide bg-destructive hover:bg-destructive/90"
                onClick={() => {
                  if (confirmAction?.campaign.id) {
                    deleteMutation.mutate(confirmAction.campaign.id);
                    setConfirmAction(null);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Deactivating..." : "Deactivate"}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                className="rounded-md uppercase tracking-wide bg-green-600 hover:bg-green-700"
                onClick={() => {
                  if (confirmAction?.campaign.id) {
                    reactivateMutation.mutate(confirmAction.campaign.id);
                    setConfirmAction(null);
                  }
                }}
                disabled={reactivateMutation.isPending}
              >
                {reactivateMutation.isPending ? "Reactivating..." : "Reactivate"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

type CampaignFormProps = {
  campaign: CashbackCampaign | null;
  onSubmit: (data: {
    name: string;
    description?: string;
    cashback_amount: number;
    applies_to: "all" | "new" | "rebooking" | "staff_assigned";
    start_date: string;
    end_date: string;
    max_uses?: number;
    academic_year_id?: string | null;
  }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
};

const CampaignForm = ({ campaign, onSubmit, onCancel, isSubmitting }: CampaignFormProps) => {
  const [name, setName] = useState(campaign?.name || "");
  const [description, setDescription] = useState(campaign?.description || "");
  const [cashbackAmount, setCashbackAmount] = useState(campaign?.cashback_amount.toString() || "");
  const [appliesTo, setAppliesTo] = useState<"all" | "new" | "rebooking" | "staff_assigned">(
    campaign?.applies_to || "all",
  );
  const [startDate, setStartDate] = useState(
    campaign?.start_date ? format(new Date(campaign.start_date), "yyyy-MM-dd") : ""
  );
  const [endDate, setEndDate] = useState(
    campaign?.end_date ? format(new Date(campaign.end_date), "yyyy-MM-dd") : ""
  );
  const [maxUses, setMaxUses] = useState(campaign?.max_uses?.toString() || "");
  const [academicYearId, setAcademicYearId] = useState<string | undefined>(
    campaign?.academic_year_id || undefined
  );
  
  const { data: academicYears } = useAdminAcademicYears();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      cashback_amount: parseFloat(cashbackAmount),
      applies_to: appliesTo,
      start_date: startDate,
      end_date: endDate,
      max_uses: maxUses ? parseInt(maxUses) : undefined,
      academic_year_id: academicYearId || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Campaign Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Summer 2025 Cashback"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description for this campaign"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cashback_amount">Cashback Amount (£) *</Label>
          <Input
            id="cashback_amount"
            type="number"
            step="0.01"
            min="0"
            value={cashbackAmount}
            onChange={(e) => setCashbackAmount(e.target.value)}
            placeholder="500.00"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="applies_to">Applies To *</Label>
          <Select
            value={appliesTo}
            onValueChange={(v) => setAppliesTo(v as "all" | "new" | "rebooking" | "staff_assigned")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Applications</SelectItem>
              <SelectItem value="new">New Applications Only</SelectItem>
              <SelectItem value="rebooking">Rebooking Only</SelectItem>
              <SelectItem value="staff_assigned">Staff assign only (manual on application)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="start_date">Start Date *</Label>
          <Input
            id="start_date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="end_date">End Date *</Label>
          <Input
            id="end_date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="max_uses">Max Uses (Optional)</Label>
        <Input
          id="max_uses"
          type="number"
          min="1"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          placeholder="Leave empty for unlimited"
        />
        <p className="text-xs text-muted-foreground">
          Limit the number of times this campaign can be used. Leave empty for unlimited.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="academic_year_id">Academic Year (Optional)</Label>
        <Select 
          value={academicYearId || "all"} 
          onValueChange={(value) => setAcademicYearId(value === "all" ? undefined : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="All academic years" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Academic Years</SelectItem>
            {academicYears?.map((year) => (
              <SelectItem key={year.id} value={year.id}>
                {year.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select a specific academic year for this campaign, or leave as "All Academic Years" to apply to all.
        </p>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="rounded-md uppercase tracking-wide"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md uppercase tracking-wide"
        >
          {isSubmitting ? "Saving..." : campaign ? "Update Campaign" : "Create Campaign"}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default CashbackCampaigns;

