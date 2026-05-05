import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpLeft, ArrowRightCircle, Loader2 } from "lucide-react";
import { useAdminStudios, useUpdateStudio } from "@/hooks/useAdminStudios";
import { useStudioApplications } from "@/hooks/useStudioApplications";
import { useToast } from "@/hooks/use-toast";
import { useStudioAllocationHistory } from "@/hooks/useStudioAllocation";

const statusLabelMap: Record<string, string> = {
  draft: "Draft",
  awaiting_deposit: "Awaiting Deposit",
  awaiting_signature: "Awaiting Signature",
  awaiting_verification: "Awaiting Verification",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  expired: "Expired",
  checked_out: "Checked Out",
};

const statusBadgeClasses: Record<string, string> = {
  draft: "bg-gray-500 hover:bg-gray-600 text-white",
  awaiting_deposit: "bg-yellow-500 hover:bg-yellow-600 text-white",
  awaiting_signature: "bg-blue-500 hover:bg-blue-600 text-white",
  awaiting_verification: "bg-purple-500 hover:bg-purple-600 text-white",
  confirmed: "bg-green-500 hover:bg-green-600 text-white",
  cancelled: "bg-red-500 hover:bg-red-600 text-white",
  expired: "bg-orange-500 hover:bg-orange-600 text-white",
  checked_out: "bg-slate-700 hover:bg-slate-800 text-white",
};

