import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Percent, Calendar, Edit, Trash2, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import type { DiscountCampaign } from "@/hooks/useDiscount";
import { BOOKING_SOURCE_OPTIONS } from "@/constants/bookingSources";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { logActivity } from "@/utils/auditLog";

const truncateText = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;

const formatCampaignDate = (value: string | Date) => format(new Date(value), "do MMMM yyyy");

const DiscountCampaigns = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<DiscountCampaign | null>(null);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [confirmAction, setConfirmAction] = useState<{
    action: "deactivate" | "reactivate";
    campaign: DiscountCampaign;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"activate" | "deactivate" | null>(null);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["discount-campaigns", selectedAcademicYearId],
    enabled: true,
    queryFn: async () => {
      if (selectedAcademicYearId) {
        const { data: yearCampaigns, error: yearError } = await supabase
          .from("discount_campaigns")
          .select("*")
          .eq("academic_year_id", selectedAcademicYearId)
          .order("created_at", { ascending: false });

        const { data: allYearCampaigns, error: allYearError } = await supabase
          .from("discount_campaigns")
          .select("*")
          .is("academic_year_id", null)
          .order("created_at", { ascending: false });

        if (yearError || allYearError) throw yearError || allYearError;

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
          if (years) years.forEach((y) => academicYearsMap.set(y.id, y));
        }

        const combined = [...(yearCampaigns || []), ...(allYearCampaigns || [])];
        const unique = combined.filter(
          (c, i, self) => i === self.findIndex((x) => x.id === c.id)
        );
        return unique.map((c) => ({
          ...c,
          academic_year: c.academic_year_id ? academicYearsMap.get(c.academic_year_id) || null : null,
        })) as DiscountCampaign[];
      }

      const { data, error } = await supabase
        .from("discount_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const academicYearIds = [
        ...new Set(
          (data || []).map((c: { academic_year_id: string | null }) => c.academic_year_id).filter((id): id is string => Boolean(id))
        ),
      ];
      let academicYearsMap = new Map<string, { id: string; name: string }>();
      if (academicYearIds.length > 0) {
        const { data: years } = await supabase
          .from("academic_years")
          .select("id, name")
          .in("id", academicYearIds);
        if (years) years.forEach((y) => academicYearsMap.set(y.id, y));
      }
      return (data || []).map((c: any) => ({
        ...c,
        academic_year: c.academic_year_id ? academicYearsMap.get(c.academic_year_id) || null : null,
      })) as DiscountCampaign[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      discount_amount: number;
      amount_type: "fixed" | "percentage";
      applies_to: "all" | "new" | "rebooking";
      booking_source?: string | null;
      start_date: string;
      end_date: string;
      max_uses?: number;
      academic_year_id?: string | null;
    }) => {
      const { data: result, error } = await supabase
        .from("discount_campaigns")
        .insert({ ...data, created_by: user?.id })
        .select("*")
        .single();
      if (error) throw error;
      await logActivity({
        action: "create",
        entityType: "discount_campaign",
        entityId: result.id,
        payload: {
          name: data.name,
          discount_amount: data.discount_amount,
          applies_to: data.applies_to,
          start_date: data.start_date,
          end_date: data.end_date,
          academic_year_id: data.academic_year_id,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discount-campaigns"] });
      setIsDialogOpen(false);
      toast({ title: "Campaign created", description: "Discount campaign has been created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create campaign.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DiscountCampaign> }) => {
      const { data: oldCampaign } = await supabase
        .from("discount_campaigns")
        .select("name, is_active, discount_amount")
        .eq("id", id)
        .single();
      const { error } = await supabase.from("discount_campaigns").update(data).eq("id", id);
      if (error) throw error;
      await logActivity({
        action: "update",
        entityType: "discount_campaign",
        entityId: id,
        payload: {
          changes: {
            name: data.name !== undefined ? { from: oldCampaign?.name, to: data.name } : undefined,
            is_active: data.is_active !== undefined ? { from: oldCampaign?.is_active, to: data.is_active } : undefined,
            discount_amount: data.discount_amount !== undefined ? { from: oldCampaign?.discount_amount, to: data.discount_amount } : undefined,
          },
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discount-campaigns"] });
      setIsDialogOpen(false);
      setEditingCampaign(null);
      toast({ title: "Campaign updated", description: "Discount campaign has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update campaign.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: campaign } = await supabase
        .from("discount_campaigns")
        .select("name")
        .eq("id", id)
        .single();
      const { error } = await supabase.from("discount_campaigns").update({ is_active: false }).eq("id", id);
      if (error) throw error;
      await logActivity({
        action: "deactivate",
        entityType: "discount_campaign",
        entityId: id,
        payload: { name: campaign?.name },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discount-campaigns"] });
      toast({ title: "Campaign deactivated", description: "Discount campaign has been deactivated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to deactivate campaign.", variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: campaign } = await supabase
        .from("discount_campaigns")
        .select("name")
        .eq("id", id)
        .single();
      const { error } = await supabase.from("discount_campaigns").update({ is_active: true }).eq("id", id);
      if (error) throw error;
      await logActivity({
        action: "reactivate",
        entityType: "discount_campaign",
        entityId: id,
        payload: { name: campaign?.name },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["discount-campaigns"] });
      toast({ title: "Campaign reactivated", description: "Discount campaign has been reactivated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to reactivate campaign.", variant: "destructive" });
    },
  });

  const bulkSetActiveMutation = useMutation({
    mutationFn: async ({ ids, is_active }: { ids: string[]; is_active: boolean }) => {
      if (ids.length === 0) return;

      const { error } = await supabase
        .from("discount_campaigns")
        .update({ is_active })
        .in("id", ids);

      if (error) throw error;

      await logActivity({
        action: is_active ? "reactivate" : "deactivate",
        entityType: "discount_campaign",
        entityId: ids.join(","),
        payload: { bulk: true, count: ids.length, ids, is_active },
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["discount-campaigns"] });
      setSelectedIds([]);
      setBulkAction(null);
      toast({
        title: variables.is_active ? "Campaigns activated" : "Campaigns deactivated",
        description: `${variables.ids.length} campaign(s) updated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update selected campaigns.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (campaign: DiscountCampaign) => {
    setEditingCampaign(campaign);
    setIsDialogOpen(true);
  };

  const handleClose = () => {
    setIsDialogOpen(false);
    setEditingCampaign(null);
  };

  const isActive = (campaign: DiscountCampaign) => {
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

  const isEndDatePassed = (campaign: DiscountCampaign) =>
    new Date(campaign.end_date) < new Date();

  const filteredCampaigns =
    campaigns?.filter((c) => {
      if (statusFilter === "active") return c.is_active;
      if (statusFilter === "inactive") return !c.is_active;
      return true;
    }) ?? [];

  const allSelected =
    filteredCampaigns.length > 0 && selectedIds.length === filteredCampaigns.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : filteredCampaigns.map((c) => c.id));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <AdminLayout
      pageTitle="Discount Campaigns"
      subtitle="Manage discount campaigns for student bookings"
      mobileActionButton={
        <Button
          size="sm"
          className="rounded-md uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
          onClick={() => {
            setEditingCampaign(null);
            setIsDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      }
      pageToolbar={
        <Button
          className="rounded-md uppercase tracking-wide gap-2"
          onClick={() => {
            setEditingCampaign(null);
            setIsDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-start md:justify-end">
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

        <Sheet
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) setEditingCampaign(null);
          }}
        >
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="text-lg font-display uppercase tracking-wide">
                {editingCampaign ? "Edit Campaign" : "Create Discount Campaign"}
              </SheetTitle>
              <SheetDescription>
                {editingCampaign
                  ? "Update the discount campaign details"
                  : "Create a new discount campaign for student bookings"}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4">
              <CampaignForm
                campaign={editingCampaign}
                onSubmit={(data) => {
                  if (editingCampaign) updateMutation.mutate({ id: editingCampaign.id, data });
                  else createMutation.mutate(data);
                }}
                onCancel={handleClose}
                isSubmitting={createMutation.isPending || updateMutation.isPending}
              />
            </div>
          </SheetContent>
        </Sheet>

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
            <>
              {/* Desktop: table row layout */}
              <div className="hidden lg:block">
                {selectedIds.length > 0 && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border bg-muted/40 px-4 py-3">
                    <Badge variant="secondary" className="uppercase tracking-wide">
                      {selectedIds.length} selected
                    </Badge>
                    <div className="flex-1" />
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md uppercase tracking-wide gap-2"
                      disabled={bulkSetActiveMutation.isPending}
                      onClick={() => setBulkAction("activate")}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Activate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md uppercase tracking-wide gap-2 text-destructive hover:text-destructive"
                      disabled={bulkSetActiveMutation.isPending}
                      onClick={() => setBulkAction("deactivate")}
                    >
                      <Trash2 className="h-4 w-4" />
                      Deactivate
                    </Button>
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-12">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all campaigns"
                        />
                      </TableHead>
                      <TableHead className="uppercase tracking-wide text-xs">Name</TableHead>
                      <TableHead className="uppercase tracking-wide text-xs text-right">Amount</TableHead>
                      <TableHead className="uppercase tracking-wide text-xs">Applies To</TableHead>
                      <TableHead className="uppercase tracking-wide text-xs">Booking Source</TableHead>
                      <TableHead className="uppercase tracking-wide text-xs">Academic Year</TableHead>
                      <TableHead className="uppercase tracking-wide text-xs">Dates</TableHead>
                      <TableHead className="uppercase tracking-wide text-xs text-right">Usage</TableHead>
                      <TableHead className="uppercase tracking-wide text-xs">Status</TableHead>
                      <TableHead className="uppercase tracking-wide text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCampaigns.map((campaign) => (
                      <TableRow
                        key={campaign.id}
                        data-state={selectedIds.includes(campaign.id) ? "selected" : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(campaign.id)}
                            onCheckedChange={() => toggleSelection(campaign.id)}
                            aria-label={`Select ${campaign.name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium max-w-xs">
                          <div className="flex items-start gap-2">
                            <Percent className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="font-sans font-medium truncate">
                                {campaign.name}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {truncateText(campaign.description || "No description", 30)}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary tabular-nums whitespace-nowrap">
                          {campaign.amount_type === "percentage"
                            ? `${campaign.discount_amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}%`
                            : `£${campaign.discount_amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="uppercase">
                            {campaign.applies_to}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {campaign.booking_source || "All Sources"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {campaign.academic_year?.name || "All Years"}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatCampaignDate(campaign.start_date)} -{" "}
                            {formatCampaignDate(campaign.end_date)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {campaign.current_uses}
                          {campaign.max_uses ? ` / ${campaign.max_uses}` : " / ∞"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              isActive(campaign)
                                ? "bg-green-600 text-white"
                                : "bg-gray-500 text-white"
                            }
                          >
                            {isActive(campaign) ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleEdit(campaign)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {campaign.is_active ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive"
                                onClick={() => setConfirmAction({ action: "deactivate", campaign })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                                onClick={() => setConfirmAction({ action: "reactivate", campaign })}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile & tablet: card layout */}
              <div className="grid gap-4 md:grid-cols-2 lg:hidden">
                {filteredCampaigns.map((campaign) => (
                  <Card
                    key={campaign.id}
                    className={`rounded-3xl ${isActive(campaign) ? "border-primary/50 bg-primary/5" : ""}`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg font-display uppercase tracking-wide flex items-center gap-2">
                            <Percent className="h-5 w-5" />
                            {campaign.name}
                          </CardTitle>
                          <CardDescription className="mt-2">{campaign.description || "No description"}</CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEdit(campaign)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          {campaign.is_active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive"
                              onClick={() => setConfirmAction({ action: "deactivate", campaign })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700"
                              onClick={() => setConfirmAction({ action: "reactivate", campaign })}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Discount Amount</span>
                        <span className="text-lg font-bold text-primary">
                          {campaign.amount_type === "percentage"
                            ? `${campaign.discount_amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}%`
                            : `£${campaign.discount_amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })}`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Amount Type</span>
                        <Badge variant="outline" className="uppercase">
                          {campaign.amount_type}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Applies To</span>
                        <Badge variant="outline" className="uppercase">
                          {campaign.applies_to}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Booking Source</span>
                        <Badge variant="outline">
                          {campaign.booking_source || "All Sources"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Academic Year</span>
                        <Badge variant="outline">{campaign.academic_year?.name || "All Years"}</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {formatCampaignDate(campaign.start_date)} -{" "}
                          {formatCampaignDate(campaign.end_date)}
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
                          className={isActive(campaign) ? "bg-green-600 text-white" : "bg-gray-500 text-white"}
                        >
                          {isActive(campaign) ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )
        ) : (
          <Card className="rounded-3xl border-dashed">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide">No Campaigns</CardTitle>
              <CardDescription>
                Create your first discount campaign for student bookings.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display uppercase tracking-wide">
              {confirmAction?.action === "deactivate"
                ? "Deactivate discount campaign?"
                : "Reactivate discount campaign?"}
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

      <AlertDialog open={!!bulkAction} onOpenChange={(open) => !open && setBulkAction(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display uppercase tracking-wide">
              {bulkAction === "deactivate"
                ? "Deactivate campaigns?"
                : "Activate campaigns?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "deactivate"
                ? `Are you sure you want to deactivate ${selectedIds.length} selected campaign(s)? They will no longer be available for new applications.`
                : `Are you sure you want to activate ${selectedIds.length} selected campaign(s)?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-md uppercase tracking-wide">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={`rounded-md uppercase tracking-wide ${
                bulkAction === "deactivate"
                  ? "bg-destructive hover:bg-destructive/90"
                  : "bg-green-600 hover:bg-green-700"
              }`}
              disabled={bulkSetActiveMutation.isPending}
              onClick={() =>
                bulkSetActiveMutation.mutate({
                  ids: selectedIds,
                  is_active: bulkAction === "activate",
                })
              }
            >
              {bulkSetActiveMutation.isPending
                ? "Saving..."
                : bulkAction === "deactivate"
                  ? "Deactivate"
                  : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

type CampaignFormProps = {
  campaign: DiscountCampaign | null;
  onSubmit: (data: {
    name: string;
    description?: string;
    discount_amount: number;
    amount_type: "fixed" | "percentage";
    applies_to: "all" | "new" | "rebooking" | "staff_assigned";
    booking_source?: string | null;
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
  const [discountAmount, setDiscountAmount] = useState(campaign?.discount_amount.toString() || "");
  const [amountType, setAmountType] = useState<"fixed" | "percentage">(campaign?.amount_type || "fixed");
  const [appliesTo, setAppliesTo] = useState<"all" | "new" | "rebooking" | "staff_assigned">(
    campaign?.applies_to || "all",
  );
  const [bookingSource, setBookingSource] = useState<string>(campaign?.booking_source || "");
  const [startDate, setStartDate] = useState(
    campaign?.start_date ? format(new Date(campaign.start_date), "yyyy-MM-dd") : ""
  );
  const [endDate, setEndDate] = useState(
    campaign?.end_date ? format(new Date(campaign.end_date), "yyyy-MM-dd") : ""
  );
  const [maxUses, setMaxUses] = useState(campaign?.max_uses?.toString() || "");
  const [academicYearId, setAcademicYearId] = useState<string | undefined>(campaign?.academic_year_id || undefined);
  const { data: academicYears } = useAdminAcademicYears();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      discount_amount: parseFloat(discountAmount),
      amount_type: amountType,
      applies_to: appliesTo,
      booking_source: bookingSource || null,
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
          placeholder="e.g., Early Bird Discount 2025"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="discount_amount">Discount Amount *</Label>
          <Input
            id="discount_amount"
            type="number"
            step="0.01"
            min="0"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
            placeholder={amountType === "percentage" ? "10.00 (for 10%)" : "200.00 (£)"}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="amount_type">Amount Type *</Label>
          <Select value={amountType} onValueChange={(v) => setAmountType(v as "fixed" | "percentage")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed Amount (£)</SelectItem>
              <SelectItem value="percentage">Percentage (%)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
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
        <div className="space-y-2">
          <Label htmlFor="booking_source">Booking Source</Label>
          <Select
            value={bookingSource || "all"}
            onValueChange={(value) => setBookingSource(value === "all" ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All booking sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All booking sources</SelectItem>
              {BOOKING_SOURCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Choose a specific source to target, or \"All booking sources\".
          </p>
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
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-md uppercase tracking-wide">
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="rounded-md uppercase tracking-wide">
          {isSubmitting ? "Saving..." : campaign ? "Update Campaign" : "Create Campaign"}
        </Button>
      </div>
    </form>
  );
};

export default DiscountCampaigns;
