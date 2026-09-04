import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  useBookingCalendar,
  type BookingCalendarFilters,
  type BookingCalendarItem,
  type StudioCalendarGroup,
} from "@/hooks/useBookingCalendar";
import { useAdminStudioGrades } from "@/hooks/useAdminStudioGrades";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { ExportButton } from "@/components/admin/ExportButton";
import { useToast } from "@/hooks/use-toast";
import { CheckInCheckOutDialog } from "@/components/admin/CheckInCheckOutDialog";
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Building2,
  Users,
  Briefcase,
  Key,
  Search
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

type BookingSpan = {
  start: Date;
  end: Date;
  info: {
    studentName: string;
    applicationStatus: string | null;
    contractName: string;
    applicationId: string;
    hasActualCheckIn: boolean;
    hasActualCheckOut: boolean;
    contractStart: Date | null;
    contractEnd: Date | null;
    actualCheckIn: Date | null;
    actualCheckOut: Date | null;
    checkInNotes: string | null;
    checkOutNotes: string | null;
  };
};

const buildBookingSpans = (bookings: BookingCalendarItem[]): BookingSpan[] =>
  bookings.flatMap((booking) => {
    const start = booking.effective_check_in_date
      ? new Date(booking.effective_check_in_date)
      : booking.contract_start
        ? new Date(booking.contract_start)
        : null;
    const end = booking.effective_check_out_date
      ? new Date(booking.effective_check_out_date)
      : booking.contract_end
        ? new Date(booking.contract_end)
        : null;

    if (!start || !end || !booking.application_id) return [];

    return [
      {
        start,
        end,
        info: {
          studentName: booking.student_name || "Unknown",
          applicationStatus: booking.application_status ?? null,
          contractName: booking.contract_name || "",
          applicationId: booking.application_id,
          hasActualCheckIn: !!booking.actual_check_in_date,
          hasActualCheckOut: !!booking.actual_check_out_date,
          contractStart: booking.contract_start ? new Date(booking.contract_start) : null,
          contractEnd: booking.contract_end ? new Date(booking.contract_end) : null,
          actualCheckIn: booking.actual_check_in_date ? new Date(booking.actual_check_in_date) : null,
          actualCheckOut: booking.actual_check_out_date ? new Date(booking.actual_check_out_date) : null,
          checkInNotes: booking.check_in_notes,
          checkOutNotes: booking.check_out_notes,
        },
      },
    ];
  });

const spanCoversDay = (span: BookingSpan, day: Date): boolean => {
  const spanStart = new Date(span.start);
  const spanEnd = new Date(span.end);
  spanStart.setHours(0, 0, 0, 0);
  spanEnd.setHours(23, 59, 59, 999);
  const checkDay = new Date(day);
  checkDay.setHours(0, 0, 0, 0);
  return checkDay >= spanStart && checkDay <= spanEnd;
};

/** True when any booking span overlaps the visible month (same rule as Booked badge). */
const studioIsBookedInMonth = (
  studio: StudioCalendarGroup,
  monthStart: Date,
  monthEnd: Date,
): boolean => {
  const bookingSpans = buildBookingSpans(studio.bookings);
  return bookingSpans.some(
    (span) =>
      spanCoversDay(span, monthStart) ||
      spanCoversDay(span, monthEnd) ||
      (span.start <= monthEnd && span.end >= monthStart),
  );
};

const getStudioOccupancyLabel = (
  studio: StudioCalendarGroup,
  monthStart: Date,
  monthEnd: Date,
): "Booked" | "Available" =>
  studioIsBookedInMonth(studio, monthStart, monthEnd) ? "Booked" : "Available";

const STUDIOS_PER_PAGE = 25;

