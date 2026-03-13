import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAdminStudios, useUpdateStudio, useBulkUpdateStudios } from "@/hooks/useAdminStudios";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, ArrowRightCircle, CheckSquare, Square, MoreVertical, Search, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { Input } from "@/components/ui/input";

const statusLabels: Record<string, string> = {
  available: "Available",
  reserved: "Reserved",
  occupied: "Occupied",
  maintenance: "Maintenance",
};

const Studios = () => {
  const navigate = useNavigate();
  const [gradeFilter, setGradeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [allocationFilter, setAllocationFilter] = useState<string>("all");
  const [floorFilter, setFloorFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string | undefined>();
  const [selectedStudios, setSelectedStudios] = useState<Set<string>>(new Set());
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<{ type: string; value: string } | null>(null);
  const [bulkGradeId, setBulkGradeId] = useState<string>("");

  // When using the virtual "occupied_can_release" filter, we still fetch all
  // statuses from the backend and apply the "can release" condition in the UI.
  const effectiveStatusFilter =
    statusFilter === "all" || statusFilter === "occupied_can_release"
      ? undefined
      : statusFilter;

  const { data: gradesData } = useAdminStudioGrades(selectedAcademicYearId);
  const { data: studios, isLoading } = useAdminStudios({
    gradeId: gradeFilter === "all" ? undefined : gradeFilter,
    status: effectiveStatusFilter,
    allocation: allocationFilter === "all" ? undefined : allocationFilter,
    floor: floorFilter === "all" ? undefined : floorFilter,
    academicYearId: selectedAcademicYearId,
  });
  const updateStudio = useUpdateStudio();
  const bulkUpdateStudios = useBulkUpdateStudios();

  const gradeOptions = useMemo(
    () =>
      gradesData?.grades.map((grade) => ({
        id: grade.id,
        name: grade.name,
      })) ?? [],
    [gradesData],
  );

  // Get unique floor values from studios
  const floorOptions = useMemo(() => {
    const floors = new Set<string>();
    studios?.forEach((studio) => {
      if (studio.floor) {
        floors.add(studio.floor);
      }
    });
    return Array.from(floors).sort();
  }, [studios]);

  const filteredStudios = useMemo(() => {
    if (!studios) return [];
    const q = searchQuery.trim().toLowerCase();

    return studios.filter((studio) => {
      // Apply real status filter (excluding the virtual "occupied_can_release")
      if (statusFilter !== "all" && statusFilter !== "occupied_can_release") {
        const studioStatus = (studio.status ?? studio.effective_status ?? "").toLowerCase();
        if (studioStatus !== statusFilter.toLowerCase()) {
          return false;
        }
      }

      if (!q) return true;

      const number = (studio.studio_number ?? "").toLowerCase();
      const grade = (studio.studio_grade?.name ?? "").toLowerCase();
      const floor = (studio.floor ?? "").toLowerCase();
      const status = (studio.status ?? studio.effective_status ?? "").toLowerCase();
      const allocation = (studio.allocation ?? "").toLowerCase();

      return (
        number.includes(q) ||
        grade.includes(q) ||
        floor.includes(q) ||
        status.includes(q) ||
        allocation.includes(q)
      );
    });
  }, [studios, searchQuery, statusFilter]);

  const occupiedStudioIds = useMemo(
    () => filteredStudios.filter((s) => s.status === "occupied").map((s) => s.id),
    [filteredStudios],
  );

  const { data: occupiedApplications } = useQuery({
    queryKey: ["studio-occupied-applications", occupiedStudioIds],
    queryFn: async () => {
      if (occupiedStudioIds.length === 0) return [];
      const { data, error } = await supabase
        .from("student_applications")
        .select("id, assigned_studio_id, contract:contracts!contract_id(contract_end)")
        .in("assigned_studio_id", occupiedStudioIds)
        .eq("status", "confirmed");
      if (error) throw error;
      return (data ?? []) as { id: string; assigned_studio_id: string | null; contract: { contract_end: string | null } | null }[];
    },
    enabled: occupiedStudioIds.length > 0,
  });

  const studioCanReleaseMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!occupiedApplications?.length) return map;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const studioId of occupiedStudioIds) {
      const apps = occupiedApplications.filter((a) => a.assigned_studio_id === studioId);
      if (apps.length === 0) continue;
      const maxEnd = apps.reduce<Date | null>((acc, app) => {
        const end = app.contract?.contract_end;
        if (!end) return acc;
        const d = new Date(end);
        return acc ? (d > acc ? d : acc) : d;
      }, null);
      map.set(studioId, !!maxEnd && maxEnd < today);
    }
    return map;
  }, [occupiedStudioIds, occupiedApplications]);

  const displayStudios = useMemo(() => {
    if (statusFilter !== "occupied_can_release") return filteredStudios;
    return filteredStudios.filter(
      (studio) => studio.status === "occupied" && studioCanReleaseMap.get(studio.id),
    );
  }, [filteredStudios, statusFilter, studioCanReleaseMap]);

  const selectAll = selectedStudios.size === displayStudios.length && displayStudios.length > 0;
  const someSelected = selectedStudios.size > 0 && selectedStudios.size < displayStudios.length;

  const handleStatusChange = async (studioId: string, status: string) => {
    if (status === "maintenance" && !selectedAcademicYearId) {
      toast({
        variant: "destructive",
        title: "Select an academic year",
        description: "Choose an academic year above to set maintenance for that year only.",
      });
      return;
    }
    try {
      await updateStudio.mutateAsync({
        id: studioId,
        status,
        academicYearId: selectedAcademicYearId ?? undefined,
      });
      toast({ title: "Studio status updated" });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to update studio status",
      });
    }
  };

  const handleGradeChange = async (studioId: string, studioGradeId: string) => {
    try {
      await updateStudio.mutateAsync({ id: studioId, studio_grade_id: studioGradeId });
      toast({ title: "Studio grade updated" });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Unable to update studio grade",
      });
    }
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedStudios(new Set());
    } else {
      setSelectedStudios(new Set(displayStudios.map((s) => s.id)));
    }
  };

  const handleSelectStudio = (studioId: string) => {
    const newSelected = new Set(selectedStudios);
    if (newSelected.has(studioId)) {
      newSelected.delete(studioId);
    } else {
      newSelected.add(studioId);
    }
    setSelectedStudios(newSelected);
  };

  const handleBulkAction = (type: string, value: string) => {
    setBulkAction({ type, value });
    setBulkActionDialogOpen(true);
  };

  const confirmBulkAction = async () => {
    if (!bulkAction || selectedStudios.size === 0) return;

    if (bulkAction.type === "grade" && !bulkGradeId) {
      toast({ variant: "destructive", title: "Select a grade", description: "Choose a studio grade to apply." });
      return;
    }

    if (bulkAction.type === "status" && bulkAction.value === "maintenance" && !selectedAcademicYearId) {
      toast({
        variant: "destructive",
        title: "Select an academic year",
        description: "Choose an academic year above to set maintenance for that year only.",
      });
      return;
    }

    try {
      const updates: Record<string, unknown> = {};
      if (bulkAction.type === "allocation") {
        updates.allocation = bulkAction.value === "unallocated" ? null : bulkAction.value;
      } else if (bulkAction.type === "status") {
        updates.status = bulkAction.value;
      } else if (bulkAction.type === "grade") {
        updates.studio_grade_id = bulkGradeId;
      }

      await bulkUpdateStudios.mutateAsync({
        studioIds: Array.from(selectedStudios),
        updates,
        academicYearId: selectedAcademicYearId ?? undefined,
      });

      toast({
        title: "Bulk update successful",
        description: `Updated ${selectedStudios.size} studio${selectedStudios.size > 1 ? "s" : ""}`,
      });

      setSelectedStudios(new Set());
      setBulkActionDialogOpen(false);
      setBulkAction(null);
      setBulkGradeId("");
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Bulk update failed",
        description: "Unable to update studios. Please try again.",
      });
    }
  };

  return (
    <AdminLayout
      pageTitle="Studios"
      subtitle="View studio inventory, monitor reservations, and manage unit status."
    >
      <div className="mb-6 space-y-4">
        <div className="flex items-center justify-start md:justify-end">
          <AcademicYearSelector
            value={selectedAcademicYearId}
            onValueChange={setSelectedAcademicYearId}
            className="w-full md:w-64"
          />
        </div>
        <div className="flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-4">
        <div className="relative w-full sm:w-48 md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search studios..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-full h-10"
          />
        </div>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-full sm:w-48 md:w-64 rounded-full">
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
          <SelectTrigger className="w-full sm:w-40 md:w-56 rounded-full">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="occupied_can_release">Occupied (can release)</SelectItem>
            {Object.keys(statusLabels).map((statusKey) => (
              <SelectItem key={statusKey} value={statusKey}>
                {statusLabels[statusKey]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={allocationFilter} onValueChange={setAllocationFilter}>
          <SelectTrigger className="w-full sm:w-40 md:w-56 rounded-full">
            <SelectValue placeholder="Filter by allocation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All allocations</SelectItem>
            <SelectItem value="Student">Student</SelectItem>
            <SelectItem value="OTA">OTA</SelectItem>
            <SelectItem value="Keyworkers">Keyworkers</SelectItem>
            <SelectItem value="unallocated">Unallocated</SelectItem>
          </SelectContent>
        </Select>
        <Select value={floorFilter} onValueChange={setFloorFilter}>
          <SelectTrigger className="w-full sm:w-40 md:w-56 rounded-full">
            <SelectValue placeholder="Filter by floor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All floors</SelectItem>
            {floorOptions.map((floor) => (
              <SelectItem key={floor} value={floor}>
                Floor {floor}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        </div>
        {selectedStudios.size > 0 && (
          <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/20">
            <p className="text-sm font-medium">
              {selectedStudios.size} studio{selectedStudios.size > 1 ? "s" : ""} selected
            </p>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full uppercase tracking-wide">
                    <MoreVertical className="h-4 w-4 mr-2" />
                    Bulk Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => handleBulkAction("allocation", "Student")}>
                    Set Allocation to Student
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkAction("allocation", "OTA")}>
                    Set Allocation to OTA
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkAction("allocation", "Keyworkers")}>
                    Set Allocation to Keyworkers
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkAction("allocation", "unallocated")}>
                    Set Allocation to Unallocated
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkAction("status", "available")}>
                    Set Status to Available
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkAction("status", "maintenance")}>
                    Set Status to Maintenance
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkAction("grade", "")}>
                    Set grade to…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedStudios(new Set())}
                className="rounded-full uppercase tracking-wide"
              >
                Clear
              </Button>
            </div>
          </div>
        )}
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
              {displayStudios.length > 0 && (
                <div className="flex items-center gap-3 pb-2 border-b border-border/60">
                  <Checkbox
                    checked={selectAll}
                    onCheckedChange={handleSelectAll}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectAll ? "Deselect all" : "Select all"}
                  </span>
                    {searchQuery.trim() && (
                    <span className="text-xs text-muted-foreground">
                      {displayStudios.length} of {studios?.length ?? 0} studios
                    </span>
                  )}
                </div>
              )}
              {displayStudios.map((studio) => (
                <div
                  key={studio.id}
                  className={`rounded-2xl border px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${
                    selectedStudios.has(studio.id)
                      ? "border-primary bg-primary/5"
                      : "border-border/60"
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1">
                    <Checkbox
                      checked={selectedStudios.has(studio.id)}
                      onCheckedChange={() => handleSelectStudio(studio.id)}
                      className="mt-1 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                        Floor {studio.floor ?? "n/a"}
                      </p>
                      <Select
                        value={studio.studio_grade_id}
                        onValueChange={(value) => handleGradeChange(studio.id, value)}
                      >
                        <SelectTrigger className="w-auto max-w-[180px] h-8 rounded-full text-xs">
                          <SelectValue placeholder="Grade" />
                        </SelectTrigger>
                        <SelectContent>
                          {gradeOptions.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/studios/${studio.id}`)}
                      className="text-left"
                    >
                      <h3 className="text-xl font-display font-bold uppercase tracking-wide hover:underline">
                        {studio.studio_number}
                      </h3>
                    </button>
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
                    {studio.status === "occupied" && studioCanReleaseMap.get(studio.id) && (
                      <p className="text-xs text-slate-600 flex items-center gap-1">
                        <KeyRound className="h-3 w-3" />
                        Can release
                      </p>
                    )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      <Badge
                        className={`uppercase tracking-wide rounded-full px-2.5 py-0.5 text-xs font-medium flex-shrink-0 ${
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
                        {studio.status === "occupied" && studioCanReleaseMap.get(studio.id)
                          ? "Occupied (can release)"
                          : statusLabels[studio.status] ?? studio.status}
                      </Badge>
                      <Select
                        onValueChange={(value) => handleStatusChange(studio.id, value)}
                        defaultValue={studio.status}
                      >
                        <SelectTrigger className="w-full sm:w-40 rounded-full">
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
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full uppercase tracking-wide gap-2 w-full sm:w-auto"
                      onClick={async () => {
                        const canRelease = studio.status === "occupied" && studioCanReleaseMap.get(studio.id);
                        if (!canRelease) {
                          toast({
                            variant: "destructive",
                            title: "Cannot release studio",
                            description:
                              "This studio is still linked to an active confirmed contract. End or check out the contract from the Applications panel first.",
                          });
                          return;
                        }

                        try {
                          const { error } = await supabase.rpc("admin_release_studio_occupancy", {
                            p_studio_id: studio.id,
                            p_academic_year_id: selectedAcademicYearId ?? null,
                          });

                          if (error) throw error;

                          await updateStudio.mutateAsync({
                            id: studio.id,
                            status: "available",
                            allocation: null,
                            academicYearId: selectedAcademicYearId ?? undefined,
                          });

                          toast({
                            title: "Studio released",
                            description: "Studio is now available for new bookings.",
                          });
                        } catch (error) {
                          console.error(error);
                          toast({
                            variant: "destructive",
                            title: "Failed to release studio",
                            description: "Please try again or release from the application detail.",
                          });
                        }
                      }}
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
              {studios && studios.length > 0 && filteredStudios.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No studios match your search. Try a different term or clear the search.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={bulkActionDialogOpen}
        onOpenChange={(open) => {
          setBulkActionDialogOpen(open);
          if (!open) {
            setBulkAction(null);
            setBulkGradeId("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Bulk Action</DialogTitle>
            <DialogDescription>
              {bulkAction?.type === "grade" ? (
                <>
                  Set studio grade for {selectedStudios.size} studio{selectedStudios.size > 1 ? "s" : ""}. Choose the grade below.
                </>
              ) : (
                <>
                  Are you sure you want to {bulkAction?.type === "allocation" ? "set allocation to" : "set status to"}{" "}
                  <strong>
                    {bulkAction?.value === "unallocated"
                      ? "Unallocated"
                      : bulkAction?.value}
                  </strong>{" "}
                  for {selectedStudios.size} studio{selectedStudios.size > 1 ? "s" : ""}?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {bulkAction?.type === "grade" && (
            <div className="space-y-2 py-2">
              <label className="text-sm font-medium">Studio grade</label>
              <Select value={bulkGradeId} onValueChange={setBulkGradeId}>
                <SelectTrigger className="rounded-full">
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent>
                  {gradeOptions.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setBulkActionDialogOpen(false);
                setBulkAction(null);
                setBulkGradeId("");
              }}
              className="rounded-full uppercase tracking-wide w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmBulkAction}
              disabled={bulkUpdateStudios.isPending || (bulkAction?.type === "grade" && !bulkGradeId)}
              className="rounded-full uppercase tracking-wide w-full sm:w-auto"
            >
              {bulkUpdateStudios.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default Studios;

