import { useState, useMemo } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useAdminStudios } from "@/hooks/useAdminStudios";
import { useOTABookings } from "@/hooks/useOTABookings";
import { useOutOfOrderRecords } from "@/hooks/useOutOfOrder";
import { useHousekeepingStatus } from "@/hooks/useHousekeeping";
import { useUpdateOTABooking } from "@/hooks/useOTABookings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, parseISO, isAfter, isBefore, isWithinInterval } from "date-fns";
import {
  Building2, AlertTriangle, CheckCircle2, XCircle, Filter, Search,
  Calendar, Clock, MapPin, Wrench, Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const OTAStudioAllocationPage = () => {
  const { toast } = useToast();
  const { role, profile } = useAuth();
  const isMobile = useIsMobile();
  
  // Allocation dialog
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<{ id: string; guest_name: string; check_in: string; check_out: string } | null>(null);
  const [selectedStudioId, setSelectedStudioId] = useState<string>("");
  
  // Filters
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [conflictFilter, setConflictFilter] = useState<string>("all"); // "all", "conflicts", "available"
  const [studioGradeFilter, setStudioGradeFilter] = useState<string>("all");
  
  // Date range for checking availability
  const [checkInDate, setCheckInDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [checkOutDate, setCheckOutDate] = useState<string>(format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));

  const { data: studios, isLoading: studiosLoading } = useAdminStudios({ allocation: "OTA" });
  const { data: bookings } = useOTABookings();
  const { data: outOfOrderRecords } = useOutOfOrderRecords({ is_active: true });
  const { data: housekeepingStatuses } = useHousekeepingStatus();
  const updateBooking = useUpdateOTABooking();

  // Check if user is Reservationist or Ops Manager
  const isReservationist = profile?.staff_subrole === "reservationist" || role === "superadmin";
  const isOpsManager = role === "operations_manager" || role === "staff" || role === "superadmin" || role === "admin";

  // Get studio conflicts
  const getStudioConflicts = (studioId: string, checkIn: Date, checkOut: Date) => {
    const conflicts: string[] = [];

    // Check for active bookings
    const activeBookings = bookings?.filter((booking) => {
      if (!booking.studio_id || booking.studio_id !== studioId) return false;
      if (booking.status === "cancelled" || booking.status === "no_show") return false;
      
      const bookingCheckIn = parseISO(booking.check_in);
      const bookingCheckOut = parseISO(booking.check_out);
      
      // Check for date overlap
      return (
        (isWithinInterval(checkIn, { start: bookingCheckIn, end: bookingCheckOut }) ||
         isWithinInterval(checkOut, { start: bookingCheckIn, end: bookingCheckOut }) ||
         (isBefore(checkIn, bookingCheckIn) && isAfter(checkOut, bookingCheckOut)))
      );
    });

    if (activeBookings && activeBookings.length > 0) {
      conflicts.push(`Occupied by ${activeBookings.map((b) => b.guest_name).join(", ")}`);
    }

    // Check for out of order
    const outOfOrder = outOfOrderRecords?.find((record) => {
      if (record.studio_id !== studioId || !record.is_active) return false;
      
      const recordStart = parseISO(record.start_at);
      const recordEnd = record.end_at ? parseISO(record.end_at) : new Date(9999, 0, 1); // Far future if no end date
      
      return (
        (isWithinInterval(checkIn, { start: recordStart, end: recordEnd }) ||
         isWithinInterval(checkOut, { start: recordStart, end: recordEnd }) ||
         (isBefore(checkIn, recordStart) && isAfter(checkOut, recordEnd)))
      );
    });

    if (outOfOrder) {
      conflicts.push(`Out of Order: ${outOfOrder.reason}`);
    }

    // Check for dirty status (optional rule)
    const housekeeping = housekeepingStatuses?.find((status) => status.studio_id === studioId);
    if (housekeeping && housekeeping.status === "dirty") {
      conflicts.push("Studio is dirty - needs cleaning");
    }

    return conflicts;
  };

  // Filter studios with conflicts
  const studiosWithConflicts = useMemo(() => {
    if (!studios) return [];
    
    const checkIn = parseISO(checkInDate);
    const checkOut = parseISO(checkOutDate);
    
    return studios.map((studio) => {
      const conflicts = getStudioConflicts(studio.id, checkIn, checkOut);
      return {
        ...studio,
        conflicts,
        isAvailable: conflicts.length === 0,
      };
    });
  }, [studios, bookings, outOfOrderRecords, housekeepingStatuses, checkInDate, checkOutDate]);

  // Filtered studios
  const filteredStudios = useMemo(() => {
    let filtered = studiosWithConflicts;

    if (conflictFilter === "conflicts") {
      filtered = filtered.filter((s) => s.conflicts.length > 0);
    } else if (conflictFilter === "available") {
      filtered = filtered.filter((s) => s.isAvailable);
    }

    if (studioGradeFilter !== "all") {
      filtered = filtered.filter((s) => s.studio_grade_id === studioGradeFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((s) =>
        s.studio_number.toLowerCase().includes(query) ||
        s.studio_grade?.name?.toLowerCase().includes(query)
      );
    }

    return filtered.sort((a, b) => {
      // Sort by availability first, then by studio number
      if (a.isAvailable !== b.isAvailable) {
        return a.isAvailable ? -1 : 1;
      }
      return a.studio_number.localeCompare(b.studio_number);
    });
  }, [studiosWithConflicts, conflictFilter, studioGradeFilter, searchQuery]);

  // Get unique studio grades
  const studioGrades = useMemo(() => {
    if (!studios) return [];
    const grades = new Map();
    studios.forEach((studio) => {
      if (studio.studio_grade && !grades.has(studio.studio_grade_id)) {
        grades.set(studio.studio_grade_id, studio.studio_grade);
      }
    });
    return Array.from(grades.values());
  }, [studios]);

  // Handle allocate studio
  const handleAllocateStudio = async () => {
    if (!selectedBooking || !selectedStudioId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a studio.",
      });
      return;
    }

    // Check for conflicts
    const checkIn = parseISO(selectedBooking.check_in);
    const checkOut = parseISO(selectedBooking.check_out);
    const conflicts = getStudioConflicts(selectedStudioId, checkIn, checkOut);

    if (conflicts.length > 0) {
      toast({
        variant: "destructive",
        title: "Conflicts Detected",
        description: conflicts.join(". "),
      });
      return;
    }

    try {
      await updateBooking.mutateAsync({
        id: selectedBooking.id,
        updates: {
          studio_id: selectedStudioId,
        },
      });

      toast({
        title: "Studio allocated",
        description: `Studio has been allocated to booking ${selectedBooking.guest_name}.`,
      });

      setAllocationDialogOpen(false);
      setSelectedBooking(null);
      setSelectedStudioId("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to allocate studio.",
      });
    }
  };

  // Open allocation dialog
  const handleOpenAllocation = (booking: { id: string; guest_name: string; check_in: string; check_out: string }) => {
    setSelectedBooking(booking);
    setCheckInDate(booking.check_in);
    setCheckOutDate(booking.check_out);
    setSelectedStudioId("");
    setAllocationDialogOpen(true);
  };

  // Skeleton loader
  if (studiosLoading) {
    return (
      <AdminLayout pageTitle="OTA Studio Allocation" subtitle="Manage OTA studio allocations and conflicts">
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
    <AdminLayout pageTitle="OTA Studio Allocation" subtitle="Manage OTA studio allocations and conflicts">
      <div className="space-y-6">
        {/* Date Range Selector */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg font-display font-bold uppercase tracking-wide">
              <Calendar className="h-4 w-4 md:h-5 md:w-5" />
              Check Availability Date Range
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Check-in Date</Label>
                <Input
                  type="date"
                  value={checkInDate}
                  onChange={(e) => setCheckInDate(e.target.value)}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Check-out Date</Label>
                <Input
                  type="date"
                  value={checkOutDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                  className="rounded-full"
                />
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
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Availability</Label>
                <Select value={conflictFilter} onValueChange={setConflictFilter}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Studios</SelectItem>
                    <SelectItem value="available">Available Only</SelectItem>
                    <SelectItem value="conflicts">With Conflicts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Studio Grade</Label>
                <Select value={studioGradeFilter} onValueChange={setStudioGradeFilter}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Grades</SelectItem>
                    {studioGrades.map((grade) => (
                      <SelectItem key={grade.id} value={grade.id}>
                        {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Search</Label>
                <Input
                  placeholder="Studio number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-full text-sm md:text-base"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Studios List */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              OTA Studios
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {filteredStudios.length} studio{filteredStudios.length !== 1 ? "s" : ""} found
              {filteredStudios.filter((s) => s.isAvailable).length > 0 && (
                <> • {filteredStudios.filter((s) => s.isAvailable).length} available</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredStudios.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No studios found</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {searchQuery || conflictFilter !== "all" || studioGradeFilter !== "all"
                    ? "Try adjusting your filters."
                    : "No OTA studios found."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStudios.map((studio) => (
                  <Card
                    key={studio.id}
                    className={`rounded-2xl border ${
                      studio.isAvailable
                        ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
                        : "border-red-500/50 bg-red-50/50 dark:bg-red-950/20"
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-base font-semibold">
                              Studio {studio.studio_number}
                            </h3>
                            {studio.studio_grade && (
                              <p className="text-xs text-muted-foreground">
                                {studio.studio_grade.name}
                              </p>
                            )}
                            {studio.floor && (
                              <p className="text-xs text-muted-foreground">
                                Floor {studio.floor}
                              </p>
                            )}
                          </div>
                          {studio.isAvailable ? (
                            <Badge className="bg-green-500 hover:bg-green-600 text-white rounded-full">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Available
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="rounded-full">
                              <XCircle className="h-3 w-3 mr-1" />
                              Conflicts
                            </Badge>
                          )}
                        </div>

                        {studio.conflicts.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-red-600 dark:text-red-400">
                              Conflicts:
                            </div>
                            <ul className="space-y-1">
                              {studio.conflicts.map((conflict, idx) => (
                                <li key={idx} className="text-xs text-muted-foreground flex items-start gap-2">
                                  <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0 text-red-600" />
                                  <span>{conflict}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {studio.isAvailable && (
                          <div className="pt-2">
                            <Badge variant="outline" className="text-xs">
                              Ready for allocation
                            </Badge>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Unallocated Bookings */}
        {bookings && bookings.filter((b) => !b.studio_id && b.status !== "cancelled" && b.status !== "no_show").length > 0 && (
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader>
              <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
                Unallocated Bookings
              </CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Bookings that need studio allocation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {bookings
                  .filter((b) => !b.studio_id && b.status !== "cancelled" && b.status !== "no_show")
                  .map((booking) => (
                    <Card key={booking.id} className="rounded-xl border border-border/60">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{booking.guest_name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {booking.external_ref} • {booking.channel}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {format(parseISO(booking.check_in), "MMM d")} - {format(parseISO(booking.check_out), "MMM d, yyyy")}
                            </div>
                          </div>
                          {isReservationist && (
                            <Button
                              onClick={() => handleOpenAllocation({
                                id: booking.id,
                                guest_name: booking.guest_name,
                                check_in: booking.check_in,
                                check_out: booking.check_out,
                              })}
                              className="rounded-full text-xs"
                              size="sm"
                            >
                              <MapPin className="h-3 w-3 mr-1" />
                              Allocate
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Allocation Dialog */}
        <Dialog open={allocationDialogOpen} onOpenChange={setAllocationDialogOpen}>
          <DialogContent className="sm:max-w-[600px] rounded-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Allocate Studio</DialogTitle>
              <DialogDescription>
                Select a studio for {selectedBooking?.guest_name} ({selectedBooking?.check_in} to {selectedBooking?.check_out})
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 py-4">
                {filteredStudios.filter((s) => s.isAvailable).length === 0 ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">
                      No available studios for the selected date range.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Select Studio</Label>
                    <div className="grid grid-cols-1 gap-2">
                      {filteredStudios
                        .filter((s) => s.isAvailable)
                        .map((studio) => (
                          <button
                            key={studio.id}
                            onClick={() => setSelectedStudioId(studio.id)}
                            className={`p-3 rounded-xl border text-left transition-colors ${
                              selectedStudioId === studio.id
                                ? "border-primary bg-primary/10"
                                : "border-border hover:bg-accent"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-sm">
                                  Studio {studio.studio_number}
                                </div>
                                {studio.studio_grade && (
                                  <div className="text-xs text-muted-foreground">
                                    {studio.studio_grade.name}
                                  </div>
                                )}
                              </div>
                              {selectedStudioId === studio.id && (
                                <CheckCircle2 className="h-5 w-5 text-primary" />
                              )}
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAllocationDialogOpen(false)} className="rounded-full">
                Cancel
              </Button>
              <Button
                onClick={handleAllocateStudio}
                disabled={!selectedStudioId}
                className="rounded-full"
              >
                Allocate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default OTAStudioAllocationPage;

