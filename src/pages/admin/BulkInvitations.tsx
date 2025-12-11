import { useState, useMemo, useEffect } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 8;

const BulkInvitations = () => {
  const { toast } = useToast();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>();
  const [contractFilter, setContractFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedApplications, setSelectedApplications] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [emailTemplateId, setEmailTemplateId] = useState<string>("default");
  const [resend, setResend] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sendToAll, setSendToAll] = useState(true);

  const { data: academicYears } = useAdminAcademicYears();
  const { data: contracts } = useAdminContracts(selectedAcademicYearId);
  const { data: templates } = useEmailTemplates();
  const { data: applications, isLoading, refetch } = useApplicationsWithPlaceholders({
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

  // Pagination
  const totalPages = Math.ceil(filteredApplications.length / ITEMS_PER_PAGE);
  const paginatedApplications = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredApplications.slice(startIndex, endIndex);
  }, [filteredApplications, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedAcademicYearId, contractFilter, statusFilter]);

  // Get applications to send invitations to
  const applicationsToSend = useMemo(() => {
    if (sendToAll) {
      return Array.from(selectedApplications);
    } else {
      // Only send to selected applications on current page
      const currentPageIds = new Set(paginatedApplications.map((app) => app.id));
      return Array.from(selectedApplications).filter((id) => currentPageIds.has(id));
    }
  }, [selectedApplications, sendToAll, paginatedApplications]);

  // Statistics
  const stats = useMemo(() => {
    const total = filteredApplications.length;
    const pending = filteredApplications.filter(
      (app) => app.account_status === "pending_activation"
    ).length;
    const invited = filteredApplications.filter(
      (app) => app.account_status === "invited"
    ).length;
    // Activated: anything that's not pending_activation or invited
    // This includes: "activated", "active", undefined, null, or any other status
    const activated = filteredApplications.filter(
      (app) => app.account_status !== "pending_activation" && app.account_status !== "invited"
    ).length;

    return { total, pending, invited, activated };
  }, [filteredApplications]);

  const handleSelectAll = () => {
    // Select all on current page
    const currentPageIds = paginatedApplications.map((app) => app.id);
    const allCurrentPageSelected = currentPageIds.every((id) => selectedApplications.has(id));
    
    const newSelected = new Set(selectedApplications);
    if (allCurrentPageSelected) {
      // Deselect all on current page
      currentPageIds.forEach((id) => newSelected.delete(id));
    } else {
      // Select all on current page
      currentPageIds.forEach((id) => newSelected.add(id));
    }
    setSelectedApplications(newSelected);
  };

  const handleSelectAllPages = () => {
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
    const appsToSend = applicationsToSend;
    
    if (appsToSend.length === 0) {
      toast({
        title: "No applications selected",
        description: "Please select at least one application to invite.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await sendInvitations.mutateAsync({
        application_ids: appsToSend,
        email_template_id: emailTemplateId === "default" ? undefined : emailTemplateId,
        resend,
      });

      toast({
        title: "Invitations sent",
        description: `Successfully sent ${result.sent} invitation(s). ${result.skipped} skipped, ${result.failed} failed.`,
      });

      // Refetch applications to update stats and status
      await refetch();

      setDialogOpen(false);
      // Only clear selections for sent applications
      const newSelected = new Set(selectedApplications);
      appsToSend.forEach((id) => newSelected.delete(id));
      setSelectedApplications(newSelected);
      setEmailTemplateId("default");
      setResend(false);
      setSendToAll(true);
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
    // If status is pending_activation, show pending
    if (status === "pending_activation") {
      return (
        <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
    }
    
    // If status is invited, show invited
    if (status === "invited") {
      return (
        <Badge className="bg-blue-500 hover:bg-blue-600 text-white rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1">
          <Mail className="h-3 w-3" />
          Invited
        </Badge>
      );
    }
    
    // Everything else (activated, active, undefined, null, etc.) is considered activated
    return (
      <Badge className="bg-green-500 hover:bg-green-600 text-white rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Activated
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
              <CardDescription className="text-xs md:text-sm">Total Applications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs md:text-sm">Pending Activation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold text-gray-600">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs md:text-sm">Invited</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold text-blue-600">{stats.invited}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-xs md:text-sm">Activated</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold text-green-600">{stats.activated}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Filters & Actions</CardTitle>
            <CardDescription className="text-xs md:text-sm">Filter applications and send invitations</CardDescription>
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

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-4 border-t gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={paginatedApplications.length > 0 && paginatedApplications.every((app) => selectedApplications.has(app.id))}
                    onCheckedChange={handleSelectAll}
                  />
                  <Label>
                    Select Current Page ({paginatedApplications.filter((app) => selectedApplications.has(app.id)).length}/{paginatedApplications.length})
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedApplications.size === filteredApplications.length && filteredApplications.length > 0}
                    onCheckedChange={handleSelectAllPages}
                  />
                  <Label>
                    Select All Pages ({selectedApplications.size}/{filteredApplications.length})
                  </Label>
                </div>
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
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Applications</CardTitle>
            <CardDescription className="text-xs md:text-sm">
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
              <div className="text-center py-8 text-muted-foreground text-sm">
                No applications found matching your filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={paginatedApplications.length > 0 && paginatedApplications.every((app) => selectedApplications.has(app.id))}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="text-xs md:text-sm font-semibold uppercase">Student</TableHead>
                      <TableHead className="text-xs md:text-sm font-semibold uppercase">Contract</TableHead>
                      <TableHead className="text-xs md:text-sm font-semibold uppercase">Academic Year</TableHead>
                      <TableHead className="text-xs md:text-sm font-semibold uppercase">Status</TableHead>
                      <TableHead className="text-xs md:text-sm font-semibold uppercase">Invitation Sent</TableHead>
                      <TableHead className="text-xs md:text-sm font-semibold uppercase">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedApplications.map((app) => (
                      <TableRow key={app.id} className="hover:bg-muted/50">
                        <TableCell>
                          <Checkbox
                            checked={selectedApplications.has(app.id)}
                            onCheckedChange={() => handleSelectApplication(app.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{app.student_name || app.student_email}</div>
                            <div className="text-xs text-muted-foreground">{app.student_email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{app.contract?.name || "N/A"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {app.contract?.academic_year?.name || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(app.account_status)}
                        </TableCell>
                        <TableCell>
                          {app.invitation_sent_at ? (
                            <Badge className="bg-green-500 hover:bg-green-600 text-white rounded-full px-2.5 py-0.5 text-xs font-medium">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Sent
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-400 hover:bg-gray-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium">
                              <XCircle className="h-3 w-3 mr-1" />
                              Not Sent
                            </Badge>
                          )}
                          {app.invitation_sent_at && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(new Date(app.invitation_sent_at), "MMM d, yyyy")}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(app.created_at), "MMM d, yyyy")}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {!isLoading && filteredApplications.length > ITEMS_PER_PAGE && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredApplications.length)} of {filteredApplications.length} applications
                </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => setCurrentPage(page)}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      } else if (page === currentPage - 2 || page === currentPage + 2) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }
                      return null;
                    })}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Send Invitations Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Send Account Invitations</DialogTitle>
              <DialogDescription className="text-xs md:text-sm">
                Send invitation emails to {applicationsToSend.length} selected student(s)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Send To</Label>
                <Select value={sendToAll ? "all" : "current"} onValueChange={(value) => setSendToAll(value === "all")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Selected ({selectedApplications.size} applications)</SelectItem>
                    <SelectItem value="current">Current Page Only ({applicationsToSend.length} applications)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {sendToAll 
                    ? `Will send invitations to all ${selectedApplications.size} selected applications across all pages.`
                    : `Will send invitations to ${applicationsToSend.length} selected applications on the current page only.`}
                </p>
              </div>
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

