import { useMemo, useState, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  useAdminApplications,
  useUpdateApplicationStatus,
} from "@/hooks/useAdminApplications";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, CreditCard } from "lucide-react";
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
import { Search } from "lucide-react";
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

const Applications = () => {
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>();
  const { data, isLoading, isError, error } = useAdminApplications(selectedAcademicYearId);
  const updateStatus = useUpdateApplicationStatus();
  const navigate = useNavigate();
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState<string>("");

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