const StudioDetail = () => {
  const { studioId } = useParams<{ studioId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: studios } = useAdminStudios({
    academicYearId: selectedAcademicYearId,
  });

  const studio = useMemo(
    () => studios?.find((s) => s.id === studioId) ?? null,
    [studios, studioId],
  );

  const updateStudio = useUpdateStudio();

  const { data: applications, isLoading } = useStudioApplications({
    studioId: studioId,
    academicYearId: selectedAcademicYearId ?? null,
    status: statusFilter === "all" ? null : statusFilter,
  });
  const { data: allocationHistory, isLoading: allocationHistoryLoading } = useStudioAllocationHistory(studioId);

  return (
    <AdminLayout
      pageTitle={studio ? `Studio ${studio.studio_number}` : "Studio Detail"}
      subtitle="View this studio's history, current status, and all related applications."
    >
      <div className="flex flex-col gap-4 mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 flex-wrap">
          <Button
            onClick={() => navigate("/admin/studios")}
            className="rounded-full uppercase tracking-wide gap-2 bg-black text-white hover:bg-accent hover:text-accent-foreground w-full sm:w-auto order-2 sm:order-1"
          >
            <ArrowUpLeft className="h-4 w-4" />
            Back to Studios
          </Button>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-wrap justify-end order-1 sm:order-2 w-full sm:w-auto">
            <AcademicYearSelector
              value={selectedAcademicYearId}
              onValueChange={setSelectedAcademicYearId}
              className="w-full sm:w-64"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 rounded-full">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="awaiting_deposit">Awaiting Deposit</SelectItem>
                <SelectItem value="awaiting_signature">Awaiting Signature</SelectItem>
                <SelectItem value="awaiting_verification">Awaiting Verification</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="checked_out">Checked Out</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {studio && (
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader className="pb-4 md:pb-6">
              <CardTitle className="flex flex-wrap items-center gap-3">
                <span className="text-lg md:text-xl font-display font-bold uppercase tracking-wide">
                  Studio {studio.studio_number}
                </span>
                {studio.studio_grade?.name && (
                  <Badge variant="outline" className="rounded-full text-xs uppercase tracking-wide">
                    {studio.studio_grade.name}
                  </Badge>
                )}
                {studio.floor && (
                  <Badge variant="secondary" className="rounded-full text-xs uppercase tracking-wide">
                    Floor {studio.floor}
                  </Badge>
                )}
                {studio.status && (
                  <Badge
                    className={`rounded-full text-xs uppercase tracking-wide ${
                      studio.status === "available"
                        ? "bg-green-500 hover:bg-green-600 text-white"
                        : studio.status === "reserved"
                        ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                        : studio.status === "occupied"
                        ? "bg-blue-500 hover:bg-blue-600 text-white"
                        : studio.status === "maintenance"
                        ? "bg-red-500 hover:bg-red-600 text-white"
                        : "bg-gray-500 hover:bg-gray-600 text-white"
                    }`}
                  >
                    {studio.status}
                  </Badge>
                )}
                {studio?.status === "occupied" && studioId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full uppercase tracking-wide gap-2 w-full sm:w-auto sm:ml-auto"
                    disabled={updateStudio.isPending}
                    onClick={async () => {
                      try {
                        await updateStudio.mutateAsync({
                          id: studioId,
                          status: "available",
                          allocation: null,
                          reservation_expires_at: null,
                        });
                        toast({ title: "Studio released", description: "Studio is now available for new bookings." });
                      } catch (e) {
                        toast({
                          variant: "destructive",
                          title: "Failed to release studio",
                          description: e instanceof Error ? e.message : "Please try again.",
                        });
                      }
                    }}
                  >
                    {updateStudio.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRightCircle className="h-4 w-4" />
                    )}
                    Release studio
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
          </Card>
        )}
      </div>

      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display uppercase tracking-wide">
            Applications for this studio
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading applications…</p>
          ) : !applications || applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No applications found for this studio with the current filters.
            </p>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => {
                const contractEnd = (app.contract as { contract_end?: string | null })?.contract_end;
                const isCheckedOut =
                  app.status === "confirmed" &&
                  contractEnd &&
                  new Date(contractEnd) < new Date();
                const statusKey = (isCheckedOut ? "checked_out" : app.status) as string;
                const badgeClass =
                  statusBadgeClasses[statusKey] ??
                  "bg-gray-500 hover:bg-gray-600 text-white";
                const label = statusLabelMap[statusKey] ?? statusKey;

                const contractName = (app.contract as any)?.name as string | undefined;
                const contractStart = (app.contract as any)?.contract_start as string | undefined;

                const studentName =
                  app.student?.first_name || app.student?.last_name
                    ? `${app.student?.first_name ?? ""} ${app.student?.last_name ?? ""}`.trim()
                    : "Unknown student";

                return (
                  <div
                    key={app.id}
                    className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-border/60 rounded-2xl px-4 py-3 flex-1 min-w-0"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="link"
                          className="p-0 h-auto text-base font-semibold"
                          onClick={() => navigate(`/admin/applications/${app.id}`)}
                        >
                          Application #{app.id.slice(0, 8)}
                        </Button>
                        <Badge className={badgeClass + " rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide"}>
                          {label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {studentName}
                        {app.student?.email ? ` · ${app.student.email}` : ""}
                      </p>
                      {contractName && (
                        <p className="text-xs text-muted-foreground">
                          {contractName}
                          {contractStart && contractEnd
                            ? ` · ${contractStart} → ${contractEnd}`
                            : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-start md:items-end gap-1 text-xs text-muted-foreground">
                      <span>
                        Created at: {app.created_at
                          ? new Date(app.created_at).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border border-border/60 shadow-xl mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-display uppercase tracking-wide">
            Allocation Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {allocationHistoryLoading ? (
            <p className="text-sm text-muted-foreground">Loading allocation timeline…</p>
          ) : !allocationHistory || allocationHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No allocation history recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {allocationHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-border/60 px-4 py-3 flex flex-col gap-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="rounded-full text-xs uppercase tracking-wide">
                      {(entry.previous_allocation ?? "Unallocated")} {"->"} {(entry.new_allocation ?? "Unallocated")}
                    </Badge>
                    {entry.policy && (
                      <Badge variant="secondary" className="rounded-full text-xs uppercase tracking-wide">
                        Policy: {entry.policy}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.starts_at).toLocaleString()}
                    </span>
                  </div>
                  {entry.reason && <p className="text-sm text-muted-foreground">{entry.reason}</p>}
                  <p className="text-xs text-muted-foreground">
                    Impacted OTA bookings: {entry.impacted_ota_bookings_count ?? 0}
                    {entry.ends_at ? ` · Ended: ${new Date(entry.ends_at).toLocaleString()}` : " · Active"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default StudioDetail;

