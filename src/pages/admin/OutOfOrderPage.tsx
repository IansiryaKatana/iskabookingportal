import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useOutOfOrderRecords, useCreateOutOfOrderRecord, useUpdateOutOfOrderRecord, type OutOfOrderRecordWithRelations } from "@/hooks/useOutOfOrder";
import { useAdminStudios } from "@/hooks/useAdminStudios";
import { useMaintenanceRequests } from "@/hooks/useMaintenanceRequests";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, isPast, isFuture } from "date-fns";
import {
  AlertTriangle, Clock, CheckCircle2, XCircle, Plus,
  Loader2, Building2, Wrench, Calendar, User
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

const OutOfOrderPage = () => {
  const { toast } = useToast();
  const { role, profile } = useAuth();
  const isMobile = useIsMobile();
  
  // Filters
  const [activeFilter, setActiveFilter] = useState<string>("all"); // "all", "active", "inactive"
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Create/Edit dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<OutOfOrderRecordWithRelations | null>(null);
  
  // Form state
  const [formStudioId, setFormStudioId] = useState<string>("");
  const [formReason, setFormReason] = useState<string>("");
  const [formStartAt, setFormStartAt] = useState<string>(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [formExpectedEndAt, setFormExpectedEndAt] = useState<string>("");
  const [formIsBlocking, setFormIsBlocking] = useState<boolean>(true);
  const [formMaintenanceRequestId, setFormMaintenanceRequestId] = useState<string | null>(null);

  const { data: records, isLoading } = useOutOfOrderRecords();
  const { data: studios } = useAdminStudios();
  const { data: allMaintenanceRequests } = useMaintenanceRequests();
  
  // Filter maintenance requests for active ones
  const maintenanceRequests = useMemo(() => {
    if (!allMaintenanceRequests) return [];
    return allMaintenanceRequests.filter(req => 
      ["new", "triaged", "assigned", "in_progress"].includes(req.status || "")
    );
  }, [allMaintenanceRequests]);
  
  // Filter studios for active ones
  const activeStudios = useMemo(() => {
    if (!studios) return [];
    return studios.filter(studio => studio.is_active);
  }, [studios]);
  const createRecord = useCreateOutOfOrderRecord();
  const updateRecord = useUpdateOutOfOrderRecord();

  // Filtered records
  const filteredRecords = useMemo(() => {
    if (!records) return [];
    let filtered = records;

    if (activeFilter === "active") {
      filtered = filtered.filter((r) => r.is_active);
    } else if (activeFilter === "inactive") {
      filtered = filtered.filter((r) => !r.is_active);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.studio?.studio_number.toLowerCase().includes(query) ||
          r.reason.toLowerCase().includes(query) ||
          r.maintenance_request?.title.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [records, activeFilter, searchQuery]);

  // Stats calculation
  const stats = useMemo(() => {
    if (!records) {
      return {
        active: 0,
        inactive: 0,
        overdue: 0,
      };
    }

    const now = new Date();
    return {
      active: records.filter((r) => r.is_active).length,
      inactive: records.filter((r) => !r.is_active).length,
      overdue: records.filter((r) => {
        if (!r.is_active || !r.expected_end_at) return false;
        return isPast(parseISO(r.expected_end_at)) && r.end_at === null;
      }).length,
    };
  }, [records]);

  // Check if user is Ops Manager or Maintenance Officer
  const isOpsManager = role === "operations_manager" || role === "staff" || role === "superadmin" || role === "admin";
  const isMaintenanceOfficer = profile?.staff_subrole === "maintenance_officer";

  // Handle create
  const handleCreate = async () => {
    if (!formStudioId || !formReason) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all required fields (Studio and Reason).",
      });
      return;
    }

    try {
      await createRecord.mutateAsync({
        studio_id: formStudioId,
        maintenance_request_id: formMaintenanceRequestId || null,
        reason: formReason,
        start_at: formStartAt || undefined,
        expected_end_at: formExpectedEndAt || undefined,
        is_active: true,
        is_blocking: formIsBlocking,
      });

      toast({
        title: "Out of Order record created",
        description: "The studio has been marked as out of order.",
      });

      // Reset form
      setFormStudioId("");
      setFormReason("");
      setFormStartAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
      setFormExpectedEndAt("");
      setFormIsBlocking(true);
      setFormMaintenanceRequestId(null);
      setCreateDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create out of order record.",
      });
    }
  };

  // Handle close record
  const handleCloseRecord = async (record: OutOfOrderRecordWithRelations) => {
    try {
      await updateRecord.mutateAsync({
        id: record.id,
        updates: {
          is_active: false,
          end_at: new Date().toISOString(),
        },
      });

      toast({
        title: "Record closed",
        description: "The out of order record has been closed.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to close record.",
      });
    }
  };

  // Handle reopen record
  const handleReopenRecord = async (record: OutOfOrderRecordWithRelations) => {
    try {
      await updateRecord.mutateAsync({
        id: record.id,
        updates: {
          is_active: true,
          end_at: null,
        },
      });

      toast({
        title: "Record reopened",
        description: "The out of order record has been reopened.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to reopen record.",
      });
    }
  };

  // Open edit dialog
  const handleEdit = (record: OutOfOrderRecordWithRelations) => {
    setSelectedRecord(record);
    setFormStudioId(record.studio_id);
    setFormReason(record.reason);
    setFormStartAt(record.start_at ? format(parseISO(record.start_at), "yyyy-MM-dd'T'HH:mm") : format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setFormExpectedEndAt(record.expected_end_at ? format(parseISO(record.expected_end_at), "yyyy-MM-dd'T'HH:mm") : "");
    setFormIsBlocking(record.is_blocking);
    setFormMaintenanceRequestId(record.maintenance_request_id || null);
    setEditDialogOpen(true);
  };

  // Handle update
  const handleUpdate = async () => {
    if (!selectedRecord || !formReason) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all required fields.",
      });
      return;
    }

    try {
      await updateRecord.mutateAsync({
        id: selectedRecord.id,
        updates: {
          reason: formReason,
          start_at: formStartAt || undefined,
          expected_end_at: formExpectedEndAt || undefined,
          is_blocking: formIsBlocking,
          maintenance_request_id: formMaintenanceRequestId || null,
        },
      });

      toast({
        title: "Record updated",
        description: "The out of order record has been updated.",
      });

      setEditDialogOpen(false);
      setSelectedRecord(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update record.",
      });
    }
  };

  // Skeleton loader
  if (isLoading && !records) {
    return (
      <AdminLayout pageTitle="Out of Order" subtitle="Manage studios marked out of order">
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
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
    <AdminLayout pageTitle="Out of Order" subtitle="Manage studios marked out of order">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setActiveFilter(activeFilter === "active" ? "all" : "active")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Active</div>
              <div className="text-xl md:text-2xl font-bold text-red-600">{stats.active}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setActiveFilter(activeFilter === "inactive" ? "all" : "inactive")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Inactive</div>
              <div className="text-xl md:text-2xl font-bold text-gray-600">{stats.inactive}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Overdue</div>
              <div className="text-xl md:text-2xl font-bold text-orange-600">{stats.overdue}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader className="flex flex-row items-center justify-end space-y-0 pb-4">
              {(isOpsManager || isMaintenanceOfficer) && (
                <Button
                  onClick={() => {
                    setFormStudioId("");
                    setFormReason("");
                    setFormStartAt(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
                    setFormExpectedEndAt("");
                    setFormIsBlocking(true);
                    setFormMaintenanceRequestId(null);
                    setCreateDialogOpen(true);
                  }}
                  className="rounded-md"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Out of Order
                </Button>
              )}
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Status</Label>
                <Select value={activeFilter} onValueChange={setActiveFilter}>
                  <SelectTrigger className="rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Search</Label>
                <Input
                  placeholder="Studio, reason, maintenance request..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-md text-sm md:text-base"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Records List */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              Out of Order Records
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {filteredRecords.length} record{filteredRecords.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredRecords.length === 0 ? (
              <div className="text-center py-12">
                <AlertTriangle className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No records found</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {searchQuery || activeFilter !== "all"
                    ? "Try adjusting your filters."
                    : "No out of order records found."}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop: Table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs md:text-sm">Studio</TableHead>
                        <TableHead className="text-xs md:text-sm">Reason</TableHead>
                        <TableHead className="text-xs md:text-sm">Maintenance Request</TableHead>
                        <TableHead className="text-xs md:text-sm">Start Date</TableHead>
                        <TableHead className="text-xs md:text-sm">Expected End</TableHead>
                        <TableHead className="text-xs md:text-sm">Status</TableHead>
                        <TableHead className="text-xs md:text-sm">Blocking</TableHead>
                        <TableHead className="text-xs md:text-sm">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.map((record) => {
                        const isOverdue = record.is_active && 
                          record.expected_end_at && 
                          isPast(parseISO(record.expected_end_at)) && 
                          !record.end_at;
                        
                        return (
                          <TableRow key={record.id} className="hover:bg-accent/50">
                            <TableCell>
                              <span className="font-semibold text-sm">
                                {record.studio?.studio_number || "N/A"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm max-w-xs truncate">{record.reason}</div>
                            </TableCell>
                            <TableCell>
                              {record.maintenance_request ? (
                                <div className="text-xs">
                                  <div className="font-medium">{record.maintenance_request.title}</div>
                                  <Badge variant="outline" className="mt-1 text-xs">
                                    {record.maintenance_request.status}
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {format(parseISO(record.start_at), "MMM d, yyyy 'at' h:mm a")}
                            </TableCell>
                            <TableCell className="text-xs">
                              {record.expected_end_at ? (
                                <div>
                                  <div>{format(parseISO(record.expected_end_at), "MMM d, yyyy 'at' h:mm a")}</div>
                                  {isOverdue && (
                                    <Badge variant="destructive" className="mt-1 text-xs">
                                      Overdue
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>
                              {record.is_active ? (
                                <Badge className="bg-red-500 hover:bg-red-600 text-white rounded-md">
                                  Active
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-500 hover:bg-gray-600 text-white rounded-md">
                                  Closed
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {record.is_blocking ? (
                                <Badge variant="destructive" className="rounded-md text-xs">
                                  Blocking
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="rounded-md text-xs">
                                  Non-blocking
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                {(isOpsManager || isMaintenanceOfficer) && (
                                  <>
                                    <Button
                                      onClick={() => handleEdit(record)}
                                      variant="outline"
                                      size="sm"
                                      className="rounded-md text-xs"
                                    >
                                      Edit
                                    </Button>
                                    {record.is_active ? (
                                      <Button
                                        onClick={() => handleCloseRecord(record)}
                                        variant="destructive"
                                        size="sm"
                                        className="rounded-md text-xs"
                                      >
                                        Close
                                      </Button>
                                    ) : (
                                      <Button
                                        onClick={() => handleReopenRecord(record)}
                                        variant="outline"
                                        size="sm"
                                        className="rounded-md text-xs"
                                      >
                                        Reopen
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile: Cards */}
                <div className="md:hidden space-y-4">
                  {filteredRecords.map((record) => {
                    const isOverdue = record.is_active && 
                      record.expected_end_at && 
                      isPast(parseISO(record.expected_end_at)) && 
                      !record.end_at;
                    
                    return (
                      <Card
                        key={record.id}
                        className="rounded-2xl border border-border/60"
                      >
                        <CardContent className="p-4">
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h3 className="text-sm font-semibold mb-1">
                                  Studio {record.studio?.studio_number || "N/A"}
                                </h3>
                                <p className="text-xs text-muted-foreground">{record.reason}</p>
                              </div>
                              {record.is_active ? (
                                <Badge className="bg-red-500 hover:bg-red-600 text-white rounded-md">
                                  Active
                                </Badge>
                              ) : (
                                <Badge className="bg-gray-500 hover:bg-gray-600 text-white rounded-md">
                                  Closed
                                </Badge>
                              )}
                            </div>
                            {record.maintenance_request && (
                              <div className="text-xs">
                                <div className="font-medium">Maintenance: {record.maintenance_request.title}</div>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                              <div>
                                <div>Start</div>
                                <div className="font-medium text-foreground">
                                  {format(parseISO(record.start_at), "MMM d, yyyy")}
                                </div>
                              </div>
                              {record.expected_end_at && (
                                <div>
                                  <div>Expected End</div>
                                  <div className="font-medium text-foreground">
                                    {format(parseISO(record.expected_end_at), "MMM d, yyyy")}
                                  </div>
                                  {isOverdue && (
                                    <Badge variant="destructive" className="mt-1 text-xs">
                                      Overdue
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {record.is_blocking && (
                                <Badge variant="destructive" className="rounded-md text-xs">
                                  Blocking
                                </Badge>
                              )}
                            </div>
                            {(isOpsManager || isMaintenanceOfficer) && (
                              <div className="flex gap-2 pt-2">
                                <Button
                                  onClick={() => handleEdit(record)}
                                  variant="outline"
                                  size="sm"
                                  className="rounded-md text-xs flex-1"
                                >
                                  Edit
                                </Button>
                                {record.is_active ? (
                                  <Button
                                    onClick={() => handleCloseRecord(record)}
                                    variant="destructive"
                                    size="sm"
                                    className="rounded-md text-xs flex-1"
                                  >
                                    Close
                                  </Button>
                                ) : (
                                  <Button
                                    onClick={() => handleReopenRecord(record)}
                                    variant="outline"
                                    size="sm"
                                    className="rounded-md text-xs flex-1"
                                  >
                                    Reopen
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Create Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-[600px] rounded-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Out of Order Record</DialogTitle>
              <DialogDescription>
                Mark a studio as out of order due to maintenance or other issues.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Studio <span className="text-red-500">*</span></Label>
                  <Select value={formStudioId} onValueChange={setFormStudioId}>
                    <SelectTrigger className="rounded-md">
                      <SelectValue placeholder="Select studio..." />
                    </SelectTrigger>
                    <SelectContent>
                      {activeStudios.map((studio) => (
                        <SelectItem key={studio.id} value={studio.id}>
                          {studio.studio_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reason <span className="text-red-500">*</span></Label>
                  <Textarea
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    placeholder="Describe why the studio is out of order..."
                    className="min-h-[100px] rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Linked Maintenance Request (Optional)</Label>
                  <Select 
                    value={formMaintenanceRequestId || "none"} 
                    onValueChange={(value) => setFormMaintenanceRequestId(value === "none" ? null : value)}
                  >
                    <SelectTrigger className="rounded-md">
                      <SelectValue placeholder="Select maintenance request..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {maintenanceRequests.map((req) => (
                        <SelectItem key={req.id} value={req.id}>
                          {req.title} ({req.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={formStartAt}
                    onChange={(e) => setFormStartAt(e.target.value)}
                    className="rounded-md"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expected End Date & Time (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={formExpectedEndAt}
                    onChange={(e) => setFormExpectedEndAt(e.target.value)}
                    className="rounded-md"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="blocking"
                    checked={formIsBlocking}
                    onCheckedChange={(checked) => setFormIsBlocking(checked === true)}
                  />
                  <Label htmlFor="blocking" className="cursor-pointer">
                    Blocking (prevents OTA allocation)
                  </Label>
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="rounded-md">
                Cancel
              </Button>
              <Button onClick={handleCreate} className="rounded-md">
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[600px] rounded-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Out of Order Record</DialogTitle>
              <DialogDescription>
                Update the out of order record details.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Studio</Label>
                  <Input
                    value={selectedRecord?.studio?.studio_number || "N/A"}
                    disabled
                    className="rounded-md"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reason <span className="text-red-500">*</span></Label>
                  <Textarea
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    placeholder="Describe why the studio is out of order..."
                    className="min-h-[100px] rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Linked Maintenance Request (Optional)</Label>
                  <Select 
                    value={formMaintenanceRequestId || "none"} 
                    onValueChange={(value) => setFormMaintenanceRequestId(value === "none" ? null : value)}
                  >
                    <SelectTrigger className="rounded-md">
                      <SelectValue placeholder="Select maintenance request..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {maintenanceRequests.map((req) => (
                        <SelectItem key={req.id} value={req.id}>
                          {req.title} ({req.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={formStartAt}
                    onChange={(e) => setFormStartAt(e.target.value)}
                    className="rounded-md"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expected End Date & Time (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={formExpectedEndAt}
                    onChange={(e) => setFormExpectedEndAt(e.target.value)}
                    className="rounded-md"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-blocking"
                    checked={formIsBlocking}
                    onCheckedChange={(checked) => setFormIsBlocking(checked === true)}
                  />
                  <Label htmlFor="edit-blocking" className="cursor-pointer">
                    Blocking (prevents OTA allocation)
                  </Label>
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="rounded-md">
                Cancel
              </Button>
              <Button onClick={handleUpdate} className="rounded-md">
                Update
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default OutOfOrderPage;

