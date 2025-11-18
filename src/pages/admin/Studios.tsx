import { useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAdminStudios, useUpdateStudio } from "@/hooks/useAdminStudios";
import { useAdminStudioGrades } from "@/hooks/useAdminStudioGrades";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowRightCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

const statusLabels: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  occupied: "Occupied",
  maintenance: "Maintenance",
};

const Studios = () => {
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [allocationFilter, setAllocationFilter] = useState<string>("all");

  const { data: gradesData } = useAdminStudioGrades();
  const { data: studios, isLoading } = useAdminStudios({
    gradeId: gradeFilter === "all" ? undefined : gradeFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    allocation: allocationFilter === "all" ? undefined : allocationFilter,
  });
  const updateStudio = useUpdateStudio();

  const gradeOptions = useMemo(
    () =>
      gradesData?.grades.map((grade) => ({
        id: grade.id,
        name: grade.name,
      })) ?? [],
    [gradesData],
  );

  const handleStatusChange = async (studioId: string, status: string) => {
    try {
      await updateStudio.mutateAsync({ id: studioId, status });
      toast({ title: "Studio status updated" });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to update studio status",
      });
    }
  };

  return (
    <AdminLayout
      pageTitle="Studios"
      subtitle="View studio inventory, monitor reservations, and manage unit status."
    >
      <div className="flex flex-wrap md:flex-nowrap items-center gap-4 mb-6">
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-full md:w-64 rounded-full">
            <SelectValue placeholder="Filter by grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All grades</SelectItem>
            {gradeOptions.map((grade) => (
              <SelectItem key={grade.id} value={grade.id}>
                {grade.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-56 rounded-full">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            {Object.keys(statusLabels).map((statusKey) => (
              <SelectItem key={statusKey} value={statusKey}>
                {statusLabels[statusKey]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={allocationFilter} onValueChange={setAllocationFilter}>
          <SelectTrigger className="w-full md:w-56 rounded-full">
            <SelectValue placeholder="Filter by allocation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All allocations</SelectItem>
            <SelectItem value="student">Student</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="unallocated">Unallocated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-display uppercase tracking-wide">
            Studio roster
          </CardTitle>
          <CardDescription>
            Assign maintenance status, mark units occupied, or release reservations from this panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {studios?.map((studio) => (
                <div
                  key={studio.id}
                  className="rounded-2xl border border-border/60 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      {studio.studio_grade?.name ?? "Unknown grade"} — Floor{" "}
                      {studio.floor ?? "n/a"}
                    </p>
                    <h3 className="text-xl font-display font-bold uppercase tracking-wide">
                      {studio.studio_number}
                    </h3>
                    {studio.allocation && (
                      <p className="text-xs text-muted-foreground">
                        Allocation: {studio.allocation}
                      </p>
                    )}
                    {studio.reservation_expires_at && (
                      <p className="text-xs text-amber-600">
                        Reservation expires {studio.reservation_expires_at}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge
                      className={`uppercase tracking-wide rounded-full px-2.5 py-0.5 text-xs font-medium ${
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
                      {statusLabels[studio.status] ?? studio.status}
                    </Badge>
                    <Select
                      onValueChange={(value) => handleStatusChange(studio.id, value)}
                      defaultValue={studio.status}
                    >
                      <SelectTrigger className="w-40 rounded-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full uppercase tracking-wide gap-2"
                      onClick={() =>
                        handleStatusChange(studio.id, "available")
                      }
                    >
                      <ArrowRightCircle className="h-4 w-4" />
                      Release
                    </Button>
                  </div>
                </div>
              ))}
              {!studios?.length && (
                <p className="text-sm text-muted-foreground">
                  No studios found for the current filters.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default Studios;

