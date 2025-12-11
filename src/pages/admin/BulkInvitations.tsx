import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useApplicationsWithPlaceholders,
  useSendBulkInvitations,
  type ApplicationWithInvitation,
} from "@/hooks/useBulkInvitations";
import { useAdminAcademicYears } from "@/hooks/useAdminAcademicYears";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { Mail, Send, Users, CheckCircle2, Clock, XCircle, Loader2, Filter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";

const BulkInvitations = () => {
  const { toast } = useToast();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>();
  const [contractFilter, setContractFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedApplications, setSelectedApplications] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [emailTemplateId, setEmailTemplateId] = useState<string>("default");
  const [resend, setResend] = useState(false);

  const { data: academicYears } = useAdminAcademicYears();
  const { data: contracts } = useAdminContracts(selectedAcademicYearId);
  const { data: templates } = useEmailTemplates();
  const { data: applications, isLoading } = useApplicationsWithPlaceholders({
    academic_year_id: selectedAcademicYearId,
    contract_id: contractFilter !== "all" ? contractFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const sendInvitations = useSendBulkInvitations();

  // Filter applications
  const filteredApplications = useMemo(() => {
    if (!applications) return [];
    return applications;
  }, [applications]);

  // Statistics
  const stats = useMemo(() => {
    const total = filteredApplications.length;
    const pending = filteredApplications.filter(
      (app) => app.account_status === "pending_activation"
    ).length;
    const invited = filteredApplications.filter(
      (app) => app.account_status === "invited"
    ).length;
    const activated = filteredApplications.filter(
      (app) => app.account_status === "activated" || app.account_status === "active"
    ).length;

    return { total, pending, invited, activated };
  }, [filteredApplications]);

  const handleSelectAll = () => {
    if (selectedApplications.size === filteredApplications.length) {
      setSelectedApplications(new Set());
    } else {
      setSelectedApplications(new Set(filteredApplications.map((app) => app.id)));
    }
  };

  const handleSelectApplication = (applicationId: string) => {
    const newSelected = new Set(selectedApplications);
    if (newSelected.has(applicationId)) {
      newSelected.delete(applicationId);
    } else {
      newSelected.add(applicationId);
    }
    setSelectedApplications(newSelected);
  };

  const handleSendInvitations = async () => {
    if (selectedApplications.size === 0) {
      toast({
        title: "No applications selected",
        description: "Please select at least one application to invite.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await sendInvitations.mutateAsync({
        application_ids: Array.from(selectedApplications),
        email_template_id: emailTemplateId === "default" ? undefined : emailTemplateId,
        resend,
      });

      toast({
        title: "Invitations sent",
        description: `Successfully sent ${result.sent} invitation(s). ${result.skipped} skipped, ${result.failed} failed.`,
      });

      setDialogOpen(false);
      setSelectedApplications(new Set());
      setEmailTemplateId("default");
      setResend(false);
    } catch (error: any) {
      console.error("Failed to send invitations:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send invitations. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status?: string) => {
    const statusConfig: Record<string, { className: string; label: string; icon: any }> = {
      pending_activation: {
        className: "bg-gray-500 hover:bg-gray-600 text-white",
        label: "Pending",
        icon: Clock,
      },
      invited: {
        className: "bg-blue-500 hover:bg-blue-600 text-white",
        label: "Invited",
        icon: Mail,
      },
      activated: {
        className: "bg-green-500 hover:bg-green-600 text-white",
        label: "Activated",
        icon: CheckCircle2,
      },
      active: {
        className: "bg-green-500 hover:bg-green-600 text-white",
        label: "Active",
        icon: CheckCircle2,
      },
    };

    const config = statusConfig[status || "pending_activation"] || statusConfig.pending_activation;
    const Icon = config.icon;

    return (
      <Badge className={`${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const invitationTemplates = useMemo(() => {
    return templates?.filter((t) => t.is_active) || [];
  }, [templates]);

  return (
    <AdminLayout
      pageTitle="Bulk Account Invitations"
      subtitle="Send account activation invitations to imported students"
    >
      <div className="space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Applications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Activation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Invited</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.invited}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Activated</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.activated}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Filters & Actions</CardTitle>
            <CardDescription>Filter applications and send invitations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Academic Year</Label>
                <AcademicYearSelector
                  value={selectedAcademicYearId}
                  onValueChange={setSelectedAcademicYearId}
                />
              </div>
              <div className="space-y-2">
                <Label>Contract</Label>
                <Select value={contractFilter} onValueChange={setContractFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All contracts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Contracts</SelectItem>
                    {contracts?.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending_activation">Pending Activation</SelectItem>
                    <SelectItem value="invited">Invited</SelectItem>
                    <SelectItem value="activated">Activated</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedApplications.size === filteredApplications.length && filteredApplications.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                <Label>
                  Select All ({selectedApplications.size} selected)
                </Label>
              </div>
              <Button
                onClick={() => setDialogOpen(true)}
                disabled={selectedApplications.size === 0 || sendInvitations.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                Send Invitations ({selectedApplications.size})
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Applications List */}
        <Card>
          <CardHeader>
            <CardTitle>Applications</CardTitle>
            <CardDescription>
              {filteredApplications.length} application(s) found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredApplications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No applications found matching your filters.
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <div className="space-y-2">
                  {filteredApplications.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedApplications.has(app.id)}
                        onCheckedChange={() => handleSelectApplication(app.id)}
                      />
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <div className="font-medium">{app.student_name || app.student_email}</div>
                          <div className="text-sm text-muted-foreground">{app.student_email}</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium">{app.contract?.name || "N/A"}</div>
                          <div className="text-xs text-muted-foreground">
                            {app.contract?.academic_years?.name || ""}
                          </div>
                        </div>
                        <div>
                          {getStatusBadge(app.account_status)}
                          {app.invitation_sent_at && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Sent: {format(new Date(app.invitation_sent_at), "MMM d, yyyy")}
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(app.created_at), "MMM d, yyyy")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Send Invitations Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Account Invitations</DialogTitle>
              <DialogDescription>
                Send invitation emails to {selectedApplications.size} selected student(s)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Email Template (Optional)</Label>
                <Select value={emailTemplateId} onValueChange={setEmailTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Use default invitation email" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default Invitation Email</SelectItem>
                    {invitationTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  If no template is selected, the default password reset email will be sent.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="resend"
                  checked={resend}
                  onCheckedChange={(checked) => setResend(checked === true)}
                />
                <Label htmlFor="resend" className="cursor-pointer">
                  Resend to already invited users
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSendInvitations}
                disabled={sendInvitations.isPending}
              >
                {sendInvitations.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Invitations
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default BulkInvitations;

