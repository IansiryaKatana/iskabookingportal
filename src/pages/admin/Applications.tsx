import { useMemo, useState } from "react";
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

const Applications = () => {
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>();
  const { data, isLoading, isError, error } = useAdminApplications(selectedAcademicYearId);
  const updateStatus = useUpdateApplicationStatus();
  const navigate = useNavigate();
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return data ?? [];
    return data?.filter((application) => application.status === statusFilter) ?? [];
  }, [data, statusFilter]);

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
        <div className="flex items-center justify-start md:justify-end">
          <AcademicYearSelector
            value={selectedAcademicYearId}
            onValueChange={setSelectedAcademicYearId}
            className="w-full md:w-64"
          />
        </div>
        <div className="flex flex-wrap gap-2 md:gap-3">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            className="rounded-full uppercase tracking-wide text-xs sm:text-sm"
            onClick={() => setStatusFilter("all")}
          >
            All applications
          </Button>
          {Object.keys(statusLabels).map((key) => (
            <Button
              key={key}
              variant={statusFilter === key ? "default" : "outline"}
              className="rounded-full uppercase tracking-wide text-xs sm:text-sm whitespace-nowrap"
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
              {filtered.map((application) => (
                <div
                  key={application.id}
                  className="rounded-2xl border border-border/60 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-display font-bold uppercase tracking-wide">
                        {application.student?.first_name} {application.student?.last_name}
                      </h3>
                      {getStatusBadge(application.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {application.contract?.studio_grade?.name ?? "Studio"} —{" "}
                      {application.contract?.name ?? "Contract"} — Created{" "}
                      {new Date(application.created_at).toLocaleDateString("en-GB")}
                    </p>
                    {application.assigned_studio?.studio_number && (
                      <p className="text-xs text-muted-foreground">
                        Assigned studio: {application.assigned_studio.studio_number}
                      </p>
                    )}
                    {application.deposit_payment_intent_id && (
                      <p className="text-xs text-muted-foreground">
                        Stripe payment intent: {application.deposit_payment_intent_id}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <SelectStatusButton
                      status={application.status}
                      onChange={(status) =>
                        handleStatusChange(
                          application.id,
                          status as keyof typeof statusLabels,
                        )
                      }
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full uppercase tracking-wide gap-2"
                        onClick={() => {
                          setSelectedApplicationId(application.id);
                          setManualPaymentOpen(true);
                        }}
                      >
                        <CreditCard className="h-4 w-4" />
                        Record Payment
                      </Button>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full uppercase tracking-wide gap-2"
                        onClick={() => navigate(`/admin/applications/${application.id}`)}
                      >
                        Review
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full uppercase tracking-wide gap-2"
                        onClick={() =>
                          navigate(`/portal/applications/${application.id}`)
                        }
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open journey
                      </Button>
                    </div>
                    </div>
                  </div>
                </div>
              ))}
              {!filtered.length && (
                <p className="text-sm text-muted-foreground">
                  No applications in this stage at the moment.
                </p>
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
      <SelectTrigger className="w-48 rounded-full">
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

