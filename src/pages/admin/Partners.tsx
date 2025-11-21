import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Users, Percent, Mail, Phone, Edit, Trash2, UserPlus } from "lucide-react";
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
import type { Partner } from "@/hooks/usePartners";

const Partners = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [createAccountDialogOpen, setCreateAccountDialogOpen] = useState(false);
  const [selectedPartnerForAccount, setSelectedPartnerForAccount] = useState<Partner | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountFirstName, setAccountFirstName] = useState("");
  const [accountLastName, setAccountLastName] = useState("");

  const { data: partners, isLoading } = useQuery({
    queryKey: ["partners"],
    queryFn: async () => {
      const { data: partnersData, error: partnersError } = await supabase
        .from("partners")
        .select("*")
        .order("name", { ascending: true });

      if (partnersError) throw partnersError;

      // Check which partners have accounts
      const partnerIds = (partnersData || []).map((p) => p.id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("partner_id")
        .in("partner_id", partnerIds);

      const partnerIdsWithAccounts = new Set(
        (profilesData || []).map((p) => p.partner_id).filter((id): id is string => Boolean(id)),
      );

      return (partnersData || []).map((p) => ({
        ...p,
        has_account: partnerIdsWithAccounts.has(p.id),
      })) as (Partner & { has_account: boolean })[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      contact_name?: string;
      contact_email?: string;
      contact_phone?: string;
      commission_percentage: number;
      referral_code?: string;
      notes?: string;
    }) => {
      const { error } = await supabase.from("partners").insert(data);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      setIsDialogOpen(false);
      toast({
        title: "Partner created",
        description: "Partner has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create partner.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Partner> }) => {
      const { error } = await supabase.from("partners").update(data).eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      setIsDialogOpen(false);
      setEditingPartner(null);
      toast({
        title: "Partner updated",
        description: "Partner has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update partner.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("partners")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      toast({
        title: "Partner deactivated",
        description: "Partner has been deactivated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to deactivate partner.",
        variant: "destructive",
      });
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: async ({ partnerId, email, firstName, lastName }: {
      partnerId: string;
      email: string;
      firstName: string;
      lastName: string;
    }) => {
      // Validate inputs before sending
      if (!partnerId || !email || !firstName || !lastName) {
        throw new Error("All fields are required");
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error("Invalid email format");
      }

      console.log("Creating partner account with:", { partnerId, email, firstName, lastName });

      // Use fetch directly to get better error handling
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 
                          import.meta.env.SUPABASE_ANON_KEY || 
                          import.meta.env.SUPABASE_PUBLISHABLE_KEY;
      
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token;

      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/create-partner-account`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken || supabaseKey}`,
              apikey: supabaseKey,
            },
            body: JSON.stringify({
              partner_id: partnerId,
              email: email.trim(),
              first_name: firstName.trim(),
              last_name: lastName.trim(),
            }),
          }
        );

        const responseData = await response.json();

        if (!response.ok) {
          const errorMessage = responseData?.error || `Server error: ${response.status}`;
          console.error("Edge function error:", errorMessage);
          console.error("Full response:", responseData);
          throw new Error(errorMessage);
        }

        if (responseData?.error) {
          console.error("Edge function returned error:", responseData.error);
          throw new Error(responseData.error);
        }

        return responseData;
      } catch (fetchError: any) {
        // If it's already an Error with a message, throw it
        if (fetchError instanceof Error && fetchError.message) {
          throw fetchError;
        }
        
        // Otherwise, try to extract from the error
        console.error("Fetch error:", fetchError);
        throw new Error(fetchError?.message || "Failed to create partner account");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partners"] });
      setCreateAccountDialogOpen(false);
      setSelectedPartnerForAccount(null);
      setAccountEmail("");
      setAccountFirstName("");
      setAccountLastName("");
      toast({
        title: "Account created",
        description: "Partner account created. Password reset email sent.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create partner account.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (partner: Partner) => {
    setEditingPartner(partner);
    setIsDialogOpen(true);
  };

  const handleClose = () => {
    setIsDialogOpen(false);
    setEditingPartner(null);
  };

  return (
    <AdminLayout
      pageTitle="Partners"
      subtitle="Manage partner referral program and commission rates"
      mobileActionButton={
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="rounded-full uppercase tracking-wide gap-2 flex-shrink-0 h-7 px-2 text-xs"
              onClick={() => setEditingPartner(null)}
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
            <h2 className="text-2xl font-display uppercase tracking-wide">Partners</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Manage partners who refer students and track commission rates
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="rounded-full uppercase tracking-wide"
                onClick={() => setEditingPartner(null)}
              >
                <Plus className="h-4 w-4 mr-2" />
                New Partner
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-lg font-display uppercase tracking-wide">
                  {editingPartner ? "Edit Partner" : "Create Partner"}
                </DialogTitle>
                <DialogDescription>
                  {editingPartner
                    ? "Update the partner information and commission rate"
                    : "Add a new partner to the referral program"}
                </DialogDescription>
              </DialogHeader>
              <PartnerForm
                partner={editingPartner}
                onSubmit={(data) => {
                  if (editingPartner) {
                    updateMutation.mutate({ id: editingPartner.id, data });
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
        ) : partners && partners.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {partners.map((partner) => (
              <Card
                key={partner.id}
                className={`rounded-3xl ${
                  partner.is_active ? "" : "opacity-60 border-dashed"
                }`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg font-display uppercase tracking-wide flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        {partner.name}
                      </CardTitle>
                      {partner.contact_name && (
                        <CardDescription className="mt-2">
                          Contact: {partner.contact_name}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => handleEdit(partner)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive"
                        onClick={() => {
                          if (confirm("Are you sure you want to deactivate this partner?")) {
                            deleteMutation.mutate(partner.id);
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
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Percent className="h-4 w-4" />
                      Commission
                    </span>
                    <span className="text-lg font-bold text-primary">
                      {partner.commission_percentage}%
                    </span>
                  </div>
                  {partner.referral_code && (
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="font-mono">
                        {partner.referral_code}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Referral Code</span>
                    </div>
                  )}
                  {partner.contact_email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span className="truncate">{partner.contact_email}</span>
                    </div>
                  )}
                  {partner.contact_phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{partner.contact_phone}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge
                      className={
                        partner.is_active
                          ? "bg-green-600 text-white"
                          : "bg-gray-500 text-white"
                      }
                    >
                      {partner.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="pt-2 border-t">
                    {partner.has_account ? (
                      <Badge variant="outline" className="w-full justify-center">
                        Account Created
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full rounded-full uppercase tracking-wide gap-2"
                        onClick={() => {
                          setSelectedPartnerForAccount(partner);
                          setAccountEmail(partner.contact_email || "");
                          setAccountFirstName(partner.contact_name?.split(" ")[0] || "");
                          setAccountLastName(partner.contact_name?.split(" ").slice(1).join(" ") || "");
                          setCreateAccountDialogOpen(true);
                        }}
                      >
                        <UserPlus className="h-4 w-4" />
                        Create Account
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="rounded-3xl border-dashed">
            <CardHeader>
              <CardTitle className="text-xl font-display uppercase tracking-wide">
                No Partners
              </CardTitle>
              <CardDescription>
                Create your first partner to start the referral program.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Create Account Dialog */}
        <Dialog open={createAccountDialogOpen} onOpenChange={setCreateAccountDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-display uppercase tracking-wide">
                Create Partner Account
              </DialogTitle>
              <DialogDescription>
                Create a user account for {selectedPartnerForAccount?.name}. They will receive a password reset email.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="account-email">Email *</Label>
                <Input
                  id="account-email"
                  type="email"
                  value={accountEmail}
                  onChange={(e) => setAccountEmail(e.target.value)}
                  placeholder="partner@example.com"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="account-first-name">First Name *</Label>
                  <Input
                    id="account-first-name"
                    value={accountFirstName}
                    onChange={(e) => setAccountFirstName(e.target.value)}
                    placeholder="First name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-last-name">Last Name *</Label>
                  <Input
                    id="account-last-name"
                    value={accountLastName}
                    onChange={(e) => setAccountLastName(e.target.value)}
                    placeholder="Last name"
                    required
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateAccountDialogOpen(false);
                  setSelectedPartnerForAccount(null);
                }}
                className="rounded-full uppercase tracking-wide"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedPartnerForAccount && accountEmail && accountFirstName && accountLastName) {
                    createAccountMutation.mutate({
                      partnerId: selectedPartnerForAccount.id,
                      email: accountEmail,
                      firstName: accountFirstName,
                      lastName: accountLastName,
                    });
                  }
                }}
                disabled={!accountEmail || !accountFirstName || !accountLastName || createAccountMutation.isPending}
                className="rounded-full uppercase tracking-wide"
              >
                {createAccountMutation.isPending ? "Creating..." : "Create Account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

type PartnerFormProps = {
  partner: Partner | null;
  onSubmit: (data: {
    name: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    commission_percentage: number;
    referral_code?: string;
    notes?: string;
  }) => void;
  onCancel: () => void;
  isSubmitting: boolean;
};

const PartnerForm = ({
  partner,
  onSubmit,
  onCancel,
  isSubmitting,
}: PartnerFormProps) => {
  const [name, setName] = useState(partner?.name || "");
  const [contactName, setContactName] = useState(partner?.contact_name || "");
  const [contactEmail, setContactEmail] = useState(partner?.contact_email || "");
  const [contactPhone, setContactPhone] = useState(partner?.contact_phone || "");
  const [commissionPercentage, setCommissionPercentage] = useState(
    partner?.commission_percentage.toString() || "5.00"
  );
  const [referralCode, setReferralCode] = useState(partner?.referral_code || "");
  const [notes, setNotes] = useState(partner?.notes || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      contact_name: contactName || undefined,
      contact_email: contactEmail || undefined,
      contact_phone: contactPhone || undefined,
      commission_percentage: parseFloat(commissionPercentage),
      referral_code: referralCode.trim().toUpperCase() || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Partner Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., University Partnership"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="contact_name">Contact Name</Label>
          <Input
            id="contact_name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="John Doe"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="commission_percentage">Commission % *</Label>
          <Input
            id="commission_percentage"
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={commissionPercentage}
            onChange={(e) => setCommissionPercentage(e.target.value)}
            placeholder="5.00"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="contact_email">Contact Email</Label>
          <Input
            id="contact_email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="contact@partner.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact_phone">Contact Phone</Label>
          <Input
            id="contact_phone"
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+44 123 456 7890"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="referral_code">Referral Code</Label>
        <Input
          id="referral_code"
          value={referralCode}
          onChange={(e) => setReferralCode(e.target.value.toUpperCase().trim())}
          placeholder="e.g., UNI2025"
          maxLength={20}
        />
        <p className="text-xs text-muted-foreground">
          Unique code that students will enter during application. Leave empty to skip.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional notes about this partner"
          rows={3}
        />
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
          {isSubmitting ? "Saving..." : partner ? "Update Partner" : "Create Partner"}
        </Button>
      </DialogFooter>
    </form>
  );
};

export default Partners;