const BookingCalendar = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [allocationFilter, setAllocationFilter] = useState<string>("all");
  const [studioGradeFilter, setStudioGradeFilter] = useState<string>("all");
  const [academicYearFilter, setAcademicYearFilter] = useState<string | undefined>(undefined);
  const [occupancyFilter, setOccupancyFilter] = useState<string>("all");
  const [selectedStudioId, setSelectedStudioId] = useState<string | null>(null);
  const [studioSearch, setStudioSearch] = useState<string>("");
  const [studioPage, setStudioPage] = useState(1);
  const [checkInOutDialogOpen, setCheckInOutDialogOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<{
    id: string;
    studentName: string;
    contractStart: string | null;
    contractEnd: string | null;
    actualCheckIn: string | null;
    actualCheckOut: string | null;
    checkInNotes: string | null;
    checkOutNotes: string | null;
  } | null>(null);

  const { data: studioGradesData } = useAdminStudioGrades();
  const studioGrades = studioGradesData?.grades || [];

  // Calculate date range for current month view
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Build filters
  const filters: BookingCalendarFilters = useMemo(() => {
    const next: BookingCalendarFilters = {};

    if (allocationFilter !== "all") {
      next.allocation = allocationFilter === "null" ? null : allocationFilter;
    }

    if (studioGradeFilter !== "all") {
      next.studio_grade_id = studioGradeFilter;
    }

    if (academicYearFilter) {
      next.academic_year_id = academicYearFilter;
    }

    return next;
  }, [allocationFilter, studioGradeFilter, academicYearFilter]);

  const { data: bookingData, isLoading } = useBookingCalendar(filters);

  const dataToUse = bookingData;

  // Filter studios for sidebar and chart rows (always show every studio; bars reflect visible month)
  const filteredStudios = useMemo(() => {
    if (!dataToUse) return [];
    
    let filtered = dataToUse;

    // Filter by allocation
    if (allocationFilter === "Student") {
      filtered = filtered.filter(s => s.allocation === "Student");
    } else if (allocationFilter === "OTA") {
      filtered = filtered.filter(s => s.allocation === "OTA");
    } else if (allocationFilter === "Keyworkers") {
      filtered = filtered.filter(s => s.allocation === "Keyworkers");
    } else if (allocationFilter === "Unallocated") {
      filtered = filtered.filter(s => !s.allocation || s.allocation === "null");
    }

    // Filter by studio grade
    if (studioGradeFilter !== "all") {
      filtered = filtered.filter(s => s.studio_grade_id === studioGradeFilter);
    }

    // Filter by studio search
    if (studioSearch.trim()) {
      const searchLower = studioSearch.toLowerCase().trim();
      filtered = filtered.filter(s => 
        s.studio_number.toLowerCase().includes(searchLower) ||
        s.studio_grade_name.toLowerCase().includes(searchLower)
      );
    }

    // Filter by occupancy for the visible month
    if (occupancyFilter === "booked") {
      filtered = filtered.filter((s) => studioIsBookedInMonth(s, monthStart, monthEnd));
    } else if (occupancyFilter === "available") {
      filtered = filtered.filter((s) => !studioIsBookedInMonth(s, monthStart, monthEnd));
    }

    return filtered.sort((a, b) => {
      // Sort by grade, then by studio number
      if (a.studio_grade_name !== b.studio_grade_name) {
        return a.studio_grade_name.localeCompare(b.studio_grade_name);
      }
      return a.studio_number.localeCompare(b.studio_number);
    });
  }, [dataToUse, allocationFilter, studioGradeFilter, studioSearch, occupancyFilter, currentDate]);

  const studioTotalPages = Math.max(1, Math.ceil(filteredStudios.length / STUDIOS_PER_PAGE));

  const paginatedStudios = useMemo(() => {
    const start = (studioPage - 1) * STUDIOS_PER_PAGE;
    return filteredStudios.slice(start, start + STUDIOS_PER_PAGE);
  }, [filteredStudios, studioPage]);

  useEffect(() => {
    setStudioPage(1);
  }, [allocationFilter, studioGradeFilter, studioSearch, occupancyFilter, academicYearFilter, currentDate]);

  useEffect(() => {
    setStudioPage((p) => Math.min(p, studioTotalPages));
  }, [studioTotalPages]);

  const handlePreviousMonth = () => {
    setCurrentDate(subMonths(currentDate, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleStudioClick = (studioId: string) => {
    setSelectedStudioId(selectedStudioId === studioId ? null : studioId);
  };

  const getInitials = (name: string | null): string => {
    if (!name || !name.trim()) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getBookingBarClassName = (applicationStatus: string | null, allocation: string | null): string => {
    if (applicationStatus === "cancelled") return "bg-slate-400/40 border-slate-500/50 text-slate-700 dark:text-slate-300";
    if (applicationStatus === "awaiting_deposit" || applicationStatus === "awaiting_signature")
      return "bg-amber-500/30 border-amber-500/50 text-amber-900 dark:text-amber-100";
    if (allocation === "OTA" || allocation === "Keyworkers")
      return "bg-green-500/30 border-green-500/50 text-green-900 dark:text-green-100";
    return "bg-blue-500/30 border-blue-500/50 text-blue-900 dark:text-blue-100";
  };

  const getBookingBarBgOnly = (applicationStatus: string | null, allocation: string | null): string => {
    if (applicationStatus === "cancelled") return "bg-slate-400/40 border-slate-500/50";
    if (applicationStatus === "awaiting_deposit" || applicationStatus === "awaiting_signature")
      return "bg-amber-500/30 border-amber-500/50";
    if (allocation === "OTA" || allocation === "Keyworkers") return "bg-green-500/30 border-green-500/50";
    return "bg-blue-500/30 border-blue-500/50";
  };

  const exportToCSV = () => {
    if (!filteredStudios || filteredStudios.length === 0) {
      toast({
        title: "No data to export",
        description: "There is no booking data available for export.",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "Studio Number",
      "Studio Grade",
      "Allocation",
      "Status",
      "Occupancy",
      "Student Name",
      "Student Email",
      "Contract Name",
      "Contract Start",
      "Contract End",
      "Academic Year",
    ];

    const rows = filteredStudios.flatMap((studio) => {
      const occupancy = getStudioOccupancyLabel(studio, monthStart, monthEnd);

      if (occupancy === "Available") {
        return [[
          studio.studio_number,
          studio.studio_grade_name,
          studio.allocation || "Unallocated",
          studio.studio_status,
          "Available",
          "",
          "",
          "",
          "",
          "",
          "",
        ]];
      }

      return studio.bookings.map((booking) => [
        studio.studio_number,
        studio.studio_grade_name,
        studio.allocation || "Unallocated",
        studio.studio_status,
        "Booked",
        booking.student_name || "",
        booking.student_email || "",
        booking.contract_name || "",
        booking.contract_start || "",
        booking.contract_end || "",
        booking.academic_year_name || "",
      ]);
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `booking_calendar_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Report exported",
      description: "Successfully exported booking calendar to CSV.",
    });
  };

  const getAllocationIcon = (allocation: string | null) => {
    if (allocation === "Student") return <Users className="h-4 w-4" />;
    if (allocation === "OTA") return <Briefcase className="h-4 w-4" />;
    if (allocation === "Keyworkers") return <Key className="h-4 w-4" />;
    return <Building2 className="h-4 w-4" />;
  };

  return (
    <AdminLayout
      pageTitle="Booking Calendar"
      subtitle="View studio occupancy and bookings in calendar format"
    >
      <div className="space-y-6">
        {/* Filters */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardContent className="pt-6">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <div className="space-y-2">
                <Label htmlFor="studio-search" className="text-xs md:text-sm">Search Studio</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="studio-search"
                    placeholder="Search by studio number or grade..."
                    value={studioSearch}
                    onChange={(e) => setStudioSearch(e.target.value)}
                    className="pl-9 rounded-md text-xs md:text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="allocation-filter" className="text-xs md:text-sm">Allocation</Label>
                <Select value={allocationFilter} onValueChange={setAllocationFilter}>
                  <SelectTrigger id="allocation-filter" className="rounded-md text-xs md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Allocations</SelectItem>
                    <SelectItem value="Student">Students</SelectItem>
                    <SelectItem value="OTA">OTA</SelectItem>
                    <SelectItem value="Keyworkers">Keyworkers</SelectItem>
                    <SelectItem value="Unallocated">Unallocated</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="occupancy-filter" className="text-xs md:text-sm">Occupancy</Label>
                <Select value={occupancyFilter} onValueChange={setOccupancyFilter}>
                  <SelectTrigger id="occupancy-filter" className="rounded-md text-xs md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All rooms</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="grade-filter" className="text-xs md:text-sm">Studio Grade</Label>
                <Select value={studioGradeFilter} onValueChange={setStudioGradeFilter}>
                  <SelectTrigger id="grade-filter" className="rounded-md text-xs md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Grades</SelectItem>
                    {studioGrades?.map((grade) => (
                      <SelectItem key={grade.id} value={grade.id}>
                        {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="academic-year-filter" className="text-xs md:text-sm">Academic Year</Label>
                <AcademicYearSelector
                  value={academicYearFilter || undefined}
                  onValueChange={(val) => setAcademicYearFilter(val || undefined)}
                  allowEmpty={true}
                  className="w-full"
                />
              </div>

              <div className="flex items-end">
                <ExportButton
                  onExport={exportToCSV}
                  className="w-full rounded-md bg-red-500 hover:bg-red-600 text-white p-2 h-10"
                  variant="default"
                  size="icon"
                  title="Export to CSV"
                  iconOnly
                  label="Export CSV"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar Header */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-display uppercase tracking-wide flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {format(currentDate, "MMMM yyyy")}
                </CardTitle>
                <CardDescription>
                  {filteredStudios.length === 0
                    ? "0 studios shown"
                    : filteredStudios.length <= STUDIOS_PER_PAGE
                      ? `${filteredStudios.length} studio${filteredStudios.length !== 1 ? "s" : ""} shown`
                      : `Showing ${(studioPage - 1) * STUDIOS_PER_PAGE + 1}–${Math.min(studioPage * STUDIOS_PER_PAGE, filteredStudios.length)} of ${filteredStudios.length} studios`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousMonth}
                  className="rounded-md"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToday}
                  className="rounded-md uppercase tracking-wide"
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextMonth}
                  className="rounded-md"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
                {/* Calendar Grid - Table-like structure */}
                <div className="inline-block min-w-full">
                  <div className="flex">
                    {/* Fixed Studio Column */}
                    <div className="flex-shrink-0 w-[200px] md:w-[250px] border-r border-border sticky left-0 z-20 bg-background">
                      {/* Studio Header - must match date header height */}
                      <div className="font-semibold text-sm text-muted-foreground p-2 border-b border-border h-[60px] md:h-[70px] flex items-center">
                        Studio
                      </div>
                      {paginatedStudios.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground p-4">
                          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p className="text-xs">No studios found</p>
                        </div>
                      ) : (
                        paginatedStudios.map((studio) => {
                          const isSelected = selectedStudioId === studio.studio_id;
                          const occupancy = getStudioOccupancyLabel(studio, monthStart, monthEnd);

                          return (
                            <div
                              key={studio.studio_id}
                              className={cn(
                                "flex items-center gap-2 p-2 border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors",
                                isSelected && "bg-muted"
                              )}
                              style={{ height: "60px" }}
                              onClick={() => handleStudioClick(studio.studio_id)}
                            >
                              <div className="flex-shrink-0">
                                {getAllocationIcon(studio.allocation)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-xs md:text-sm truncate">
                                  {studio.studio_number}
                                </div>
                                <div className="text-[10px] md:text-xs text-muted-foreground truncate">
                                  {studio.studio_grade_name}
                                </div>
                              </div>
                              {occupancy === "Booked" ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] md:text-xs hidden md:inline-flex border-blue-500/50 bg-blue-500/15 text-blue-800 dark:text-blue-100"
                                >
                                  Booked
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] md:text-xs hidden md:inline-flex border-green-500/50 bg-green-500/15 text-green-800 dark:text-green-100"
                                >
                                  Available
                                </Badge>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Scrollable Dates Section */}
                    <div 
                      className="flex-1 overflow-x-auto"
                      onMouseDown={(e) => {
                        // Only enable drag scrolling if clicking on empty space or header
                        const target = e.target as HTMLElement;
                        if (target.closest('[data-date-cell]')) {
                          // Don't interfere with date cell clicks
                          return;
                        }
                        
                        const element = e.currentTarget;
                        let isDown = true;
                        let startX = e.pageX - element.offsetLeft;
                        let scrollLeft = element.scrollLeft;
                        let hasMoved = false;

                        const handleMouseMove = (e: MouseEvent) => {
                          if (!isDown) return;
                          const x = e.pageX - element.offsetLeft;
                          const walk = (x - startX) * 2; // Scroll speed multiplier
                          element.scrollLeft = scrollLeft - walk;
                          hasMoved = true;
                        };

                        const handleMouseUp = () => {
                          isDown = false;
                          document.removeEventListener('mousemove', handleMouseMove);
                          document.removeEventListener('mouseup', handleMouseUp);
                          // Add cursor classes
                          element.classList.remove('cursor-grabbing');
                          if (hasMoved) {
                            element.classList.add('cursor-grab');
                          }
                        };

                        // Add cursor classes
                        element.classList.add('cursor-grabbing');
                        element.classList.remove('cursor-grab');
                        
                        document.addEventListener('mousemove', handleMouseMove);
                        document.addEventListener('mouseup', handleMouseUp);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.classList.add('cursor-grab');
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.classList.remove('cursor-grab', 'cursor-grabbing');
                      }}
                    >
                      {/* Days Header Row - must match studio header height */}
                      <div className="flex border-b border-border sticky top-0 z-10 bg-background h-[60px] md:h-[70px]">
                        {daysInMonth.map((day) => {
                          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                          return (
                            <div
                              key={day.toISOString()}
                              className={cn(
                                "flex-shrink-0 w-[60px] md:w-[80px] text-center text-xs font-medium p-2 border-r border-border/50 flex flex-col justify-center",
                                isToday(day) && "bg-primary/10 text-primary",
                                isWeekend && "bg-muted/30"
                              )}
                            >
                              <div className="text-[10px] md:text-xs text-muted-foreground">
                                {format(day, "EEE")}
                              </div>
                              <div className="text-sm md:text-lg font-semibold">
                                {format(day, "d")}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Studio Rows with Date Cells */}
                      {paginatedStudios.length > 0 && (
                        <div>
                          {paginatedStudios.map((studio) => {
                            const bookingSpans = buildBookingSpans(studio.bookings);

                            return (
                              <div
                                key={studio.studio_id}
                                className="flex border-b border-border/50 relative"
                                style={{ height: "60px" }}
                              >
                                {/* Date cells */}
                                {daysInMonth.map((day, dayIndex) => {
                                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                  const bookingSpan = bookingSpans.find((span) => spanCoversDay(span, day));
                                  const isOccupied = !!bookingSpan;
                                  const isStartDate = bookingSpan && isSameDay(bookingSpan.start, day);
                                  const isEndDate = bookingSpan && isSameDay(bookingSpan.end, day);

                                  // Calculate how many days this booking spans within the visible month
                                  let spanWidth = 0;
                                  if (bookingSpan && isStartDate) {
                                    const spanStart = new Date(bookingSpan.start);
                                    const spanEnd = new Date(bookingSpan.end);
                                    const viewStart = new Date(monthStart);
                                    const viewEnd = new Date(monthEnd);
                                    
                                    // Clamp to visible month
                                    const actualStart = spanStart > viewStart ? spanStart : viewStart;
                                    const actualEnd = spanEnd < viewEnd ? spanEnd : viewEnd;
                                    
                                    // Count days from start to end within visible range
                                    const daysInSpan = Math.ceil((actualEnd.getTime() - actualStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                                    spanWidth = Math.min(daysInSpan, daysInMonth.length - dayIndex);
                                  }

                                  return (
                                    <div
                                      key={day.toISOString()}
                                      data-date-cell
                                      className={cn(
                                        "flex-shrink-0 w-[60px] md:w-[80px] border-r border-border/50 relative cursor-pointer transition-colors",
                                        isWeekend && "bg-muted/20",
                                        !isOccupied && "hover:bg-muted/30"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation(); // Prevent drag scroll
                                        if (bookingSpan?.info.applicationId) {
                                          // Open check-in/check-out dialog
                                          const info = bookingSpan.info as any;
                                          setSelectedApplication({
                                            id: info.applicationId,
                                            studentName: info.studentName,
                                            contractStart: info.contractStart?.toISOString().split('T')[0] || null,
                                            contractEnd: info.contractEnd?.toISOString().split('T')[0] || null,
                                            actualCheckIn: info.actualCheckIn?.toISOString().split('T')[0] || null,
                                            actualCheckOut: info.actualCheckOut?.toISOString().split('T')[0] || null,
                                            checkInNotes: info.checkInNotes || null,
                                            checkOutNotes: info.checkOutNotes || null,
                                          });
                                          setCheckInOutDialogOpen(true);
                                        }
                                      }}
                                      title={
                                        bookingSpan
                                          ? `${bookingSpan.info.studentName} - ${bookingSpan.info.contractName}`
                                          : "Available"
                                      }
                                    >
                                      {/* Booking bar spanning multiple days - only render on start date; show initials and status-based color */}
                                      {isStartDate && bookingSpan && spanWidth > 0 && (
                                        <div
                                          className={cn(
                                            "absolute inset-y-0 left-0 border flex items-center justify-center px-1",
                                            getBookingBarClassName(bookingSpan.info.applicationStatus, studio.allocation),
                                            isEndDate ? "rounded-r" : "rounded-l",
                                            "md:!w-[var(--span-width)]"
                                          )}
                                          style={{
                                            width: `${spanWidth * 60}px`,
                                            zIndex: 1,
                                            "--span-width": `${spanWidth * 80}px`,
                                          } as React.CSSProperties & { "--span-width": string }}
                                          title={`${bookingSpan.info.studentName}${bookingSpan.info.applicationStatus ? ` (${bookingSpan.info.applicationStatus.replace(/_/g, " ")})` : ""} - ${bookingSpan.info.contractName}`}
                                        >
                                          <div className="text-[10px] md:text-xs font-medium truncate" title={bookingSpan.info.studentName}>
                                            {getInitials(bookingSpan.info.studentName)}
                                          </div>
                                        </div>
                                      )}
                                      {/* Continuation of booking bar (no text, just background) */}
                                      {isOccupied && !isStartDate && bookingSpan && (
                                        <div
                                          className={cn(
                                            "absolute inset-y-0 left-0 right-0 border-y",
                                            getBookingBarBgOnly(bookingSpan.info.applicationStatus, studio.allocation)
                                          )}
                                          style={{ zIndex: 1 }}
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!isLoading && filteredStudios.length > STUDIOS_PER_PAGE && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 mt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  Showing {(studioPage - 1) * STUDIOS_PER_PAGE + 1} to{" "}
                  {Math.min(studioPage * STUDIOS_PER_PAGE, filteredStudios.length)} of{" "}
                  {filteredStudios.length}
                </div>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (studioPage > 1) setStudioPage(studioPage - 1);
                        }}
                        className={studioPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: studioTotalPages }, (_, i) => i + 1).map((page) => {
                      if (
                        page === 1 ||
                        page === studioTotalPages ||
                        (page >= studioPage - 1 && page <= studioPage + 1)
                      ) {
                        return (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setStudioPage(page);
                              }}
                              isActive={studioPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }
                      if (page === studioPage - 2 || page === studioPage + 2) {
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
                          if (studioPage < studioTotalPages) setStudioPage(studioPage + 1);
                        }}
                        className={
                          studioPage === studioTotalPages
                            ? "pointer-events-none opacity-50"
                            : "cursor-pointer"
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

        {selectedApplication && (
          <CheckInCheckOutDialog
            open={checkInOutDialogOpen}
            onOpenChange={(open) => {
              setCheckInOutDialogOpen(open);
              if (!open) setSelectedApplication(null);
            }}
            applicationId={selectedApplication.id}
            studentName={selectedApplication.studentName}
            contractStart={selectedApplication.contractStart}
            contractEnd={selectedApplication.contractEnd}
            actualCheckInDate={selectedApplication.actualCheckIn}
            actualCheckOutDate={selectedApplication.actualCheckOut}
            checkInNotes={selectedApplication.checkInNotes}
            checkOutNotes={selectedApplication.checkOutNotes}
            showViewApplicationLink
            onViewApplication={() => {
              navigate(`/admin/applications/${selectedApplication.id}`);
            }}
          />
        )}
    </AdminLayout>
  );
};

export default BookingCalendar;

