import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  useCommunalAreaHousekeeping,
  useUpdateCommunalAreaHousekeeping,
  useBulkUpdateCommunalAreaHousekeeping,
  type CommunalAreaHousekeepingWithRelations,
} from "@/hooks/useCommunalAreaHousekeeping";
import {
  useCommunalAreas,
  useCreateCommunalArea,
  useUpdateCommunalArea,
  useDeleteCommunalArea,
} from "@/hooks/useCommunalAreas";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useStaffMembers } from "@/hooks/useStaffMembers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isBefore, parseISO } from "date-fns";
import {
  Sparkles, Clock, CheckCircle2, XCircle, AlertCircle, Loader2,
  UserCheck, Calendar, Building2, Check, X, Plus, Pencil, Trash2
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { logActivity } from "@/utils/auditLog";
import { supabase } from "@/integrations/supabase/client";

const SCHEDULE_TYPES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
] as const;

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
] as const;

const CLEAN_STATUSES = [
  { value: "all", label: "All Status" },
  { value: "clean", label: "Clean" },
  { value: "dirty", label: "Dirty" },
  { value: "out_of_order", label: "Out of Order" },
  { value: "clean_pending_approval", label: "Pending Approval" },
];

const getStatusBadge = (status: string) => {
  const configs: Record<string, { className: string; icon: typeof Clock; label: string }> = {
    dirty: { className: "bg-red-500 hover:bg-red-600 text-white", icon: XCircle, label: "Dirty" },
    clean_pending_approval: { className: "bg-orange-500 hover:bg-orange-600 text-white", icon: Clock, label: "Pending Approval" },
    clean: { className: "bg-green-500 hover:bg-green-600 text-white", icon: CheckCircle2, label: "Clean" },
    out_of_order: { className: "bg-gray-500 hover:bg-gray-600 text-white", icon: AlertCircle, label: "Out of Order" },
  };

  const config = configs[status] || configs.dirty;
  const Icon = config.icon;

  return (
    <Badge className={`uppercase ${config.className} rounded-md px-2.5 py-0.5 text-xs font-medium flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
};

const CommunalAreaHousekeepingDashboard = () => {
  const { toast } = useToast();
  const { role, profile } = useAuth();
  const isMobile = useIsMobile();
  
  const isHousekeeper = profile?.staff_subrole === "housekeeper";
  const isMaintenanceOfficer = profile?.staff_subrole === "maintenance_officer";
  const canEdit = !isHousekeeper && !isMaintenanceOfficer;
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  
  const [selectedStatus, setSelectedStatus] = useState<CommunalAreaHousekeepingWithRelations | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  const [assignCleanerDialogOpen, setAssignCleanerDialogOpen] = useState(false);
  const [setDateDialogOpen, setSetDateDialogOpen] = useState(false);
  const [bulkDateValue, setBulkDateValue] = useState<string>("");
  const [selectedCleanerId, setSelectedCleanerId] = useState<string | null>(null);

  // CRUD dialog states
  const [areaDialogOpen, setAreaDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    location: "",
    description: "",
    cleaning_schedule_type: "weekly" as "daily" | "weekly" | "biweekly" | "monthly" | "custom",
    cleaning_schedule_days: [] as number[],
    cleaning_schedule_time: "09:00",
    is_active: true,
  });

  const createArea = useCreateCommunalArea();
  const updateArea = useUpdateCommunalArea();
  const deleteArea = useDeleteCommunalArea();
  const { data: areas } = useCommunalAreas();

  const shouldFilterByUser = isHousekeeper && profile?.id;
  
  const { data: housekeepingStatuses, isLoading } = useCommunalAreaHousekeeping(
    shouldFilterByUser
      ? { assignedCleanerId: profile.id }
      : undefined
  );
  const { data: cleaners } = useStaffMembers({ role: "staff", staff_subrole: "housekeeper" });
  const { data: activityLog } = useActivityLog(
    selectedStatus ? {
      entity_type: "communal_area_housekeeping",
      entity_id: selectedStatus.id,
      limit: 50,
    } : undefined
  );
  const updateStatus = useUpdateCommunalAreaHousekeeping();
  const bulkUpdate = useBulkUpdateCommunalAreaHousekeeping();

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
          s.communal_area?.name.toLowerCase().includes(query) ||
          s.communal_area?.location?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [housekeepingStatuses, statusFilter, searchQuery]);

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
        if (!s.next_clean_due_at || s.status === "clean") return false;
        return isBefore(parseISO(s.next_clean_due_at), today);
      }).length,
      without_roster: housekeepingStatuses.filter((s) => !s.assigned_cleaner_id).length,
    };
  }, [housekeepingStatuses]);

  const isOpsManager = role === "operations_manager" || role === "staff" || role === "superadmin" || role === "admin";

  const handleRowClick = (status: CommunalAreaHousekeepingWithRelations) => {
    setSelectedStatus(status);
    setDetailsOpen(true);
  };

  const handleBulkAssignCleaner = async () => {
    if (selectedAreas.size === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a cleaner and at least one area.",
      });
      return;
    }

    try {
      const ids = Array.from(selectedAreas);
      await bulkUpdate.mutateAsync({
        ids,
        updates: {
          assigned_cleaner_id: selectedCleanerId || null,
        },
      });

      toast({
        title: "Cleaner assigned",
        description: `Assigned ${ids.length} area(s) to cleaner.`,
      });

      setAssignCleanerDialogOpen(false);
      setSelectedCleanerId(null);
      setSelectedAreas(new Set());
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to assign cleaner.",
      });
    }
  };

  const handleBulkSetDate = async () => {
    if (!bulkDateValue || selectedAreas.size === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a date and at least one area.",
      });
      return;
    }

    try {
      const ids = Array.from(selectedAreas);
      await bulkUpdate.mutateAsync({
        ids,
        updates: {
          next_clean_due_at: bulkDateValue,
        },
      });

      toast({
        title: "Date set",
        description: `Set next clean date for ${ids.length} area(s).`,
      });

      setSetDateDialogOpen(false);
      setBulkDateValue("");
      setSelectedAreas(new Set());
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to set date.",
      });
    }
  };

  const handleStatusChange = async (id: string, newStatus: string, completionDate?: string) => {
    try {
      const updates: any = { status: newStatus };

      if (newStatus === "clean_pending_approval") {
        updates.last_cleaned_at = new Date().toISOString();
      }

      if (completionDate) {
        updates.last_cleaned_at = completionDate;
      }

      await updateStatus.mutateAsync({ id, updates });

      // Log activity
      await logActivity({
        action: "update",
        entityType: "communal_area_housekeeping",
        entityId: id,
        payload: { status_change: newStatus },
      });

      toast({
        title: "Status updated",
        description: "Communal area status has been updated.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update status.",
      });
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      await updateStatus.mutateAsync({
        id,
        updates: {
          status: "clean",
          approval_status: "approved",
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        },
      });

      await logActivity({
        action: "approve",
        entityType: "communal_area_housekeeping",
        entityId: id,
      });

      toast({
        title: "Approved",
        description: "Communal area cleaning has been approved.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to approve.",
      });
    }
  };

  const handleReject = async (id: string) => {
    try {
      await updateStatus.mutateAsync({
        id,
        updates: {
          status: "dirty",
          approval_status: "rejected",
          approved_by: null,
          approved_at: null,
        },
      });

      await logActivity({
        action: "reject",
        entityType: "communal_area_housekeeping",
        entityId: id,
      });

      toast({
        title: "Rejected",
        description: "Communal area cleaning has been rejected.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to reject.",
      });
    }
  };

  const handleOpenAreaDialog = (areaData?: any) => {
    // If areaData is passed (from card click), find the full area from areas list
    let areaToEdit = areaData;
    if (areaData && areas) {
      const fullArea = areas.find(a => a.id === areaData.id);
      if (fullArea) areaToEdit = fullArea;
    }

    if (areaToEdit) {
      setEditingArea(areaToEdit);
      setFormData({
        name: areaToEdit.name || "",
        location: areaToEdit.location || "",
        description: areaToEdit.description || "",
        cleaning_schedule_type: areaToEdit.cleaning_schedule_type || "weekly",
        cleaning_schedule_days: areaToEdit.cleaning_schedule_days || [],
        cleaning_schedule_time: areaToEdit.cleaning_schedule_time || "09:00",
        is_active: areaToEdit.is_active ?? true,
      });
    } else {
      setEditingArea(null);
      setFormData({
        name: "",
        location: "",
        description: "",
        cleaning_schedule_type: "weekly",
        cleaning_schedule_days: [],
        cleaning_schedule_time: "09:00",
        is_active: true,
      });
    }
    setAreaDialogOpen(true);
  };

  const handleCloseAreaDialog = () => {
    setAreaDialogOpen(false);
    setEditingArea(null);
  };

  const handleAreaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a name",
        variant: "destructive",
      });
      return;
    }

    if (!formData.cleaning_schedule_time) {
      toast({
        title: "Validation Error",
        description: "Please select a default cleaning time",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingArea) {
        await updateArea.mutateAsync({
          id: editingArea.id,
          updates: formData,
        });
        toast({
          title: "Area Updated",
          description: "Communal area has been updated successfully.",
        });
      } else {
        await createArea.mutateAsync(formData);
        toast({
          title: "Area Created",
          description: "Communal area has been created successfully.",
        });
      }
      handleCloseAreaDialog();
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to save communal area. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDeleteArea = async () => {
    if (!editingArea) return;

    try {
      await deleteArea.mutateAsync(editingArea.id);
      toast({
        title: "Area Deleted",
        description: "Communal area has been deleted successfully.",
      });
      setDeleteDialogOpen(false);
      handleCloseAreaDialog();
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to delete communal area. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const toggleDay = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      cleaning_schedule_days: prev.cleaning_schedule_days.includes(day)
        ? prev.cleaning_schedule_days.filter((d) => d !== day)
        : [...prev.cleaning_schedule_days, day].sort(),
    }));
  };

  if (isLoading && !housekeepingStatuses) {
    return (
      <AdminLayout pageTitle="Communal Areas" subtitle="Manage communal areas and cleaning">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  const DetailContent = ({ status, onClose }: { status: CommunalAreaHousekeepingWithRelations; onClose: () => void }) => {
    const [completionDate, setCompletionDate] = useState<string>("");
    const [completionDateDialogOpen, setCompletionDateDialogOpen] = useState(false);
    const [assignDialogOpen, setAssignDialogOpen] = useState(false);
    const [selectedCleanerId, setSelectedCleanerId] = useState<string>(status.assigned_cleaner_id || "__unassign__");
    const [dateDialogOpen, setDateDialogOpen] = useState(false);
    const [nextCleanDate, setNextCleanDate] = useState<string>(
      status.next_clean_due_at ? format(parseISO(status.next_clean_due_at), "yyyy-MM-dd") : ""
    );
    const { data: cleaners } = useStaffMembers({ role: "staff", staff_subrole: "housekeeper" });
    const updateStatus = useUpdateCommunalAreaHousekeeping();
    const { role: detailRole, profile: detailProfile } = useAuth();

    const handleAssign = async () => {
      try {
        await updateStatus.mutateAsync({
          id: status.id,
          updates: {
            assigned_cleaner_id: selectedCleanerId === "__unassign__" ? null : (selectedCleanerId || null),
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
        <div>
          <Label className="text-xs text-muted-foreground">Area</Label>
          <p className="text-sm font-semibold mt-1">
            {status.communal_area?.name}
            {status.communal_area?.location && ` - ${status.communal_area.location}`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div className="mt-1">{getStatusBadge(status.status)}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Assigned Cleaner</Label>
            <div className="mt-1 text-sm">
              {status.assigned_cleaner
                ? `${status.assigned_cleaner.first_name} ${status.assigned_cleaner.last_name}`
                : "Unassigned"}
            </div>
          </div>
          {status.next_clean_due_at && (
            <div>
              <Label className="text-xs text-muted-foreground">Next Clean Due</Label>
              <div className="mt-1 text-sm">
                {format(parseISO(status.next_clean_due_at), "MMM d, yyyy")}
              </div>
            </div>
          )}
          {status.last_cleaned_at && (
            <div>
              <Label className="text-xs text-muted-foreground">Last Cleaned</Label>
              <div className="mt-1 text-sm">
                {format(parseISO(status.last_cleaned_at), "MMM d, yyyy")}
              </div>
            </div>
          )}
        </div>

        {status.notes && (
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <p className="text-sm mt-1 whitespace-pre-wrap">{status.notes}</p>
          </div>
        )}

        <Separator />

        {/* Actions - Role Based */}
        <div className="space-y-3">
          {(detailRole === "operations_manager" || detailRole === "admin" || detailRole === "superadmin") && status.status === "clean_pending_approval" && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => handleApprove(status.id)}
                className="rounded-md bg-green-600 hover:bg-green-700"
              >
                <Check className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button
                onClick={() => handleReject(status.id)}
                variant="destructive"
                className="rounded-md"
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </div>
          )}

          {isHousekeeper && status.assigned_cleaner_id === detailProfile?.id && status.status === "dirty" && (
            <Button
              onClick={() => handleStatusChange(status.id, "clean_pending_approval")}
              className="rounded-md w-full"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark as Clean (Pending Approval)
            </Button>
          )}

          {(detailRole === "operations_manager" || detailRole === "admin" || detailRole === "superadmin") && (
            <>
              <Button
                onClick={() => setAssignDialogOpen(true)}
                variant="outline"
                className="rounded-md w-full"
              >
                <UserCheck className="h-4 w-4 mr-2" />
                {status.assigned_cleaner_id ? "Change Cleaner" : "Assign Cleaner"}
              </Button>
              <Button
                onClick={() => setDateDialogOpen(true)}
                variant="outline"
                className="rounded-md w-full"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Set Next Clean Date
              </Button>
              {status.status !== "clean" && (
                <Button
                  onClick={() => handleStatusChange(status.id, "clean")}
                  className="rounded-md w-full bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Mark as Clean
                </Button>
              )}
              <Button
                onClick={() => handleStatusChange(status.id, "dirty")}
                variant="destructive"
                className="rounded-md w-full"
              >
                <XCircle className="h-4 w-4 mr-2" />
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
            className="rounded-md w-full"
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
                Select a cleaner for this communal area.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Cleaner</Label>
                <Select value={selectedCleanerId || "__unassign__"} onValueChange={setSelectedCleanerId}>
                  <SelectTrigger className="rounded-md">
                    <SelectValue placeholder="Select cleaner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassign__">Unassign</SelectItem>
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
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)} className="rounded-md">
                Cancel
              </Button>
              <Button onClick={handleAssign} className="rounded-md">
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
                Set the next scheduled cleaning date for this communal area.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Next Clean Date</Label>
                <Input
                  type="date"
                  value={nextCleanDate}
                  onChange={(e) => setNextCleanDate(e.target.value)}
                  className="rounded-md"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDateDialogOpen(false)} className="rounded-md">
                Cancel
              </Button>
              <Button onClick={handleSetDate} className="rounded-md">
                Set Date
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  return (
    <AdminLayout 
      pageTitle="Communal Areas" 
      subtitle="Manage communal areas and cleaning"
      mobileActionButton={
        canEdit ? (
          <Button
            onClick={() => handleOpenAreaDialog()}
            size="sm"
            className="rounded-md h-9 w-9 p-0 bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Dirty</div>
              <div className="text-lg md:text-2xl font-bold text-red-600">{stats.dirty}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Pending Approval</div>
              <div className="text-lg md:text-2xl font-bold text-orange-600">{stats.pending_approval}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Today's Assigned</div>
              <div className="text-lg md:text-2xl font-bold text-blue-600">{stats.todays_assigned}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Overdue</div>
              <div className="text-lg md:text-2xl font-bold text-red-600">{stats.overdue}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Unassigned</div>
              <div className="text-lg md:text-2xl font-bold text-yellow-600">{stats.without_roster}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 w-full md:w-auto">
                <div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="rounded-md text-xs md:text-sm h-9 md:h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLEAN_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value} className="text-xs md:text-sm">
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Input
                    placeholder="Search by area name or location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="rounded-md text-xs md:text-sm h-9 md:h-10"
                  />
                </div>
              </div>
              {canEdit && (
                <div className="hidden md:flex">
                  <Button onClick={() => handleOpenAreaDialog()} className="rounded-md">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Communal Area
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Areas List */}
        {filteredStatuses.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-xs md:text-sm text-muted-foreground">No communal areas found.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                        <h3 className="text-xs md:text-sm font-semibold">{status.communal_area?.name}</h3>
                        {status.communal_area?.location && (
                          <p className="text-[10px] md:text-xs text-muted-foreground mt-1">
                            {status.communal_area.location}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(status.status)}
                        {canEdit && status.communal_area && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenAreaDialog(status.communal_area);
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {status.assigned_cleaner && (
                      <div className="text-[10px] md:text-xs text-muted-foreground">
                        Cleaner: {status.assigned_cleaner.first_name} {status.assigned_cleaner.last_name}
                      </div>
                    )}
                    {status.next_clean_due_at && (
                      <div className="text-[10px] md:text-xs text-muted-foreground">
                        Due: {format(parseISO(status.next_clean_due_at), "MMM d, yyyy")}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Detail Drawer/Sheet */}
      {isMobile ? (
        <Drawer open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader>
              <DrawerTitle>Area Details</DrawerTitle>
              <DrawerDescription>View and manage communal area housekeeping</DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-4 overflow-y-auto">
              {selectedStatus && <DetailContent status={selectedStatus} />}
            </div>
            <DrawerFooter>
              <Button variant="outline" onClick={() => setDetailsOpen(false)} className="rounded-md">
                Close
              </Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Area Details</SheetTitle>
              <SheetDescription>View and manage communal area housekeeping</SheetDescription>
            </SheetHeader>
            <div className="mt-6">
              {selectedStatus && <DetailContent status={selectedStatus} onClose={() => setDetailsOpen(false)} />}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Create/Edit Area Dialog */}
      {canEdit && (
        <>
          <Dialog open={areaDialogOpen} onOpenChange={setAreaDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingArea ? "Edit Communal Area" : "Create Communal Area"}</DialogTitle>
                <DialogDescription>
                  {editingArea
                    ? "Update the communal area details and cleaning schedule."
                    : "Create a new communal area with cleaning schedule."}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleAreaSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="area-name">Name *</Label>
                  <Input
                    id="area-name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Main Lobby, Gym, Common Room"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="area-location">Location</Label>
                  <Input
                    id="area-location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="e.g., Ground Floor, Building A"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="area-description">Description</Label>
                  <Textarea
                    id="area-description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Additional details about this area..."
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="area-schedule-type">Cleaning Schedule Type *</Label>
                  <Select
                    value={formData.cleaning_schedule_type}
                    onValueChange={(value: any) =>
                      setFormData({ ...formData, cleaning_schedule_type: value, cleaning_schedule_days: [] })
                    }
                  >
                    <SelectTrigger id="area-schedule-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(formData.cleaning_schedule_type === "weekly" || formData.cleaning_schedule_type === "biweekly") && (
                  <div className="space-y-2">
                    <Label>Cleaning Days</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <Button
                          key={day.value}
                          type="button"
                          variant={formData.cleaning_schedule_days.includes(day.value) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDay(day.value)}
                        >
                          {day.label.slice(0, 3)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="area-schedule-time">Default Cleaning Time *</Label>
                  <Input
                    id="area-schedule-time"
                    type="time"
                    value={formData.cleaning_schedule_time}
                    onChange={(e) => setFormData({ ...formData, cleaning_schedule_time: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Required. This is the default time when cleaning should be scheduled.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="area-is-active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="area-is-active">Active</Label>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={handleCloseAreaDialog}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createArea.isPending || updateArea.isPending}>
                    {(createArea.isPending || updateArea.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {editingArea ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Dialog */}
          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Communal Area</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{editingArea?.name}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteArea} className="bg-destructive text-destructive-foreground">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </AdminLayout>
  );
};

export default CommunalAreaHousekeepingDashboard;

