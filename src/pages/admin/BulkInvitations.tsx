import { useState, useMemo, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useApplicationsWithPlaceholders,
  useSendBulkInvitations,
  useSetTempPasswords,
  type TempPasswordResult,
} from "@/hooks/useBulkInvitations";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { Mail, Send, CheckCircle2, Clock, XCircle, Loader2, Search, KeyRound, Copy } from "lucide-react";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [tempPasswordDialogOpen, setTempPasswordDialogOpen] = useState(false);
  const [tempPasswordMode, setTempPasswordMode] = useState<"generate" | "shared">("generate");
  const [sharedTempPassword, setSharedTempPassword] = useState("");
  const [tempPasswordResults, setTempPasswordResults] = useState<TempPasswordResult[] | null>(null);

  const { data: contracts } = useAdminContracts(selectedAcademicYearId);
  const { data: templates } = useEmailTemplates();
  const { data: applications, isLoading, refetch } = useApplicationsWithPlaceholders({
    academic_year_id: selectedAcademicYearId,
    contract_id: contractFilter !== "all" ? contractFilter : undefined,
  });
  const sendInvitations = useSendBulkInvitations();
  const setTempPasswords = useSetTempPasswords();

  // Filter applications (account_status is invitation metadata, not application.status)
  const filteredApplications = useMemo(() => {
    if (!applications) return [];

    return applications.filter((app) => {
      if (statusFilter === "pending_activation") {
        if (app.account_status !== "pending_activation") return false;
      } else if (statusFilter === "invited") {
        if (app.account_status !== "invited") return false;
      } else if (statusFilter === "activated") {
        if (app.account_status === "pending_activation" || app.account_status === "invited") {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const name = (app.student_name || "").toLowerCase();
        const email = (app.student_email || "").toLowerCase();
        return name.includes(query) || email.includes(query);
      }

      return true;
    });
  }, [applications, searchQuery, statusFilter]);

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
  }, [selectedAcademicYearId, contractFilter, statusFilter, searchQuery]);

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

  const handleSetTempPasswords = async () => {
    const appsToSend = applicationsToSend;
    if (appsToSend.length === 0) {
      toast({
        title: "No applications selected",
        description: "Please select at least one application.",
        variant: "destructive",
      });
      return;
    }

    if (tempPasswordMode === "shared" && sharedTempPassword.trim().length < 6) {
      toast({
        title: "Password too short",
        description: "Shared temporary password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await setTempPasswords.mutateAsync({
        application_ids: appsToSend,
        password: tempPasswordMode === "shared" ? sharedTempPassword.trim() : undefined,
      });

      setTempPasswordResults(result.results || []);
      await refetch();

      toast({
        title: "Temporary passwords set",
        description: `${result.succeeded} succeeded, ${result.failed} failed. Students must change password on first login.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to set temporary passwords.",
        variant: "destructive",
      });
    }
  };

  const copyTempPasswordCsv = async () => {
    if (!tempPasswordResults?.length) return;
    const lines = [
      "email,name,password,error",
      ...tempPasswordResults.map((r) =>
        [r.email, r.name, r.password || "", r.error || ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Copied", description: "Temporary passwords copied as CSV." });
  };

  const statusBadgeClass =
    "rounded-md px-2.5 py-0.5 text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap";

  /** One status chip only — temp-password access wins over Invited/Activated. */
  const getStatusBadge = (status?: string, mustChangePassword?: boolean) => {
    if (mustChangePassword) {
      return (
        <Badge
          className={`${statusBadgeClass} bg-amber-500 hover:bg-amber-600 text-white`}
          title="Temporary password set — student must change it on first login"
        >
          <KeyRound className="h-3 w-3 shrink-0" />
          Temp access
        </Badge>
      );
    }

    if (status === "pending_activation") {
      return (
        <Badge className={`${statusBadgeClass} bg-yellow-500 hover:bg-yellow-600 text-white`}>
          <Clock className="h-3 w-3 shrink-0" />
          Pending
        </Badge>
      );
    }

    if (status === "invited") {
      return (
        <Badge className={`${statusBadgeClass} bg-blue-500 hover:bg-blue-600 text-white`}>
          <Mail className="h-3 w-3 shrink-0" />
          Invited
        </Badge>
      );
    }

    return (
      <Badge className={`${statusBadgeClass} bg-green-500 hover:bg-green-600 text-white`}>
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        Activated
      </Badge>
    );
  };

  const getAccessBadge = (invitationSentAt?: string, mustChangePassword?: boolean) => {
    if (invitationSentAt) {
      return (
        <div>
          <Badge className={`${statusBadgeClass} bg-green-500 hover:bg-green-600 text-white`}>
            <Mail className="h-3 w-3 shrink-0" />
            Email sent
          </Badge>
          <div className="text-xs text-muted-foreground mt-1">
            {format(new Date(invitationSentAt), "MMM d, yyyy")}
          </div>
        </div>
      );
    }

    if (mustChangePassword) {
      return (
        <Badge
          className={`${statusBadgeClass} border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50`}
          title="Access via temporary password (no invitation email)"
        >
          <KeyRound className="h-3 w-3 shrink-0" />
          Temp password
        </Badge>
      );
    }

    return (
      <Badge className={`${statusBadgeClass} bg-muted text-muted-foreground hover:bg-muted`}>
        <XCircle className="h-3 w-3 shrink-0" />
        Not sent
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
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Search Student</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
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
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setTempPasswordResults(null);
                    setTempPasswordDialogOpen(true);
                  }}
                  disabled={selectedApplications.size === 0 || setTempPasswords.isPending}
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  Set Temp Password ({selectedApplications.size})
                </Button>
                <Button
                  onClick={() => setDialogOpen(true)}
                  disabled={selectedApplications.size === 0 || sendInvitations.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Invitations ({selectedApplications.size})
                </Button>
              </div>
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
                      <TableHead className="text-xs md:text-sm font-semibold uppercase">Access</TableHead>
                      <TableHead className="text-xs md:text-sm font-semibold uppercase">Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedApplications.map((app) => {
                      const displayName = (app.student_name || "").trim();
                      const email = (app.student_email || "").trim();
                      const nameIsEmail =
                        !displayName ||
                        displayName.toLowerCase() === email.toLowerCase();

                      return (
                      <TableRow key={app.id} className="hover:bg-muted/50">
                        <TableCell>
                          <Checkbox
                            checked={selectedApplications.has(app.id)}
                            onCheckedChange={() => handleSelectApplication(app.id)}
                          />
                        </TableCell>
                        <TableCell>
                          {nameIsEmail ? (
                            <div className="font-medium text-sm break-all">{email || "Student"}</div>
                          ) : (
                            <div>
                              <div className="font-medium text-sm">{displayName}</div>
                              <div className="text-xs text-muted-foreground break-all">{email}</div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{app.contract?.name || "N/A"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {app.contract?.academic_year?.name
                              || app.contract?.academic_years?.name
                              || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(app.account_status, app.must_change_password)}
                        </TableCell>
                        <TableCell>
                          {getAccessBadge(app.invitation_sent_at, app.must_change_password)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(app.created_at), "MMM d, yyyy")}
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
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

        {/* Temporary password dialog */}
        <Dialog
          open={tempPasswordDialogOpen}
          onOpenChange={(open) => {
            setTempPasswordDialogOpen(open);
            if (!open) {
              setTempPasswordResults(null);
              setSharedTempPassword("");
              setTempPasswordMode("generate");
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
                Set Temporary Password
              </DialogTitle>
              <DialogDescription className="text-xs md:text-sm">
                Fallback when invite links fail. Students log in with the temp password, then must set a new one before using the portal.
              </DialogDescription>
            </DialogHeader>

            {!tempPasswordResults ? (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Apply to</Label>
                  <Select value={sendToAll ? "all" : "current"} onValueChange={(value) => setSendToAll(value === "all")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Selected ({selectedApplications.size})</SelectItem>
                      <SelectItem value="current">Current Page Only ({applicationsToSend.length})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Password mode</Label>
                  <Select
                    value={tempPasswordMode}
                    onValueChange={(value) => setTempPasswordMode(value as "generate" | "shared")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="generate">Generate unique password per student</SelectItem>
                      <SelectItem value="shared">Use one shared password for selection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {tempPasswordMode === "shared" && (
                  <div className="space-y-2">
                    <Label htmlFor="sharedTempPassword">Shared temporary password</Label>
                    <Input
                      id="sharedTempPassword"
                      type="text"
                      value={sharedTempPassword}
                      onChange={(e) => setSharedTempPassword(e.target.value)}
                      placeholder="At least 6 characters"
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Passwords are shown once after save so you can share them securely. They are not emailed automatically.
                </p>
              </div>
            ) : (
              <div className="space-y-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    Share these with students now. They will be prompted to change password on login.
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={copyTempPasswordCsv}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy CSV
                  </Button>
                </div>
                <ScrollArea className="h-64 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Password</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tempPasswordResults.map((row) => (
                        <TableRow key={`${row.application_id}-${row.student_id}`}>
                          <TableCell>
                            <div className="font-medium text-sm">{row.name || "Student"}</div>
                            <div className="text-xs text-muted-foreground">{row.email}</div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {row.password || "—"}
                          </TableCell>
                          <TableCell>
                            {row.error ? (
                              <span className="text-xs text-destructive">{row.error}</span>
                            ) : (
                              <span className="text-xs text-green-700">Ready</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setTempPasswordDialogOpen(false);
                  setTempPasswordResults(null);
                }}
              >
                {tempPasswordResults ? "Close" : "Cancel"}
              </Button>
              {!tempPasswordResults && (
                <Button onClick={handleSetTempPasswords} disabled={setTempPasswords.isPending}>
                  {setTempPasswords.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <KeyRound className="h-4 w-4 mr-2" />
                      Set passwords
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default BulkInvitations;

