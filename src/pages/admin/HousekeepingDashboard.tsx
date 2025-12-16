import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useHousekeepingStatus, useUpdateHousekeepingStatus, useBulkUpdateHousekeepingStatus, type HousekeepingStatusWithRelations } from "@/hooks/useHousekeeping";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useStaffMembers } from "@/hooks/useStaffMembers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isBefore, parseISO } from "date-fns";
import {
  Sparkles, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, 
  UserCheck, Calendar, Building2, Filter, Trash2, Check, X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";

// Clean Status Options
const CLEAN_STATUSES = [
  { value: "all", label: "All Status" },
  { value: "clean", label: "Clean" },
  { value: "dirty", label: "Dirty" },
  { value: "occupied", label: "Occupied" },
  { value: "out_of_order", label: "Out of Order" },
  { value: "clean_pending_approval", label: "Pending Approval" },
];

// Status Badge Helper
const getStatusBadge = (status: string) => {
  const configs: Record<string, { className: string; icon: typeof Clock; label: string }> = {
    dirty: { className: "bg-red-500 hover:bg-red-600 text-white", icon: XCircle, label: "Dirty" },
    clean_pending_approval: { className: "bg-orange-500 hover:bg-orange-600 text-white", icon: Clock, label: "Pending Approval" },
    clean: { className: "bg-green-500 hover:bg-green-600 text-white", icon: CheckCircle2, label: "Clean" },
    occupied: { className: "bg-blue-500 hover:bg-blue-600 text-white", icon: Building2, label: "Occupied" },
    out_of_order: { className: "bg-gray-500 hover:bg-gray-600 text-white", icon: AlertCircle, label: "Out of Order" },
  };

  const config = configs[status] || configs.dirty;
  const Icon = config.icon;

  return (
    <Badge className={`uppercase ${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
};

const HousekeepingDashboard = () => {
  const { toast } = useToast();
  const { role, profile } = useAuth();
  const isMobile = useIsMobile();
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedStudios, setSelectedStudios] = useState<Set<string>>(new Set());
  
  // Details drawer/sheet
  const [selectedStatus, setSelectedStatus] = useState<HousekeepingStatusWithRelations | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // Bulk actions dialogs
  const [assignCleanerDialogOpen, setAssignCleanerDialogOpen] = useState(false);
  const [setDateDialogOpen, setSetDateDialogOpen] = useState(false);
  const [bulkDateValue, setBulkDateValue] = useState<string>("");
  const [selectedCleanerId, setSelectedCleanerId] = useState<string | null>(null);

  // Determine filtering based on role
  // Housekeepers see: only their assigned studios
  // Operations managers and superadmins see: everything
  const isHousekeeper = profile?.staff_subrole === "housekeeper";
  const shouldFilterByUser = isHousekeeper && profile?.id;
  
  const { data: housekeepingStatuses, isLoading } = useHousekeepingStatus(
    shouldFilterByUser
      ? { assigned_cleaner_id: profile.id }
      : undefined // Ops managers see all
  );
  const { data: cleaners } = useStaffMembers({ role: "staff", staff_subrole: "housekeeper" });
  const { data: activityLog } = useActivityLog(
    selectedStatus ? {
      entity_type: "housekeeping_status",
      entity_id: selectedStatus.id,
      limit: 50,
    } : undefined
  );
  const updateStatus = useUpdateHousekeepingStatus();
  const bulkUpdate = useBulkUpdateHousekeepingStatus();

  // Filtered statuses
  const filteredStatuses = useMemo(() => {
    if (!housekeepingStatuses) return [];
    let filtered = housekeepingStatuses;

    if (statusFilter !== "all") {
      filtered = filtered.filter((s) => s.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.studio?.studio_number.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [housekeepingStatuses, statusFilter, searchQuery]);

  // Stats calculation
  const stats = useMemo(() => {
    if (!housekeepingStatuses) {
      return {
        dirty: 0,
        pending_approval: 0,
        todays_assigned: 0,
        overdue: 0,
        without_roster: 0,
      };
    }

    const today = new Date();
    return {
      dirty: housekeepingStatuses.filter((s) => s.status === "dirty").length,
      pending_approval: housekeepingStatuses.filter((s) => s.status === "clean_pending_approval").length,
      todays_assigned: housekeepingStatuses.filter((s) => {
        if (!s.next_clean_due_at) return false;
        const dueDate = parseISO(s.next_clean_due_at);
        return format(dueDate, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
      }).length,
      overdue: housekeepingStatuses.filter((s) => {
        if (!s.next_clean_due_at || s.status === "clean" || s.status === "occupied") return false;
        return isBefore(parseISO(s.next_clean_due_at), today);
      }).length,
      without_roster: housekeepingStatuses.filter((s) => !s.assigned_cleaner_id).length,
    };
  }, [housekeepingStatuses]);

  // Check if user is Ops Manager (isHousekeeper already determined above for filtering)
  const isOpsManager = role === "operations_manager" || role === "staff" || role === "superadmin" || role === "admin";

  // Handle row click
  const handleRowClick = (status: HousekeepingStatusWithRelations) => {
    setSelectedStatus(status);
    setDetailsOpen(true);
  };

  // Handle bulk assign cleaner
  const handleBulkAssignCleaner = async () => {
    if (selectedStudios.size === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a cleaner and at least one studio.",
      });
      return;
    }

    try {
      const ids = Array.from(selectedStudios);
      await bulkUpdate.mutateAsync({
        ids,
        updates: {
          assigned_cleaner_id: selectedCleanerId || null,
        },
      });

      toast({
        title: "Cleaner assigned",
        description: `Assigned ${ids.length} studio(s) to cleaner.`,
      });

      setAssignCleanerDialogOpen(false);
      setSelectedCleanerId(null);
      setSelectedStudios(new Set());
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to assign cleaner.",
      });
    }
  };

  // Handle bulk set date
  const handleBulkSetDate = async () => {
    if (!bulkDateValue || selectedStudios.size === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a date and at least one studio.",
      });
      return;
    }

    try {
      const ids = Array.from(selectedStudios);
      await bulkUpdate.mutateAsync({
        ids,
        updates: {
          next_clean_due_at: bulkDateValue,
        },
      });

      toast({
        title: "Date set",
        description: `Set cleaning date for ${ids.length} studio(s).`,
      });

      setSetDateDialogOpen(false);
      setBulkDateValue("");
      setSelectedStudios(new Set());
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to set date.",
      });
    }
  };

  // Handle bulk mark dirty
  const handleBulkMarkDirty = async () => {
    if (selectedStudios.size === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select at least one studio.",
      });
      return;
    }

    try {
      const ids = Array.from(selectedStudios);
      await bulkUpdate.mutateAsync({
        ids,
        updates: {
          status: "dirty",
        },
      });

      toast({
        title: "Studios marked dirty",
        description: `Marked ${ids.length} studio(s) as dirty.`,
      });

      setSelectedStudios(new Set());
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update status.",
      });
    }
  };

  // Handle status update
  const handleStatusUpdate = async (newStatus: string, approvalStatus?: string) => {
    if (!selectedStatus) return;

    try {
      const updates: any = { status: newStatus };
      
      if (newStatus === "clean_pending_approval") {
        updates.approval_status = "pending";
      } else if (newStatus === "clean" && approvalStatus) {
        updates.approval_status = approvalStatus;
        updates.approved_by = profile?.id;
        updates.approved_at = new Date().toISOString();
      }

      await updateStatus.mutateAsync({
        id: selectedStatus.id,
        updates,
      });

      toast({
        title: "Status updated",
        description: "The housekeeping status has been updated successfully.",
      });

      setDetailsOpen(false);
      setSelectedStatus(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update status.",
      });
    }
  };

  // Skeleton loader
  if (isLoading) {
    return (
      <AdminLayout 
        pageTitle="Housekeeping" 
        subtitle={isHousekeeper ? "Manage your assigned studio cleaning tasks" : "Manage studio cleanliness and cleaning roster"}
      >
        <div className="space-y-6">
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 w-40 flex-shrink-0 rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="rounded-3xl">
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="rounded-3xl">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="Housekeeping" subtitle="Manage studio cleanliness and cleaning roster">
      <div className="space-y-6">
        {/* Status Filter Cards - Horizontally Scrollable */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {CLEAN_STATUSES.map((status) => (
            <button
              key={status.value}
              onClick={() => setStatusFilter(status.value)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                statusFilter === status.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {status.label}
            </button>
          ))}
        </div>

        {/* Stats Cards - Click to Filter */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "dirty" ? "all" : "dirty")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Dirty</div>
              <div className="text-xl md:text-2xl font-bold text-red-600">{stats.dirty}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "clean_pending_approval" ? "all" : "clean_pending_approval")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Pending Approval</div>
              <div className="text-xl md:text-2xl font-bold text-orange-600">{stats.pending_approval}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Today's Assigned</div>
              <div className="text-xl md:text-2xl font-bold text-blue-600">{stats.todays_assigned}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Overdue</div>
              <div className="text-xl md:text-2xl font-bold text-red-600">{stats.overdue}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Without Roster</div>
              <div className="text-xl md:text-2xl font-bold text-yellow-600">{stats.without_roster}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Bulk Actions */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg font-display font-bold uppercase tracking-wide">
              <Filter className="h-4 w-4 md:h-5 md:w-5" />
              Filters & Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Search Studio</Label>
                <Input
                  placeholder="Studio number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-full text-sm md:text-base"
                />
              </div>
              {isOpsManager && selectedStudios.size > 0 && (
                <>
                  <div className="flex items-end">
                    <Button
                      onClick={() => setAssignCleanerDialogOpen(true)}
                      variant="outline"
                      className="rounded-full w-full"
                    >
                      <UserCheck className="h-4 w-4 mr-2" />
                      Assign Cleaner ({selectedStudios.size})
                    </Button>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => setSetDateDialogOpen(true)}
                      variant="outline"
                      className="rounded-full w-full"
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Set Date ({selectedStudios.size})
                    </Button>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleBulkMarkDirty}
                      variant="destructive"
                      className="rounded-full w-full"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Mark Dirty ({selectedStudios.size})
                    </Button>
                  </div>
                </>
              )}
              {selectedStudios.size > 0 && (
                <div className="flex items-end">
                  <Button
                    onClick={() => setSelectedStudios(new Set())}
                    variant="ghost"
                    className="rounded-full w-full"
                  >
                    Clear Selection
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Studios List */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              Studios
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {filteredStatuses.length} studio{filteredStatuses.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredStatuses.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No studios found</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {searchQuery || statusFilter !== "all"
                    ? "Try adjusting your filters."
                    : "No housekeeping status records found."}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop: Table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {isOpsManager && (
                          <TableHead className="w-12">
                            <Checkbox
                              checked={selectedStudios.size === filteredStatuses.length && filteredStatuses.length > 0}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedStudios(new Set(filteredStatuses.map((s) => s.id)));
                                } else {
                                  setSelectedStudios(new Set());
                                }
                              }}
                            />
                          </TableHead>
                        )}
                        <TableHead className="text-xs md:text-sm">Studio</TableHead>
                        <TableHead className="text-xs md:text-sm">Status</TableHead>
                        <TableHead className="text-xs md:text-sm">Assigned Cleaner</TableHead>
                        <TableHead className="text-xs md:text-sm">Default Cleaning Day</TableHead>
                        <TableHead className="text-xs md:text-sm">Last Cleaned</TableHead>
                        <TableHead className="text-xs md:text-sm">Next Scheduled</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStatuses.map((status) => (
                        <TableRow
                          key={status.id}
                          className="hover:bg-accent/50 cursor-pointer"
                          onClick={() => handleRowClick(status)}
                        >
                          {isOpsManager && (
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedStudios.has(status.id)}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(selectedStudios);
                                  if (checked) {
                                    newSet.add(status.id);
                                  } else {
                                    newSet.delete(status.id);
                                  }
                                  setSelectedStudios(newSet);
                                }}
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            <span className="font-semibold text-sm">
                              {status.studio?.studio_number || "N/A"}
                            </span>
                          </TableCell>
                          <TableCell>{getStatusBadge(status.status)}</TableCell>
                          <TableCell>
                            {status.assigned_cleaner ? (
                              <span className="text-xs">
                                {status.assigned_cleaner.first_name} {status.assigned_cleaner.last_name}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {status.next_clean_due_at ? format(parseISO(status.next_clean_due_at), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {status.last_cleaned_at ? format(parseISO(status.last_cleaned_at), "MMM d, yyyy") : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {status.next_clean_due_at ? format(parseISO(status.next_clean_due_at), "MMM d, yyyy") : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile: Cards */}
                <div className="md:hidden space-y-4">
                  {filteredStatuses.map((status) => (
                    <Card
                      key={status.id}
                      className="rounded-2xl border border-border/60 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleRowClick(status)}
                    >
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="text-sm font-semibold mb-1">
                                Studio {status.studio?.studio_number || "N/A"}
                              </h3>
                            </div>
                            {getStatusBadge(status.status)}
                          </div>
                          {status.assigned_cleaner && (
                            <div className="text-xs text-muted-foreground">
                              Cleaner: {status.assigned_cleaner.first_name} {status.assigned_cleaner.last_name}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Next clean: {status.next_clean_due_at ? format(parseISO(status.next_clean_due_at), "MMM d, yyyy") : "Not scheduled"}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Details Drawer/Sheet */}
        {selectedStatus && (
          <>
            {isMobile ? (
              <Drawer open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DrawerContent className="max-h-[96vh]">
                  <DrawerHeader className="text-left">
                    <DrawerTitle>Studio {selectedStatus.studio?.studio_number || "N/A"}</DrawerTitle>
                    <DrawerDescription>
                      Housekeeping Status Details
                    </DrawerDescription>
                  </DrawerHeader>
                  <ScrollArea className="flex-1 px-4">
                    <HousekeepingDetailsContent
                      status={selectedStatus}
                      activityLog={activityLog || []}
                      cleaners={cleaners || []}
                      onStatusUpdate={handleStatusUpdate}
                      isOpsManager={isOpsManager}
                      isHousekeeper={isHousekeeper}
                      onClose={() => setDetailsOpen(false)}
                    />
                  </ScrollArea>
                </DrawerContent>
              </Drawer>
            ) : (
              <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
                <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Studio {selectedStatus.studio?.studio_number || "N/A"}</SheetTitle>
                    <SheetDescription>
                      Housekeeping Status Details
                    </SheetDescription>
                  </SheetHeader>
                  <ScrollArea className="flex-1 mt-6">
                    <HousekeepingDetailsContent
                      status={selectedStatus}
                      activityLog={activityLog || []}
                      cleaners={cleaners || []}
                      onStatusUpdate={handleStatusUpdate}
                      isOpsManager={isOpsManager}
                      isHousekeeper={isHousekeeper}
                      onClose={() => setDetailsOpen(false)}
                    />
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            )}
          </>
        )}

        {/* Bulk Assign Cleaner Dialog */}
        <Dialog open={assignCleanerDialogOpen} onOpenChange={setAssignCleanerDialogOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-3xl">
            <DialogHeader>
              <DialogTitle>Assign Cleaner</DialogTitle>
              <DialogDescription>
                Assign a cleaner to {selectedStudios.size} selected studio(s).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Cleaner</Label>
                <Select value={selectedCleanerId} onValueChange={setSelectedCleanerId}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue placeholder="Select cleaner..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cleaners?.map((cleaner) => (
                      <SelectItem key={cleaner.id} value={cleaner.id}>
                        {cleaner.first_name} {cleaner.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignCleanerDialogOpen(false)} className="rounded-full">
                Cancel
              </Button>
              <Button onClick={handleBulkAssignCleaner} className="rounded-full">
                Assign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Set Date Dialog */}
        <Dialog open={setDateDialogOpen} onOpenChange={setSetDateDialogOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-3xl">
            <DialogHeader>
              <DialogTitle>Set Cleaning Date</DialogTitle>
              <DialogDescription>
                Set the next cleaning date for {selectedStudios.size} selected studio(s).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Next Clean Date</Label>
                <Input
                  type="date"
                  value={bulkDateValue}
                  onChange={(e) => setBulkDateValue(e.target.value)}
                  className="rounded-full"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSetDateDialogOpen(false)} className="rounded-full">
                Cancel
              </Button>
              <Button onClick={handleBulkSetDate} className="rounded-full">
                Set Date
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

// Housekeeping Details Content Component
const HousekeepingDetailsContent = ({
  status,
  activityLog,
  cleaners,
  onStatusUpdate,
  isOpsManager,
  isHousekeeper,
  onClose,
}: {
  status: HousekeepingStatusWithRelations;
  activityLog: any[];
  cleaners: any[];
  onStatusUpdate: (status: string, approvalStatus?: string) => void;
  isOpsManager: boolean;
  isHousekeeper: boolean;
  onClose: () => void;
}) => {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedCleanerId, setSelectedCleanerId] = useState<string | null>(status.assigned_cleaner_id || null);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [nextCleanDate, setNextCleanDate] = useState<string>(
    status.next_clean_due_at ? format(parseISO(status.next_clean_due_at), "yyyy-MM-dd") : ""
  );
  const { toast } = useToast();
  const updateStatus = useUpdateHousekeepingStatus();

  const handleAssign = async () => {
    try {
      await updateStatus.mutateAsync({
        id: status.id,
        updates: {
          assigned_cleaner_id: selectedCleanerId || null,
        },
      });

      toast({
        title: "Cleaner assigned",
        description: "The cleaner has been assigned successfully.",
      });

      setAssignDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to assign cleaner.",
      });
    }
  };

  const handleSetDate = async () => {
    try {
      await updateStatus.mutateAsync({
        id: status.id,
        updates: {
          next_clean_due_at: nextCleanDate || null,
        },
      });

      toast({
        title: "Date set",
        description: "The cleaning date has been set successfully.",
      });

      setDateDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to set date.",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Current Status</Label>
          <div className="mt-1">{getStatusBadge(status.status)}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Studio</Label>
            <div className="mt-1 text-sm font-semibold">
              {status.studio?.studio_number || "N/A"}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Assigned Cleaner</Label>
            <div className="mt-1 text-sm">
              {status.assigned_cleaner ? (
                `${status.assigned_cleaner.first_name} ${status.assigned_cleaner.last_name}`
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Last Cleaned</Label>
            <div className="mt-1 text-sm">
              {status.last_cleaned_at ? format(parseISO(status.last_cleaned_at), "MMM d, yyyy") : "—"}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Next Clean Due</Label>
            <div className="mt-1 text-sm">
              {status.next_clean_due_at ? format(parseISO(status.next_clean_due_at), "MMM d, yyyy") : "—"}
            </div>
          </div>
        </div>

        {status.notes && (
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <p className="text-sm mt-1 whitespace-pre-wrap">{status.notes}</p>
          </div>
        )}
      </div>

      <Separator />

      {/* Activity Log / Timeline */}
      <div>
        <Label className="text-xs text-muted-foreground mb-3 block">Cleaning History Timeline</Label>
        <div className="space-y-3">
          {activityLog.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          ) : (
            activityLog.map((log) => (
              <div key={log.id} className="flex gap-3 text-xs">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-1.5" />
                <div className="flex-1">
                  <p className="font-medium">{log.message}</p>
                  <p className="text-muted-foreground">
                    {format(new Date(log.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Separator />

      {/* Actions - Role Based */}
      <div className="space-y-3">
        {isOpsManager && status.status === "clean_pending_approval" && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => onStatusUpdate("clean", "approved")}
              className="rounded-full bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve
            </Button>
            <Button
              variant="destructive"
              onClick={() => onStatusUpdate("dirty", "rejected")}
              className="rounded-full"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        )}

        {isHousekeeper && 
         status.assigned_cleaner_id && 
         status.status === "dirty" && (
          <Button
            onClick={() => onStatusUpdate("clean_pending_approval")}
            className="rounded-full w-full"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Request Clean Approval
          </Button>
        )}

        {isOpsManager && (
          <>
            <Button
              onClick={() => setAssignDialogOpen(true)}
              variant="outline"
              className="rounded-full w-full"
            >
              <UserCheck className="h-4 w-4 mr-2" />
              {status.assigned_cleaner_id ? "Change Cleaner" : "Assign Cleaner"}
            </Button>
            <Button
              onClick={() => setDateDialogOpen(true)}
              variant="outline"
              className="rounded-full w-full"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Set Next Clean Date
            </Button>
            {status.status !== "clean" && (
              <Button
                onClick={() => onStatusUpdate("clean")}
                className="rounded-full w-full bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Mark as Clean
              </Button>
            )}
            <Button
              onClick={() => onStatusUpdate("dirty")}
              variant="destructive"
              className="rounded-full w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Mark as Dirty
            </Button>
          </>
        )}
      </div>

      {/* Close Button */}
      <div className="pt-4">
        <Button
          variant="outline"
          onClick={onClose}
          className="rounded-full w-full"
        >
          Close
        </Button>
      </div>

      {/* Assign Cleaner Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Assign Cleaner</DialogTitle>
            <DialogDescription>
              Select a cleaner for this studio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Cleaner</Label>
              <Select 
                value={selectedCleanerId || "none"} 
                onValueChange={(value) => setSelectedCleanerId(value === "none" ? null : value)}
              >
                <SelectTrigger className="rounded-full">
                  <SelectValue placeholder="Select cleaner..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassign</SelectItem>
                  {cleaners.map((cleaner) => (
                    <SelectItem key={cleaner.id} value={cleaner.id}>
                      {cleaner.first_name} {cleaner.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button onClick={handleAssign} className="rounded-full">
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Date Dialog */}
      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Set Next Clean Date</DialogTitle>
            <DialogDescription>
              Set when this studio should be cleaned next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Next Clean Date</Label>
              <Input
                type="date"
                value={nextCleanDate}
                onChange={(e) => setNextCleanDate(e.target.value)}
                className="rounded-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateDialogOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button onClick={handleSetDate} className="rounded-full">
              Set Date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HousekeepingDashboard;

