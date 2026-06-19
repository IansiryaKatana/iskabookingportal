import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useHousekeepingStatus, useUpdateHousekeepingStatus, useBulkUpdateHousekeepingStatus, type HousekeepingStatusWithRelations } from "@/hooks/useHousekeeping";
import { useStaffMembers } from "@/hooks/useStaffMembers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks, isSameDay } from "date-fns";
import {
  Calendar, Clock, UserCheck, Filter, Plus, ChevronLeft, ChevronRight,
  Loader2, Building2, Users, CheckCircle2, XCircle, Sparkles
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const HousekeepingRosterPage = () => {
  const { toast } = useToast();
  const { role, profile } = useAuth();
  const isMobile = useIsMobile();
  
  // View mode: "by-cleaner" or "by-studio"
  const [viewMode, setViewMode] = useState<"by-cleaner" | "by-studio">("by-cleaner");
  
  // Week navigation
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 }); // Sunday
  
  // Filters
  const [cleanerFilter, setCleanerFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Dialogs
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [selectedStudioId, setSelectedStudioId] = useState<string>("");
  const [selectedCleanerId, setSelectedCleanerId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");

  const { data: housekeepingStatuses, isLoading } = useHousekeepingStatus();
  const { data: cleaners } = useStaffMembers({ role: "staff", staff_subrole: "housekeeper" });
  const updateStatus = useUpdateHousekeepingStatus();
  const bulkUpdate = useBulkUpdateHousekeepingStatus();

  // Check if user is Ops Manager or Housekeeper
  const isOpsManager = role === "operations_manager" || role === "staff" || role === "superadmin" || role === "admin";
  const isHousekeeper = profile?.staff_subrole === "housekeeper";

  // Group by cleaner
  const groupedByCleaner = useMemo(() => {
    if (!housekeepingStatuses) return {};
    
    const grouped: Record<string, HousekeepingStatusWithRelations[]> = {};
    
    housekeepingStatuses.forEach((status) => {
      const cleanerId = status.assigned_cleaner_id || "unassigned";
      if (!grouped[cleanerId]) {
        grouped[cleanerId] = [];
      }
      grouped[cleanerId].push(status);
    });
    
    return grouped;
  }, [housekeepingStatuses]);

  // Filtered cleaners for dropdown
  const filteredCleaners = useMemo(() => {
    if (!cleaners) return [];
    return cleaners;
  }, [cleaners]);

  // Filtered studios
  const filteredStudios = useMemo(() => {
    if (!housekeepingStatuses) return [];
    let filtered = housekeepingStatuses;

    if (cleanerFilter !== "all") {
      if (cleanerFilter === "unassigned") {
        filtered = filtered.filter((s) => !s.assigned_cleaner_id);
      } else {
        filtered = filtered.filter((s) => s.assigned_cleaner_id === cleanerFilter);
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.studio?.studio_number.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [housekeepingStatuses, cleanerFilter, searchQuery]);

  // Get studios for a specific cleaner
  const getStudiosForCleaner = (cleanerId: string) => {
    if (!housekeepingStatuses) return [];
    if (cleanerId === "unassigned") {
      return housekeepingStatuses.filter((s) => !s.assigned_cleaner_id);
    }
    return housekeepingStatuses.filter((s) => s.assigned_cleaner_id === cleanerId);
  };

  // Get cleaner name
  const getCleanerName = (cleanerId: string | null) => {
    if (!cleanerId || !cleaners) return "Unassigned";
    const cleaner = cleaners.find((c) => c.id === cleanerId);
    return cleaner ? `${cleaner.first_name} ${cleaner.last_name}` : "Unknown";
  };

  // Handle assign cleaner
  const handleAssignCleaner = async () => {
    if (!selectedStudioId || !selectedCleanerId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a studio and cleaner.",
      });
      return;
    }

    try {
      await updateStatus.mutateAsync({
        id: selectedStudioId,
        updates: {
          assigned_cleaner_id: selectedCleanerId || null,
        },
      });

      toast({
        title: "Cleaner assigned",
        description: "The cleaner has been assigned successfully.",
      });

      setAssignDialogOpen(false);
      setSelectedStudioId("");
      setSelectedCleanerId("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to assign cleaner.",
      });
    }
  };

  // Handle set cleaning date
  const handleSetDate = async () => {
    if (!selectedStudioId || !selectedDate) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a studio and date.",
      });
      return;
    }

    try {
      await updateStatus.mutateAsync({
        id: selectedStudioId,
        updates: {
          next_clean_due_at: selectedDate,
        },
      });

      toast({
        title: "Date set",
        description: "The cleaning date has been set successfully.",
      });

      setDateDialogOpen(false);
      setSelectedStudioId("");
      setSelectedDate("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to set date.",
      });
    }
  };

  // Get cleaning schedule for week
  const getWeekSchedule = (cleanerId: string) => {
    const studios = getStudiosForCleaner(cleanerId);
    const schedule: Record<string, HousekeepingStatusWithRelations[]> = {};
    
    // Initialize days
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      schedule[format(date, "yyyy-MM-dd")] = [];
    }
    
    // Group studios by cleaning day
    studios.forEach((studio) => {
      if (studio.next_clean_due_at) {
        const cleanDate = format(parseISO(studio.next_clean_due_at), "yyyy-MM-dd");
        if (schedule[cleanDate]) {
          schedule[cleanDate].push(studio);
        }
      }
    });
    
    return schedule;
  };

  // Skeleton loader
  if (isLoading) {
    return (
      <AdminLayout pageTitle="Housekeeping Roster" subtitle="Manage cleaning assignments and schedules">
        <div className="space-y-6">
          <Card className="rounded-3xl">
            <CardContent className="p-6">
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="Housekeeping Roster" subtitle="Manage cleaning assignments and schedules">
      <div className="space-y-6">
        {/* Week Navigation */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
                  className="rounded-md"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-center">
                  <div className="text-sm md:text-base font-semibold">
                    {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentWeek(new Date())}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Today
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                  className="rounded-md"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "by-cleaner" | "by-studio")}>
                  <TabsList className="rounded-md">
                    <TabsTrigger value="by-cleaner" className="rounded-md">By Cleaner</TabsTrigger>
                    <TabsTrigger value="by-studio" className="rounded-md">By Studio</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg font-display font-bold uppercase tracking-wide">
              <Filter className="h-4 w-4 md:h-5 md:w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {viewMode === "by-studio" && (
                <div className="space-y-2">
                  <Label className="text-xs md:text-sm">Cleaner</Label>
                  <Select value={cleanerFilter} onValueChange={setCleanerFilter}>
                    <SelectTrigger className="rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cleaners</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {cleaners?.map((cleaner) => (
                        <SelectItem key={cleaner.id} value={cleaner.id}>
                          {cleaner.first_name} {cleaner.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Search Studio</Label>
                <Input
                  placeholder="Studio number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-md text-sm md:text-base"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content by View Mode */}
        <Tabs value={viewMode} className="w-full">
          <TabsContent value="by-cleaner" className="space-y-4">
            {/* View by Cleaner */}
            {cleaners && cleaners.length > 0 ? (
              <div className="space-y-4">
                {cleaners.map((cleaner) => {
                  const studios = getStudiosForCleaner(cleaner.id);
                  const schedule = getWeekSchedule(cleaner.id);
                  
                  return (
                    <Card key={cleaner.id} className="rounded-3xl border border-border/60 shadow-xl">
                      <CardHeader>
                        <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
                          {cleaner.first_name} {cleaner.last_name}
                        </CardTitle>
                        <CardDescription className="text-xs md:text-sm">
                          {studios.length} studio{studios.length !== 1 ? "s" : ""} assigned
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {/* Weekly Schedule */}
                        <div className="mb-6">
                          <h4 className="text-sm font-semibold mb-3">Weekly Schedule</h4>
                          <div className="grid grid-cols-7 gap-2">
                            {Array.from({ length: 7 }).map((_, i) => {
                              const date = new Date(weekStart);
                              date.setDate(weekStart.getDate() + i);
                              const dateKey = format(date, "yyyy-MM-dd");
                              const dayStudios = schedule[dateKey] || [];
                              const isToday = isSameDay(date, new Date());
                              
                              return (
                                <div
                                  key={i}
                                  className={`border rounded-xl p-2 min-h-[80px] ${
                                    isToday ? "border-primary bg-primary/5" : "border-border"
                                  }`}
                                >
                                  <div className="text-xs font-medium mb-1">
                                    {format(date, "EEE")}
                                  </div>
                                  <div className="text-xs text-muted-foreground mb-2">
                                    {format(date, "MMM d")}
                                  </div>
                                  <div className="text-xs font-semibold text-primary">
                                    {dayStudios.length}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
                        {/* Studios List */}
                        <div>
                          <h4 className="text-sm font-semibold mb-3">Assigned Studios</h4>
                          {studios.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No studios assigned</p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {studios.map((studio) => (
                                <Card
                                  key={studio.id}
                                  className="rounded-2xl border border-border/60 p-3"
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="font-semibold text-sm">
                                      Studio {studio.studio?.studio_number || "N/A"}
                                    </div>
                                    {studio.status === "dirty" && (
                                      <Badge variant="destructive" className="text-xs">Dirty</Badge>
                                    )}
                                    {studio.status === "clean" && (
                                      <Badge className="bg-green-500 text-white text-xs">Clean</Badge>
                                    )}
                                  </div>
                                  {studio.next_clean_due_at && (
                                    <div className="text-xs text-muted-foreground">
                                      Next clean: {format(parseISO(studio.next_clean_due_at), "MMM d, yyyy")}
                                    </div>
                                  )}
                                  {isOpsManager && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="mt-2 rounded-md text-xs w-full"
                                      onClick={() => {
                                        setSelectedStudioId(studio.id);
                                        setDateDialogOpen(true);
                                      }}
                                    >
                                      <Calendar className="h-3 w-3 mr-1" />
                                      Set Date
                                    </Button>
                                  )}
                                </Card>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                
                {/* Unassigned Studios */}
                {groupedByCleaner["unassigned"] && groupedByCleaner["unassigned"].length > 0 && (
                  <Card className="rounded-3xl border border-border/60 shadow-xl">
                    <CardHeader>
                      <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
                        Unassigned Studios
                      </CardTitle>
                      <CardDescription className="text-xs md:text-sm">
                        {groupedByCleaner["unassigned"].length} studio{groupedByCleaner["unassigned"].length !== 1 ? "s" : ""} without cleaner
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {groupedByCleaner["unassigned"].map((studio) => (
                          <Card
                            key={studio.id}
                            className="rounded-2xl border border-border/60 p-3"
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="font-semibold text-sm">
                                Studio {studio.studio?.studio_number || "N/A"}
                              </div>
                              {studio.status === "dirty" && (
                                <Badge variant="destructive" className="text-xs">Dirty</Badge>
                              )}
                            </div>
                            {isOpsManager && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2 rounded-md text-xs w-full"
                                onClick={() => {
                                  setSelectedStudioId(studio.id);
                                  setAssignDialogOpen(true);
                                }}
                              >
                                <UserCheck className="h-3 w-3 mr-1" />
                                Assign Cleaner
                              </Button>
                            )}
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card className="rounded-3xl">
                <CardContent className="p-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No cleaners found</h3>
                  <p className="text-sm text-muted-foreground">
                    No housekeepers are assigned in the system.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="by-studio" className="space-y-4">
            {/* View by Studio */}
            <Card className="rounded-3xl border border-border/60 shadow-xl">
              <CardHeader>
                <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
                  Studios
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  {filteredStudios.length} studio{filteredStudios.length !== 1 ? "s" : ""} found
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredStudios.length === 0 ? (
                  <div className="text-center py-12">
                    <Building2 className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-base md:text-lg font-semibold mb-2">No studios found</h3>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {searchQuery || cleanerFilter !== "all"
                        ? "Try adjusting your filters."
                        : "No studios found."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredStudios.map((studio) => (
                      <Card
                        key={studio.id}
                        className="rounded-2xl border border-border/60 p-4"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="font-semibold text-base">
                              Studio {studio.studio?.studio_number || "N/A"}
                            </div>
                            {studio.status === "dirty" && (
                              <Badge variant="destructive" className="text-xs">Dirty</Badge>
                            )}
                            {studio.status === "clean" && (
                              <Badge className="bg-green-500 text-white text-xs">Clean</Badge>
                            )}
                          </div>
                          <div className="text-sm">
                            <div className="text-muted-foreground">Assigned Cleaner</div>
                            <div className="font-medium">
                              {studio.assigned_cleaner 
                                ? `${studio.assigned_cleaner.first_name} ${studio.assigned_cleaner.last_name}`
                                : "Unassigned"}
                            </div>
                          </div>
                          {studio.next_clean_due_at && (
                            <div className="text-sm">
                              <div className="text-muted-foreground">Next Clean</div>
                              <div className="font-medium">
                                {format(parseISO(studio.next_clean_due_at), "MMM d, yyyy")}
                              </div>
                            </div>
                          )}
                          {isOpsManager && (
                            <div className="flex gap-2 pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-md text-xs flex-1"
                                onClick={() => {
                                  setSelectedStudioId(studio.id);
                                  setSelectedCleanerId(studio.assigned_cleaner_id || "");
                                  setAssignDialogOpen(true);
                                }}
                              >
                                <UserCheck className="h-3 w-3 mr-1" />
                                Assign
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-md text-xs flex-1"
                                onClick={() => {
                                  setSelectedStudioId(studio.id);
                                  setSelectedDate(studio.next_clean_due_at || "");
                                  setDateDialogOpen(true);
                                }}
                              >
                                <Calendar className="h-3 w-3 mr-1" />
                                Date
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Assign Cleaner Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-3xl">
            <DialogHeader>
              <DialogTitle>Assign Cleaner</DialogTitle>
              <DialogDescription>
                Assign a cleaner to this studio.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Cleaner</Label>
                <Select 
                  value={selectedCleanerId || "none"} 
                  onValueChange={(value) => setSelectedCleanerId(value === "none" ? null : value)}
                >
                  <SelectTrigger className="rounded-md">
                    <SelectValue placeholder="Select cleaner..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassign</SelectItem>
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
              <Button onClick={handleAssignCleaner} className="rounded-md">
                Assign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Set Date Dialog */}
        <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-3xl">
            <DialogHeader>
              <DialogTitle>Set Cleaning Date</DialogTitle>
              <DialogDescription>
                Set the next cleaning date for this studio.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Next Clean Date</Label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
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
    </AdminLayout>
  );
};

export default HousekeepingRosterPage;

