import { useMemo, useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  useAdminApplications,
  useUpdateApplicationStatus,
} from "@/hooks/useAdminApplications";
import { useAdminContracts } from "@/hooks/useAdminContracts";
import { useAdminStudios } from "@/hooks/useAdminStudios";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, CreditCard, Plus, UserPlus, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import ManualPaymentDialog from "@/components/admin/ManualPaymentDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

const statusLabels: Record<string, string> = {
  draft: "Draft",
  awaiting_deposit: "Awaiting Deposit",
  awaiting_signature: "Awaiting Signature",
  awaiting_verification: "Awaiting Verification",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  expired: "Expired",
};

const getStatusBadge = (status: string) => {
  const statusConfig: Record<string, { className: string; label: string }> = {
    draft: {
      className: "bg-gray-500 hover:bg-gray-600 text-white",
      label: "Draft",
    },
    awaiting_deposit: {
      className: "bg-yellow-500 hover:bg-yellow-600 text-white",
      label: "Awaiting Deposit",
    },
    awaiting_signature: {
      className: "bg-blue-500 hover:bg-blue-600 text-white",
      label: "Awaiting Signature",
    },
    awaiting_verification: {
      className: "bg-purple-500 hover:bg-purple-600 text-white",
      label: "Awaiting Verification",
    },
    confirmed: {
      className: "bg-green-500 hover:bg-green-600 text-white",
      label: "Confirmed",
    },
    cancelled: {
      className: "bg-red-500 hover:bg-red-600 text-white",
      label: "Cancelled",
    },
    expired: {
      className: "bg-orange-500 hover:bg-orange-600 text-white",
      label: "Expired",
    },
  };

  const config = statusConfig[status] || {
    className: "bg-gray-500 hover:bg-gray-600 text-white",
    label: statusLabels[status] || status,
  };

  return (
    <Badge className={`uppercase ${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium`}>
      {config.label}
    </Badge>
  );
};

const ITEMS_PER_PAGE = 20;

const BOOKING_SOURCE_OPTIONS = [
  { value: "website", label: "Website" },
  { value: "imported", label: "Imported" },
  { value: "rebooker", label: "Rebooker" },
  { value: "partner_referral", label: "Partner referral" },
];

