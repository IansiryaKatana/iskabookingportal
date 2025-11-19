import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Gift, Calendar, Users, Edit, Trash2 } from "lucide-react";
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
import type { CashbackCampaign } from "@/hooks/useCashback";

const CashbackCampaigns = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<CashbackCampaign | null>(null);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["cashback-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cashback_campaigns")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as CashbackCampaign[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      cashback_amount: number;
      applies_to: "all" | "new" | "rebooking";
      start_date: string;
      end_date: string;
      max_uses?: number;
    }) => {
      const { error } = await supabase.from("cashback_campaigns").insert({
        ...data,
        created_by: user?.id,
      });

      if (error) throw error;
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
      const { error } = await supabase
        .from("cashback_campaigns")
        .update(data)
        .eq("id", id);

      if (error) throw error;
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
      const { error } = await supabase
        .from("cashback_campaigns")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
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

  return (
    <AdminLayout
      pageTitle="Cashback Campaigns"
      subtitle="Manage cashback campaigns for student bookings"
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
                className="rounded-full uppercase tracking-wide"
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <Card
                key={campaign.id}
                className={`rounded-3xl ${
                  isActive(campaign) ? "border-primary/50 bg-primary/5" : ""
                }`}
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
                        onClick={() => handleEdit(campaign)}
                      >
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
    </AdminLayout>
  );
};

type CampaignFormProps = {
  campaign: CashbackCampaign | null;
  onSubmit: (data: {
    name: string;
    description?: string;
    cashback_amount: number;
    applies_to: "all" | "new" | "rebooking";
    start_date: string;
    end_date: string;
    max_uses?: number;
  }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
};

const CampaignForm = ({ campaign, onSubmit, onCancel, isSubmitting }: CampaignFormProps) => {
  const [name, setName] = useState(campaign?.name || "");
  const [description, setDescription] = useState(campaign?.description || "");
  const [cashbackAmount, setCashbackAmount] = useState(campaign?.cashback_amount.toString() || "");
  const [appliesTo, setAppliesTo] = useState<"all" | "new" | "rebooking">(
    campaign?.applies_to || "all"
  );
  const [startDate, setStartDate] = useState(
    campaign?.start_date ? format(new Date(campaign.start_date), "yyyy-MM-dd") : ""
  );
  const [endDate, setEndDate] = useState(
    campaign?.end_date ? format(new Date(campaign.end_date), "yyyy-MM-dd") : ""
  );
  const [maxUses, setMaxUses] = useState(campaign?.max_uses?.toString() || "");

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
          <Select value={appliesTo} onValueChange={(v) => setAppliesTo(v as any)}>
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

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="rounded-full uppercase tracking-wide"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full uppercase tracking-wide"
        >
          {isSubmitting ? "Saving..." : campaign ? "Update Campaign" : "Create Campaign"}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default CashbackCampaigns;

