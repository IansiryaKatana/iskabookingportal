import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Percent, Calendar, Edit, Trash2 } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import type { DiscountCampaign } from "@/hooks/useDiscount";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { logActivity } from "@/utils/auditLog";

const DiscountCampaigns = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<DiscountCampaign | null>(null);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>(undefined);

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

  return (
    <AdminLayout
      pageTitle="Discount Campaigns"
      subtitle="Manage discount campaigns for student bookings"
      mobileActionButton={
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
              onClick={() => setEditingCampaign(null)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        </Dialog>
      }
    >
      <div className="space-y-6">
        <div className="mb-6 flex items-center justify-start md:justify-end">
          <AcademicYearSelector
            value={selectedAcademicYearId}
            onValueChange={(value) => setSelectedAcademicYearId(value)}
            className="w-full md:w-64"
            allowEmpty={true}
          />
        </div>
        <div className="hidden lg:flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display uppercase tracking-wide">Discount Campaigns</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Create and manage discount campaigns for student bookings
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full uppercase tracking-wide" onClick={() => setEditingCampaign(null)}>
                <Plus className="h-4 w-4 mr-2" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-display uppercase tracking-wide">
                  {editingCampaign ? "Edit Campaign" : "Create Discount Campaign"}
                </DialogTitle>
                <DialogDescription>
                  {editingCampaign
                    ? "Update the discount campaign details"
                    : "Create a new discount campaign for student bookings"}
                </DialogDescription>
              </DialogHeader>
              <CampaignForm
                campaign={editingCampaign}
                onSubmit={(data) => {
                  if (editingCampaign) updateMutation.mutate({ id: editingCampaign.id, data });
                  else createMutation.mutate(data);
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive"
                        onClick={() => {
                          if (confirm("Are you sure you want to deactivate this campaign?")) {
                            deleteMutation.mutate(campaign.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
                      className={isActive(campaign) ? "bg-green-600 text-white" : "bg-gray-500 text-white"}
                    >
                      {isActive(campaign) ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
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
    applies_to: "all" | "new" | "rebooking";
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
  const [appliesTo, setAppliesTo] = useState<"all" | "new" | "rebooking">(campaign?.applies_to || "all");
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
          <Select value={appliesTo} onValueChange={(v) => setAppliesTo(v as "all" | "new" | "rebooking")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Applications</SelectItem>
              <SelectItem value="new">New Applications Only</SelectItem>
              <SelectItem value="rebooking">Rebooking Only</SelectItem>
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
              <SelectItem value="website">Website</SelectItem>
              <SelectItem value="rebooker">Rebooker</SelectItem>
              <SelectItem value="imported">Imported</SelectItem>
              <SelectItem value="partner_referral">Partner referral</SelectItem>
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
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-full uppercase tracking-wide">
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="rounded-full uppercase tracking-wide">
          {isSubmitting ? "Saving..." : campaign ? "Update Campaign" : "Create Campaign"}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default DiscountCampaigns;