const Applications = () => {
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>();
  const { data, isLoading, isError, error } = useAdminApplications(selectedAcademicYearId);
  const updateStatus = useUpdateApplicationStatus();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  // Mode: "existing" = select existing student, "new" = create new student inline
  const [studentMode, setStudentMode] = useState<"existing" | "new">("existing");
  const [createStudentId, setCreateStudentId] = useState<string>("");
  const [createContractId, setCreateContractId] = useState<string>("");
  const [createStudioId, setCreateStudioId] = useState<string>("");
  const [createBookingSource, setCreateBookingSource] = useState<string>("imported");
  // Fields for new student creation
  const [newStudentEmail, setNewStudentEmail] = useState<string>("");
  const [newStudentFirstName, setNewStudentFirstName] = useState<string>("");
  const [newStudentLastName, setNewStudentLastName] = useState<string>("");
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);

  const { data: studentProfiles } = useQuery({
    queryKey: ["student-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone")
        .eq("role", "student")
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: createDialogOpen,
  });

  const { data: contracts } = useAdminContracts();
  const selectedContract = contracts?.find((c) => c.id === createContractId);
  const { data: studios } = useAdminStudios(
    selectedContract?.studio_grade_id ? { gradeId: selectedContract.studio_grade_id } : undefined,
  );

  const createApplicationMutation = useMutation({
    mutationFn: async () => {
      let studentId = createStudentId;

      // If creating a new student, call manage-users first (same as Users.tsx)
      if (studentMode === "new") {
        if (!newStudentEmail?.trim()) throw new Error("Email is required for new student");
        if (!newStudentFirstName?.trim()) throw new Error("First name is required for new student");
        if (!newStudentLastName?.trim()) throw new Error("Last name is required for new student");
        if (!createContractId) throw new Error("Select a contract");

        setIsCreatingStudent(true);

        const { data: createData, error: createError } = await supabase.functions.invoke(
          "manage-users",
          {
            body: {
              action: "create",
              email: newStudentEmail.trim().toLowerCase(),
              role: "student",
              first_name: newStudentFirstName.trim(),
              last_name: newStudentLastName.trim(),
            },
          }
        );

        setIsCreatingStudent(false);

        if (createError) {
          throw new Error(createError.message || "Failed to create student");
        }
        if (createData?.error) {
          throw new Error(typeof createData.error === "string" ? createData.error : "Failed to create student");
        }
        if (!createData?.user?.id) {
          throw new Error("User creation succeeded but no ID returned");
        }

        studentId = createData.user.id;
      }

      if (!studentId || !createContractId) throw new Error("Select student and contract");
      const contractRow = contracts?.find((c) => c.id === createContractId);
      if (!contractRow) throw new Error("Contract not found");

      const { data: existing } = await supabase
        .from("student_applications")
        .select("id, status")
        .eq("student_id", studentId)
        .eq("contract_id", createContractId)
        .maybeSingle();

      if (existing) {
        return { id: existing.id, isExisting: true, isNewStudent: studentMode === "new" };
      }

      const payload: Record<string, unknown> = {
        student_id: studentId,
        contract_id: createContractId,
        studio_grade_id: contractRow.studio_grade_id,
        status: "draft",
        booking_source: createBookingSource || null,
      };
      if (createBookingSource === "rebooker") {
        payload.is_rebooking = true;
        payload.rebooking_reason = "Created by staff as rebooker";
      }
      if (createStudioId) {
        payload.assigned_studio_id = createStudioId;
      }

      const { data: inserted, error } = await supabase
        .from("student_applications")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      if (!inserted) throw new Error("Failed to create application");
      return { id: inserted.id, isExisting: false, isNewStudent: studentMode === "new" };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      queryClient.invalidateQueries({ queryKey: ["student-profiles"] });
      setCreateDialogOpen(false);
      resetCreateDialog();
      if (result.isExisting) {
        toast({ title: "Application exists", description: "Opening existing application." });
      } else if (result.isNewStudent) {
        toast({
          title: "Student created & application started",
          description: "The student can use 'Forgot Password' to set their password and log in.",
        });
      } else {
        toast({ title: "Application created", description: "Opening the booking journey." });
      }
      navigate(
        result.id
          ? createStudioId
            ? `/portal/applications/${result.id}`
            : `/portal/applications/${result.id}/select-studio`
          : "/admin/applications",
      );
    },
    onError: (err: Error) => {
      setIsCreatingStudent(false);
      const msg = err.message ?? "";
      // User-friendly messages for known create-student errors (avoid technical/function errors)
      const friendly =
        msg.includes("already exists") || msg.toLowerCase().includes("user with this email")
          ? "A student with this email is already in the system. Choose “Existing student” and select them, or use a different email."
          : msg.includes("Invalid email") || msg.toLowerCase().includes("email format")
          ? "Please enter a valid email address."
          : msg.includes("First name") || msg.includes("Last name")
          ? "Please enter both first and last name for the student."
          : msg.includes("Not authenticated") || msg.includes("Unauthorized")
          ? "Your session may have expired. Please sign in again and try again."
          : msg;
      toast({
        variant: "destructive",
        title: "Couldn’t create application",
        description: friendly,
      });
    },
  });

  const resetCreateDialog = () => {
    setStudentMode("existing");
    setCreateStudentId("");
    setCreateContractId("");
    setCreateStudioId("");
    setCreateBookingSource("imported");
    setNewStudentEmail("");
    setNewStudentFirstName("");
    setNewStudentLastName("");
    setIsCreatingStudent(false);
  };

  const handleCreateApplication = () => {
    createApplicationMutation.mutate();
  };

  const filtered = useMemo(() => {
    let result = data ?? [];
    
    // Apply status filter
    if (statusFilter !== "all") {
      result = result.filter((application) => application.status === statusFilter);
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((application) => {
        const firstName = application.student?.first_name?.toLowerCase() || "";
        const lastName = application.student?.last_name?.toLowerCase() || "";
        const fullName = `${firstName} ${lastName}`.trim();
        const studioGrade = application.contract?.studio_grade?.name?.toLowerCase() || "";
        const contractName = application.contract?.name?.toLowerCase() || "";
        const studioNumber = application.assigned_studio?.studio_number?.toLowerCase() || "";
        const status = application.status?.toLowerCase() || "";
        
        return (
          fullName.includes(query) ||
          firstName.includes(query) ||
          lastName.includes(query) ||
          studioGrade.includes(query) ||
          contractName.includes(query) ||
          studioNumber.includes(query) ||
          status.includes(query)
        );
      });
    }
    
    return result;
  }, [data, statusFilter, searchQuery]);

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedApplications = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filtered.slice(startIndex, endIndex);
  }, [filtered, currentPage]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, selectedAcademicYearId, searchQuery]);

  const handleStatusChange = async (
    id: string,
    status: keyof typeof statusLabels,
  ) => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast({ title: "Application status updated" });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to update status",
      });
    }
  };

  return (
    <AdminLayout
      pageTitle="Applications"
      subtitle="Review booking journey progress, confirm documents, and move applications to completion."
    >
      <div className="mb-6 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-start md:justify-end gap-3">
          <div className="relative flex-1 md:flex-initial md:w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, studio, contract, status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-full pl-9 text-sm md:text-base"
            />
          </div>
          <AcademicYearSelector
            value={selectedAcademicYearId}
            onValueChange={setSelectedAcademicYearId}
            className="w-full md:w-64"
          />
          <Button
            className="rounded-full uppercase tracking-wide gap-2"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create application
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 md:gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            className="rounded-full uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
            onClick={() => setStatusFilter("all")}
          >
            All applications
          </Button>
          {Object.keys(statusLabels).map((key) => (
            <Button
              key={key}
              variant={statusFilter === key ? "default" : "outline"}
              className="rounded-full uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap flex-shrink-0"
              onClick={() => setStatusFilter(key)}
            >
              {statusLabels[key]}
            </Button>
          ))}
        </div>
      </div>

      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-display uppercase tracking-wide">
            Application pipeline
          </CardTitle>
          <CardDescription>
            Track student progress, confirm documents, and promote students to
            confirmed residents once tenancy agreements are complete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-border/60 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-48 bg-muted animate-pulse rounded" />
                      <div className="h-5 w-24 bg-muted animate-pulse rounded-full" />
                    </div>
                    <div className="h-4 w-64 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-40 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-48 bg-muted animate-pulse rounded-full" />
                    <div className="h-10 w-32 bg-muted animate-pulse rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-destructive font-semibold">Failed to load applications</p>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
              <p className="text-xs text-muted-foreground mt-4">
                Make sure your account has the 'staff' or 'superadmin' role in your profile.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedApplications.map((application) => (
                <div
                  key={application.id}
                  className="rounded-2xl border border-border/60 px-4 md:px-5 py-4 flex flex-col gap-3 overflow-hidden"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 md:gap-3">
                      <h3 className="text-base md:text-lg font-display font-bold uppercase tracking-wide truncate">
                        {application.student?.first_name} {application.student?.last_name}
                      </h3>
                      <div className="flex-shrink-0">
                        {getStatusBadge(application.status)}
                      </div>
                    </div>
                    <p className="text-xs md:text-sm text-muted-foreground break-words">
                      {application.contract?.studio_grade?.name ?? "Studio"} —{" "}
                      {application.contract?.name ?? "Contract"} — Created{" "}
                      {new Date(application.created_at).toLocaleDateString("en-GB")}
                    </p>
                    {application.assigned_studio?.studio_number && (
                      <p className="text-xs text-muted-foreground truncate">
                        Assigned studio: {application.assigned_studio.studio_number}
                      </p>
                    )}
                    {application.deposit_payment_intent_id && (
                      <p className="text-xs text-muted-foreground truncate">
                        Stripe payment intent: {application.deposit_payment_intent_id}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
                    <div className="w-full sm:w-auto sm:min-w-[180px]">
                      <SelectStatusButton
                        status={application.status}
                        onChange={(status) =>
                          handleStatusChange(
                            application.id,
                            status as keyof typeof statusLabels,
                          )
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full uppercase tracking-wide gap-2 flex-1 sm:flex-initial text-xs"
                        onClick={() => {
                          setSelectedApplicationId(application.id);
                          setManualPaymentOpen(true);
                        }}
                      >
                        <CreditCard className="h-4 w-4" />
                        <span className="hidden sm:inline">Record Payment</span>
                        <span className="sm:hidden">Payment</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full uppercase tracking-wide gap-2 flex-1 sm:flex-initial text-xs"
                        onClick={() => navigate(`/admin/applications/${application.id}`)}
                      >
                        Review
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full uppercase tracking-wide gap-2 flex-1 sm:flex-initial text-xs"
                        onClick={() =>
                          navigate(`/portal/applications/${application.id}`)
                        }
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span className="hidden sm:inline">Open journey</span>
                        <span className="sm:hidden">Open</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {!filtered.length && (
                <p className="text-sm text-muted-foreground">
                  No applications in this stage at the moment.
                </p>
              )}

              {/* Pagination */}
              {filtered.length > ITEMS_PER_PAGE && (
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                    {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} applications
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (currentPage > 1) setCurrentPage(currentPage - 1);
                          }}
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
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setCurrentPage(page);
                                }}
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
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (currentPage < totalPages) setCurrentPage(currentPage + 1);
                          }}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      {selectedApplicationId && (
        <ManualPaymentDialog
          open={manualPaymentOpen}
          onOpenChange={setManualPaymentOpen}
          applicationId={selectedApplicationId}
        />
      )}
      <Dialog open={createDialogOpen} onOpenChange={(open) => { setCreateDialogOpen(open); if (!open) resetCreateDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create application (on behalf of student)</DialogTitle>
            <DialogDescription>
              {studentMode === "existing"
                ? "Select an existing student and contract to start an application."
                : "Create a new student account and start an application for them."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={studentMode === "existing" ? "default" : "outline"}
                size="sm"
                className="flex-1 rounded-full gap-2"
                onClick={() => setStudentMode("existing")}
              >
                <Users className="h-4 w-4" />
                Existing student
              </Button>
              <Button
                type="button"
                variant={studentMode === "new" ? "default" : "outline"}
                size="sm"
                className="flex-1 rounded-full gap-2"
                onClick={() => setStudentMode("new")}
              >
                <UserPlus className="h-4 w-4" />
                Create new
              </Button>
            </div>

            {/* Student selection or creation fields */}
            {studentMode === "existing" ? (
              <div className="space-y-2">
                <Label>Student</Label>
                <Select value={createStudentId} onValueChange={setCreateStudentId}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue placeholder="Select student" />
                  </SelectTrigger>
                  <SelectContent>
                    {studentProfiles?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.first_name} {p.last_name} {p.phone ? `(${p.phone})` : ""}
                      </SelectItem>
                    ))}
                    {(!studentProfiles || studentProfiles.length === 0) && (
                      <SelectItem value="_none" disabled>
                        No students found. Switch to "Create new" to add one.
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-3 p-3 bg-muted/50 rounded-xl">
                <div className="space-y-2">
                  <Label htmlFor="new-student-email">Email *</Label>
                  <Input
                    id="new-student-email"
                    type="email"
                    placeholder="student@example.com"
                    value={newStudentEmail}
                    onChange={(e) => setNewStudentEmail(e.target.value)}
                    className="rounded-full"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="new-student-first-name">First name *</Label>
                    <Input
                      id="new-student-first-name"
                      placeholder="John"
                      value={newStudentFirstName}
                      onChange={(e) => setNewStudentFirstName(e.target.value)}
                      className="rounded-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-student-last-name">Last name *</Label>
                    <Input
                      id="new-student-last-name"
                      placeholder="Doe"
                      value={newStudentLastName}
                      onChange={(e) => setNewStudentLastName(e.target.value)}
                      className="rounded-full"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  The student can use "Forgot Password" to set their password and log in.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Contract</Label>
              <Select value={createContractId} onValueChange={(v) => { setCreateContractId(v); setCreateStudioId(""); }}>
                <SelectTrigger className="rounded-full">
                  <SelectValue placeholder="Select contract" />
                </SelectTrigger>
                <SelectContent>
                  {contracts?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.academic_year?.name ? `(${c.academic_year.name})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedContract && studios && studios.length > 0 && (
              <div className="space-y-2">
                <Label>Studio (optional)</Label>
                <Select value={createStudioId || "__none__"} onValueChange={(v) => setCreateStudioId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue placeholder="Select studio (or leave empty)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {studios.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.studio_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Booking source</Label>
              <Select value={createBookingSource} onValueChange={setCreateBookingSource}>
                <SelectTrigger className="rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOKING_SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateApplication}
              disabled={
                (studentMode === "existing" && !createStudentId) ||
                (studentMode === "new" && (!newStudentEmail?.trim() || !newStudentFirstName?.trim() || !newStudentLastName?.trim())) ||
                !createContractId ||
                createApplicationMutation.isPending ||
                isCreatingStudent
              }
            >
              {isCreatingStudent
                ? "Creating student…"
                : createApplicationMutation.isPending
                ? "Creating application…"
                : studentMode === "new"
                ? "Create student & application"
                : "Create & open journey"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

const statuses: Array<keyof typeof statusLabels> = [
  "draft",
  "awaiting_deposit",
  "awaiting_signature",
  "awaiting_verification",
  "confirmed",
  "cancelled",
  "expired",
];

const SelectStatusButton = ({
  status,
  onChange,
}: {
  status: string;
  onChange: (status: string) => void;
}) => {
  return (
    <Select
      value={status}
      onValueChange={(value) => onChange(value)}
    >
      <SelectTrigger className="w-full sm:w-48 rounded-full text-xs sm:text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((statusKey) => (
          <SelectItem key={statusKey} value={statusKey}>
            {statusLabels[statusKey]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default Applications;

