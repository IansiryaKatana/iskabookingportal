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
import { useBookingCalendar, type BookingCalendarFilters } from "@/hooks/useBookingCalendar";
import { useAdminStudioGrades } from "@/hooks/useAdminStudioGrades";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { useToast } from "@/hooks/use-toast";
import { useUpdateCheckInCheckOut } from "@/hooks/useCheckInCheckOut";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Filter,
  Building2,
  Users,
  Briefcase,
  Key,
  Search,
  LogIn,
  LogOut
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, addMonths, subMonths, isToday, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

const BookingCalendar = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [allocationFilter, setAllocationFilter] = useState<string>("all");
  const [studioGradeFilter, setStudioGradeFilter] = useState<string>("all");
  const [academicYearFilter, setAcademicYearFilter] = useState<string | undefined>(undefined);
  const [selectedStudioId, setSelectedStudioId] = useState<string | null>(null);
  const [studioSearch, setStudioSearch] = useState<string>("");
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
  const [checkInDate, setCheckInDate] = useState<string>("");
  const [checkOutDate, setCheckOutDate] = useState<string>("");
  const [checkInNotes, setCheckInNotes] = useState<string>("");
  const [checkOutNotes, setCheckOutNotes] = useState<string>("");

  const updateCheckInOut = useUpdateCheckInCheckOut();

  const { data: studioGradesData } = useAdminStudioGrades();
  const studioGrades = studioGradesData?.grades || [];

  // Calculate date range for current month view
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Build filters
  const filters: BookingCalendarFilters = useMemo(() => {
    const filters: BookingCalendarFilters = {
      start_date: format(monthStart, "yyyy-MM-dd"),
      end_date: format(monthEnd, "yyyy-MM-dd"),
    };

    if (allocationFilter !== "all") {
      filters.allocation = allocationFilter === "null" ? null : allocationFilter;
    }

    if (studioGradeFilter !== "all") {
      filters.studio_grade_id = studioGradeFilter;
    }

    if (academicYearFilter) {
      filters.academic_year_id = academicYearFilter;
    }

    return filters;
  }, [allocationFilter, studioGradeFilter, academicYearFilter, monthStart, monthEnd]);

  const { data: bookingData, isLoading } = useBookingCalendar(filters);

  // Use booking data (will be enhanced if needed)
  const dataToUse = bookingData;

  // Group studios by grade
  const studiosByGrade = useMemo(() => {
    if (!dataToUse) return new Map();

    const grouped = new Map<string, typeof dataToUse>();
    dataToUse.forEach((studio) => {
      const gradeId = studio.studio_grade_id;
      if (!grouped.has(gradeId)) {
        grouped.set(gradeId, []);
      }
      grouped.get(gradeId)!.push(studio);
    });

    return grouped;
  }, [dataToUse]);

  // Filter studios by selected studio (for sidebar)
  const filteredStudios = useMemo(() => {
    if (!dataToUse) return [];
    
    let filtered = dataToUse;

    // Filter by allocation
    if (allocationFilter === "Student") {
      filtered = filtered.filter(s => 
        s.allocation === "Student" || 
        (s.application_status === "confirmed" && s.allocation !== "OTA" && s.allocation !== "Keyworkers")
      );
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

    return filtered.sort((a, b) => {
      // Sort by grade, then by studio number
      if (a.studio_grade_name !== b.studio_grade_name) {
        return a.studio_grade_name.localeCompare(b.studio_grade_name);
      }
      return a.studio_number.localeCompare(b.studio_number);
    });
  }, [dataToUse, allocationFilter, studioGradeFilter, studioSearch]);

  // Check if a date is occupied for a studio
  const isDateOccupied = (studio: typeof bookingData[0], date: Date): boolean => {
    if (!studio.contract_start || !studio.contract_end || !studio.application_id) {
      return false;
    }

    const bookingStart = new Date(studio.contract_start);
    const bookingEnd = new Date(studio.contract_end);
    const checkDate = new Date(date);

    return checkDate >= bookingStart && checkDate <= bookingEnd;
  };

  // Get booking info for a studio on a specific date
  const getBookingInfo = (studio: typeof bookingData[0], date: Date) => {
    if (!isDateOccupied(studio, date)) return null;

    return {
      studentName: studio.student_name || "Unknown",
      contractName: studio.contract_name || "",
      applicationId: studio.application_id,
    };
  };

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

  const handleDateClick = (studio: typeof bookingData[0], date: Date) => {
    const bookingInfo = getBookingInfo(studio, date);
    if (bookingInfo?.applicationId) {
      // Navigate to application detail - check the correct route
      navigate(`/admin/applications/${bookingInfo.applicationId}`);
    }
  };

  const exportToCSV = () => {
    if (!bookingData || bookingData.length === 0) {
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
      "Student Name",
      "Student Email",
      "Contract Name",
      "Contract Start",
      "Contract End",
      "Academic Year",
    ];

    const rows = dataToUse
      .filter(s => s.application_id) // Only export booked studios
      .map((studio) => [
        studio.studio_number,
        studio.studio_grade_name,
        studio.allocation || "Unallocated",
        studio.studio_status,
        studio.student_name || "",
        studio.student_email || "",
        studio.contract_name || "",
        studio.contract_start || "",
        studio.contract_end || "",
        studio.academic_year_name || "",
      ]);

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
          <CardHeader>
            <CardTitle className="text-lg font-display uppercase tracking-wide flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="studio-search" className="text-xs md:text-sm">Search Studio</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="studio-search"
                    placeholder="Search by studio number or grade..."
                    value={studioSearch}
                    onChange={(e) => setStudioSearch(e.target.value)}
                    className="pl-9 rounded-full text-xs md:text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="allocation-filter" className="text-xs md:text-sm">Allocation</Label>
                <Select value={allocationFilter} onValueChange={setAllocationFilter}>
                  <SelectTrigger id="allocation-filter" className="rounded-full text-xs md:text-sm">
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
                <Label htmlFor="grade-filter" className="text-xs md:text-sm">Studio Grade</Label>
                <Select value={studioGradeFilter} onValueChange={setStudioGradeFilter}>
                  <SelectTrigger id="grade-filter" className="rounded-full text-xs md:text-sm">
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
                <Button
                  onClick={exportToCSV}
                  className="w-full rounded-full bg-red-500 hover:bg-red-600 text-white p-2 h-10"
                  variant="default"
                  size="icon"
                  title="Export to CSV"
                >
                  <Download className="h-4 w-4" />
                </Button>
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
                  {filteredStudios.length} studio{filteredStudios.length !== 1 ? "s" : ""} shown
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousMonth}
                  className="rounded-full"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToday}
                  className="rounded-full uppercase tracking-wide"
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextMonth}
                  className="rounded-full"
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
                      {filteredStudios.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground p-4">
                          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p className="text-xs">No studios found</p>
                        </div>
                      ) : (
                        filteredStudios.map((studio) => {
                          const isSelected = selectedStudioId === studio.studio_id;
                          const hasBooking = !!studio.application_id;

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
                              {hasBooking && (
                                <Badge variant="outline" className="text-[10px] md:text-xs hidden md:inline-flex">
                                  Booked
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
                      {filteredStudios.length > 0 && (
                        <div>
                          {filteredStudios.map((studio) => {
                            // Calculate booking spans for this studio
                            const bookingSpans: Array<{
                              start: Date;
                              end: Date;
                              info: {
                                studentName: string;
                                contractName: string;
                                applicationId: string;
                                hasActualCheckIn?: boolean;
                                hasActualCheckOut?: boolean;
                                contractStart?: Date | null;
                                contractEnd?: Date | null;
                                actualCheckIn?: Date | null;
                                actualCheckOut?: Date | null;
                                checkInNotes?: string | null;
                                checkOutNotes?: string | null;
                              };
                            }> = [];

                            if (studio.application_id) {
                              // Use effective dates (actual if set, otherwise contract dates)
                              const start = studio.effective_check_in_date 
                                ? new Date(studio.effective_check_in_date)
                                : studio.contract_start 
                                ? new Date(studio.contract_start)
                                : null;
                              const end = studio.effective_check_out_date
                                ? new Date(studio.effective_check_out_date)
                                : studio.contract_end
                                ? new Date(studio.contract_end)
                                : null;
                              
                              if (start && end) {
                                bookingSpans.push({
                                  start,
                                  end,
                                  info: {
                                    studentName: studio.student_name || "Unknown",
                                    contractName: studio.contract_name || "",
                                    applicationId: studio.application_id,
                                    hasActualCheckIn: !!studio.actual_check_in_date,
                                    hasActualCheckOut: !!studio.actual_check_out_date,
                                    contractStart: studio.contract_start ? new Date(studio.contract_start) : null,
                                    contractEnd: studio.contract_end ? new Date(studio.contract_end) : null,
                                    actualCheckIn: studio.actual_check_in_date ? new Date(studio.actual_check_in_date) : null,
                                    actualCheckOut: studio.actual_check_out_date ? new Date(studio.actual_check_out_date) : null,
                                    checkInNotes: studio.check_in_notes,
                                    checkOutNotes: studio.check_out_notes,
                                  },
                                });
                              }
                            }

                            return (
                              <div
                                key={studio.studio_id}
                                className="flex border-b border-border/50 relative"
                                style={{ height: "60px" }}
                              >
                                {/* Date cells */}
                                {daysInMonth.map((day, dayIndex) => {
                                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                                  const bookingSpan = bookingSpans.find(
                                    (span) => {
                                      const spanStart = new Date(span.start);
                                      const spanEnd = new Date(span.end);
                                      spanStart.setHours(0, 0, 0, 0);
                                      spanEnd.setHours(23, 59, 59, 999);
                                      const checkDay = new Date(day);
                                      checkDay.setHours(0, 0, 0, 0);
                                      return checkDay >= spanStart && checkDay <= spanEnd;
                                    }
                                  );
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
                                          setCheckInDate(info.actualCheckIn?.toISOString().split('T')[0] || "");
                                          setCheckOutDate(info.actualCheckOut?.toISOString().split('T')[0] || "");
                                          setCheckInNotes(info.checkInNotes || "");
                                          setCheckOutNotes(info.checkOutNotes || "");
                                          setCheckInOutDialogOpen(true);
                                        }
                                      }}
                                      title={
                                        bookingSpan
                                          ? `${bookingSpan.info.studentName} - ${bookingSpan.info.contractName}`
                                          : "Available"
                                      }
                                    >
                                      {/* Booking bar spanning multiple days - only render on start date */}
                                      {isStartDate && bookingSpan && spanWidth > 0 && (
                                        <div
                                          className={cn(
                                            "absolute inset-y-0 left-0 border flex items-center justify-center px-1",
                                            // Color based on allocation type
                                            studio.allocation === "Student" || !studio.allocation || studio.allocation === "null"
                                              ? "bg-blue-500/30 border-blue-500/50 text-blue-900 dark:text-blue-100"
                                              : studio.allocation === "OTA" || studio.allocation === "Keyworkers"
                                              ? "bg-green-500/30 border-green-500/50 text-green-900 dark:text-green-100"
                                              : "bg-primary/30 border-primary/50 text-primary-foreground",
                                            isEndDate ? "rounded-r" : "rounded-l",
                                            "md:!w-[var(--span-width)]"
                                          )}
                                          style={{
                                            width: `${spanWidth * 60}px`, // Mobile: 60px per cell
                                            zIndex: 1,
                                            "--span-width": `${spanWidth * 80}px`, // Desktop: 80px per cell
                                          } as React.CSSProperties & { "--span-width": string }}
                                        >
                                          <div className="text-[10px] md:text-xs font-medium truncate">
                                            {bookingSpan.info.studentName.split(" ")[0]}
                                          </div>
                                        </div>
                                      )}
                                      {/* Continuation of booking bar (no text, just background) */}
                                      {isOccupied && !isStartDate && bookingSpan && (
                                        <div
                                          className={cn(
                                            "absolute inset-y-0 left-0 right-0 border-y",
                                            // Color based on allocation type
                                            studio.allocation === "Student" || !studio.allocation || studio.allocation === "null"
                                              ? "bg-blue-500/30 border-blue-500/50"
                                              : studio.allocation === "OTA" || studio.allocation === "Keyworkers"
                                              ? "bg-green-500/30 border-green-500/50"
                                              : "bg-primary/30 border-primary/50"
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
          </CardContent>
        </Card>
      </div>

        {/* Check-in/Check-out Dialog */}
        <Dialog open={checkInOutDialogOpen} onOpenChange={setCheckInOutDialogOpen}>
          <DialogContent className="sm:max-w-[600px] rounded-3xl">
            <DialogHeader>
              <DialogTitle>Check-in / Check-out</DialogTitle>
              <DialogDescription>
                {selectedApplication && (
                  <>
                    Manage check-in and check-out dates for <strong>{selectedApplication.studentName}</strong>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            {selectedApplication && (
              <div className="space-y-4 py-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">Contract Dates:</p>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    {selectedApplication.contractStart && format(new Date(selectedApplication.contractStart), "MMM d, yyyy")} - {selectedApplication.contractEnd && format(new Date(selectedApplication.contractEnd), "MMM d, yyyy")}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="check_in_date" className="flex items-center gap-2">
                      <LogIn className="h-4 w-4" />
                      Check-in Date
                    </Label>
                    <Input
                      id="check_in_date"
                      type="date"
                      value={checkInDate}
                      onChange={(e) => setCheckInDate(e.target.value)}
                      className="rounded-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to use contract start date
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="check_out_date" className="flex items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      Check-out Date
                    </Label>
                    <Input
                      id="check_out_date"
                      type="date"
                      value={checkOutDate}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                      className="rounded-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave empty to use contract end date
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="check_in_notes">Check-in Notes (Optional)</Label>
                  <Textarea
                    id="check_in_notes"
                    value={checkInNotes}
                    onChange={(e) => setCheckInNotes(e.target.value)}
                    placeholder="Add any notes about check-in..."
                    rows={2}
                    className="rounded-2xl"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="check_out_notes">Check-out Notes (Optional)</Label>
                  <Textarea
                    id="check_out_notes"
                    value={checkOutNotes}
                    onChange={(e) => setCheckOutNotes(e.target.value)}
                    placeholder="Add any notes about check-out..."
                    rows={2}
                    className="rounded-2xl"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedApplication.id) {
                        navigate(`/admin/applications/${selectedApplication.id}`);
                      }
                    }}
                    className="rounded-full gap-2"
                  >
                    View Full Application
                  </Button>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCheckInOutDialogOpen(false);
                  setSelectedApplication(null);
                }}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!selectedApplication) return;

                  try {
                    await updateCheckInOut.mutateAsync({
                      applicationId: selectedApplication.id,
                      checkInDate: checkInDate || null,
                      checkOutDate: checkOutDate || null,
                      checkInNotes: checkInNotes.trim() || null,
                      checkOutNotes: checkOutNotes.trim() || null,
                    });

                    toast({
                      title: "Check-in/Check-out updated",
                      description: "The dates have been updated successfully.",
                    });

                    setCheckInOutDialogOpen(false);
                    setSelectedApplication(null);
                  } catch (error: any) {
                    console.error("Error updating check-in/check-out:", error);
                    toast({
                      variant: "destructive",
                      title: "Error",
                      description: error.message || "Failed to update dates. Please try again.",
                    });
                  }
                }}
                disabled={updateCheckInOut.isPending}
                className="rounded-full uppercase tracking-wide gap-2"
              >
                {updateCheckInOut.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </AdminLayout>
  );
};

export default BookingCalendar;

