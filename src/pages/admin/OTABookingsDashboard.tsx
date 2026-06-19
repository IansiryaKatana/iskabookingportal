import { useState, useMemo, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useOTABookings, useCreateOTABooking, useUpdateOTABooking, useBulkUpdateOTABookings, type OTABookingWithRelations } from "@/hooks/useOTABookings";
import OTABookingPaymentsSection from "@/components/admin/ota/OTABookingPaymentsSection";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useAdminStudios } from "@/hooks/useAdminStudios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, parseISO, isToday, isPast, isFuture, differenceInDays } from "date-fns";
import {
  Calendar, Clock, UserCheck, XCircle, CheckCircle2, AlertCircle, 
  Loader2, Building2, Filter, Trash2, Phone, Mail, ExternalLink,
  Check, X, Users, TrendingUp, TrendingDown, FileText, Plus, Search, ChevronsUpDown, Pencil
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

// OTA Status Options
const OTA_STATUSES = [
  { value: "all", label: "All Status" },
  { value: "arriving", label: "Arriving" },
  { value: "expected_arrivals", label: "Expected Arrivals" },
  { value: "pre_check_in", label: "Pre Check In" },
  { value: "checked_in", label: "Checked In" },
  { value: "in_house_guest", label: "In House Guest" },
  { value: "day_use", label: "Day Use" },
  { value: "checked_out", label: "Checked Out" },
  { value: "expected_departures", label: "Expected Departures" },
  { value: "departing", label: "Departing" },
  { value: "no_show", label: "No Show" },
  { value: "cancelled", label: "Cancelled" },
];

// Channel Options
const CHANNELS = [
  { value: "all", label: "All Channels" },
  { value: "airbnb", label: "Airbnb" },
  { value: "booking", label: "Booking.com" },
  { value: "agoda", label: "Agoda" },
  { value: "expedia", label: "Expedia" },
  { value: "other", label: "Other" },
];

const SORT_OPTIONS = [
  { value: "operational", label: "Operational" },
  { value: "check_in_asc", label: "Check-in (Earliest)" },
  { value: "check_out_asc", label: "Check-out (Earliest)" },
  { value: "created_desc", label: "Newest Created" },
  { value: "revenue_desc", label: "Highest Revenue" },
];

// Status Badge Helper
const getStatusBadge = (status: string) => {
  const configs: Record<string, { className: string; icon: typeof Clock; label: string }> = {
    arriving: { className: "bg-blue-500 hover:bg-blue-600 text-white", icon: Clock, label: "Arriving" },
    expected_arrivals: { className: "bg-green-500 hover:bg-green-600 text-white", icon: TrendingUp, label: "Expected Arrivals" },
    pre_check_in: { className: "bg-purple-500 hover:bg-purple-600 text-white", icon: Clock, label: "Pre Check In" },
    checked_in: { className: "bg-emerald-500 hover:bg-emerald-600 text-white", icon: CheckCircle2, label: "Checked In" },
    in_house_guest: { className: "bg-teal-500 hover:bg-teal-600 text-white", icon: Users, label: "In House Guest" },
    day_use: { className: "bg-indigo-500 hover:bg-indigo-600 text-white", icon: Clock, label: "Day Use" },
    checked_out: { className: "bg-gray-500 hover:bg-gray-600 text-white", icon: CheckCircle2, label: "Checked Out" },
    expected_departures: { className: "bg-orange-500 hover:bg-orange-600 text-white", icon: TrendingDown, label: "Expected Departures" },
    departing: { className: "bg-amber-500 hover:bg-amber-600 text-white", icon: AlertCircle, label: "Departing" },
    no_show: { className: "bg-red-500 hover:bg-red-600 text-white", icon: XCircle, label: "No Show" },
    cancelled: { className: "bg-slate-500 hover:bg-slate-600 text-white", icon: XCircle, label: "Cancelled" },
  };

  const config = configs[status] || configs.arriving;
  const Icon = config.icon;

  return (
    <Badge className={`uppercase ${config.className} rounded-md px-2.5 py-0.5 text-xs font-medium flex items-center gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
};

// Channel Badge Helper
const getChannelBadge = (channel: string) => {
  const configs: Record<string, { className: string; label: string }> = {
    airbnb: { className: "bg-rose-500 hover:bg-rose-600 text-white", label: "Airbnb" },
    booking: { className: "bg-blue-600 hover:bg-blue-700 text-white", label: "Booking.com" },
    agoda: { className: "bg-red-600 hover:bg-red-700 text-white", label: "Agoda" },
    expedia: { className: "bg-blue-500 hover:bg-blue-600 text-white", label: "Expedia" },
    other: { className: "bg-gray-500 hover:bg-gray-600 text-white", label: "Other" },
  };

  const config = configs[channel] || configs.other;

  return (
    <Badge className={`${config.className} rounded-md px-2.5 py-0.5 text-xs font-medium`}>
      {config.label}
    </Badge>
  );
};

const OTABookingsDashboard = () => {
  const { toast } = useToast();
  const { role, profile } = useAuth();
  const isMobile = useIsMobile();
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("operational");
  const [checkInFromFilter, setCheckInFromFilter] = useState<string>("");
  const [checkInToFilter, setCheckInToFilter] = useState<string>("");
  const [unallocatedOnly, setUnallocatedOnly] = useState<boolean>(false);
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [checkInRangeOpen, setCheckInRangeOpen] = useState(false);
  const bookingsPerPage = 18;
  const hasActiveFilters =
    statusFilter !== "all" ||
    channelFilter !== "all" ||
    searchQuery.trim().length > 0 ||
    checkInFromFilter !== "" ||
    checkInToFilter !== "" ||
    unallocatedOnly ||
    sortBy !== "operational";
  const checkInRangeLabel =
    checkInFromFilter && checkInToFilter
      ? `${format(parseISO(checkInFromFilter), "MMM d")} - ${format(parseISO(checkInToFilter), "MMM d, yyyy")}`
      : checkInFromFilter
        ? `From ${format(parseISO(checkInFromFilter), "MMM d, yyyy")}`
        : checkInToFilter
          ? `Until ${format(parseISO(checkInToFilter), "MMM d, yyyy")}`
          : "Check-in Date Range";
  
  // Details drawer/sheet
  const [selectedBooking, setSelectedBooking] = useState<OTABookingWithRelations | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsEditing, setDetailsEditing] = useState(false);
  
  // Bulk actions dialogs
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [assignStudioDialogOpen, setAssignStudioDialogOpen] = useState(false);
  const [selectedStudioId, setSelectedStudioId] = useState<string>("");
  
  // Create booking dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [formExternalRef, setFormExternalRef] = useState<string>("");
  const [formChannel, setFormChannel] = useState<"airbnb" | "booking" | "agoda" | "expedia" | "other">("airbnb");
  const [formGuestName, setFormGuestName] = useState<string>("");
  const [formGuestPhone, setFormGuestPhone] = useState<string>("");
  const [formGuestEmail, setFormGuestEmail] = useState<string>("");
  const [formStudioId, setFormStudioId] = useState<string>("");
  const [formCheckIn, setFormCheckIn] = useState<string>("");
  const [formCheckOut, setFormCheckOut] = useState<string>("");
  const [formStatus, setFormStatus] = useState<string>("arriving");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formInternalNotes, setFormInternalNotes] = useState<string>("");
  const [formPricePerNight, setFormPricePerNight] = useState<string>("");
  const [formCommission, setFormCommission] = useState<string>("");

  const today = format(new Date(), "yyyy-MM-dd");
  
  const { data: bookings, isLoading } = useOTABookings({
    check_in_start: statusFilter === "expected_arrivals" ? today : undefined,
    check_in_end: statusFilter === "expected_arrivals" ? today : undefined,
  });
  const { data: activityLog } = useActivityLog(
    selectedBooking ? {
      entity_type: "ota_booking",
      entity_id: selectedBooking.id,
      limit: 50,
    } : undefined
  );
  const createBooking = useCreateOTABooking();
  const updateBooking = useUpdateOTABooking();
  const bulkUpdate = useBulkUpdateOTABookings();
  const { data: allStudios } = useAdminStudios();
  
  // Filter studios to only show OTA-allocated studios
  const otaStudios = useMemo(() => {
    if (!allStudios) return [];
    return allStudios.filter((studio) => studio.allocation === "OTA" && studio.is_active);
  }, [allStudios]);
  
  // Studio search state
  const [studioSearchOpen, setStudioSearchOpen] = useState(false);
  const [studioSearch, setStudioSearch] = useState("");
  
  // Filter studios based on search
  const filteredOTAStudios = useMemo(() => {
    if (!studioSearch.trim()) return otaStudios;
    const searchLower = studioSearch.toLowerCase();
    return otaStudios.filter((studio) => {
      const studioNumber = (studio.studio_number || "").toLowerCase();
      return studioNumber.includes(searchLower);
    });
  }, [otaStudios, studioSearch]);
  
  // Get selected studio display value
  const selectedStudioDisplay = useMemo(() => {
    if (!formStudioId || !otaStudios) return "No Studio Assigned";
    const studio = otaStudios.find((s) => s.id === formStudioId);
    return studio?.studio_number || "No Studio Assigned";
  }, [formStudioId, otaStudios]);

  // Calculate number of nights - auto-calculates when dates are added
  const calculatedNights = useMemo(() => {
    if (!formCheckIn || !formCheckOut) return 0;
    
    try {
      // HTML5 date inputs return YYYY-MM-DD format as strings
      // Ensure we're working with valid date strings
      const checkInStr = formCheckIn.trim();
      const checkOutStr = formCheckOut.trim();
      
      if (!checkInStr || !checkOutStr) return 0;
      
      // Parse dates - parseISO handles YYYY-MM-DD format
      let checkInDate: Date;
      let checkOutDate: Date;
      
      // Try parseISO first (handles YYYY-MM-DD format properly)
      try {
        checkInDate = parseISO(checkInStr);
        checkOutDate = parseISO(checkOutStr);
      } catch {
        // Fallback to Date constructor if parseISO fails
        checkInDate = new Date(checkInStr);
        checkOutDate = new Date(checkOutStr);
      }
      
      // Validate that dates are valid
      if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
        return 0;
      }
      
      // Calculate difference in days (check-out minus check-in)
      const nights = differenceInDays(checkOutDate, checkInDate);
      
      // Return nights only if positive (check-out must be after check-in)
      return nights > 0 ? nights : 0;
    } catch (error) {
      console.error('Error calculating nights:', error, { formCheckIn, formCheckOut });
      return 0;
    }
  }, [formCheckIn, formCheckOut]);

  // Calculate total booking value (nights × price per night) - auto-calculates when price is added
  const calculatedTotalBookingValue = useMemo(() => {
    const pricePerNight = parseFloat(formPricePerNight) || 0;
    return pricePerNight * calculatedNights;
  }, [formPricePerNight, calculatedNights]);

  // Calculate total revenue (booking value - commission) - auto-calculates when commission is added
  const calculatedTotalRevenue = useMemo(() => {
    const commission = parseFloat(formCommission) || 0;
    const revenue = calculatedTotalBookingValue - commission;
    return revenue > 0 ? revenue : 0;
  }, [calculatedTotalBookingValue, formCommission]);

  // Check for conflicting bookings for the selected studio and dates
  const conflictingBookings = useMemo(() => {
    if (!formStudioId || !formCheckIn || !formCheckOut || !bookings) return [];
    
    const checkIn = parseISO(formCheckIn);
    const checkOut = parseISO(formCheckOut);
    
    return bookings.filter((booking) => {
      if (!booking.studio_id || booking.studio_id !== formStudioId) return false;
      if (booking.status === "cancelled" || booking.status === "no_show") return false;
      
      const bookingCheckIn = parseISO(booking.check_in);
      const bookingCheckOut = parseISO(booking.check_out);
      
      // Check for date overlap
      return (
        (checkIn >= bookingCheckIn && checkIn < bookingCheckOut) ||
        (checkOut > bookingCheckIn && checkOut <= bookingCheckOut) ||
        (checkIn <= bookingCheckIn && checkOut >= bookingCheckOut)
      );
    });
  }, [formStudioId, formCheckIn, formCheckOut, bookings]);

  // Filtered bookings
  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    let filtered = bookings;

    if (statusFilter !== "all") {
      if (statusFilter === "expected_arrivals") {
        // Already filtered by date in query
        filtered = filtered.filter((b) => 
          b.status === "arriving" || b.status === "expected_arrivals"
        );
      } else if (statusFilter === "expected_departures") {
        const today = format(new Date(), "yyyy-MM-dd");
        filtered = filtered.filter((b) => 
          format(parseISO(b.check_out), "yyyy-MM-dd") === today &&
          (b.status === "checked_in" || b.status === "in_house_guest" || b.status === "expected_departures")
        );
      } else {
        filtered = filtered.filter((b) => b.status === statusFilter);
      }
    }

    if (channelFilter !== "all") {
      filtered = filtered.filter((b) => b.channel === channelFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (b) =>
          b.external_ref.toLowerCase().includes(query) ||
          b.guest_name.toLowerCase().includes(query) ||
          b.guest_email?.toLowerCase().includes(query) ||
          b.guest_phone?.toLowerCase().includes(query) ||
          b.studio?.studio_number.toLowerCase().includes(query)
      );
    }

    if (unallocatedOnly) {
      filtered = filtered.filter((b) => !b.studio_id);
    }

    if (checkInFromFilter) {
      filtered = filtered.filter((b) => b.check_in >= checkInFromFilter);
    }

    if (checkInToFilter) {
      filtered = filtered.filter((b) => b.check_in <= checkInToFilter);
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === "check_in_asc") {
        return parseISO(a.check_in).getTime() - parseISO(b.check_in).getTime();
      }

      if (sortBy === "check_out_asc") {
        return parseISO(a.check_out).getTime() - parseISO(b.check_out).getTime();
      }

      if (sortBy === "created_desc") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }

      if (sortBy === "revenue_desc") {
        return (b.total_revenue ?? 0) - (a.total_revenue ?? 0);
      }

      // Default: operational sorting
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const aCheckIn = parseISO(a.check_in);
      const bCheckIn = parseISO(b.check_in);
      const aCheckOut = parseISO(a.check_out);
      const bCheckOut = parseISO(b.check_out);

      const aIsPast = aCheckOut < today;
      const bIsPast = bCheckOut < today;

      if (aIsPast !== bIsPast) {
        return aIsPast ? 1 : -1;
      }

      // Both upcoming/current: nearest check-in first, then nearest check-out
      if (!aIsPast && !bIsPast) {
        if (aCheckIn.getTime() !== bCheckIn.getTime()) {
          return aCheckIn.getTime() - bCheckIn.getTime();
        }
        return aCheckOut.getTime() - bCheckOut.getTime();
      }

      // Both past: latest check-out first
      return bCheckOut.getTime() - aCheckOut.getTime();
    });
  }, [bookings, statusFilter, channelFilter, searchQuery, checkInFromFilter, checkInToFilter, unallocatedOnly, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / bookingsPerPage));
  const paginatedBookings = useMemo(() => {
    const startIndex = (currentPage - 1) * bookingsPerPage;
    return filteredBookings.slice(startIndex, startIndex + bookingsPerPage);
  }, [filteredBookings, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, channelFilter, searchQuery, checkInFromFilter, checkInToFilter, unallocatedOnly, sortBy]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // Stats calculation
  const stats = useMemo(() => {
    if (!bookings) {
      return {
        arriving: 0,
        expected_arrivals: 0,
        checked_in: 0,
        in_house_guest: 0,
        checked_out: 0,
        expected_departures: 0,
        no_show: 0,
        cancelled: 0,
      };
    }

    const today = format(new Date(), "yyyy-MM-dd");
    return {
      arriving: bookings.filter((b) => b.status === "arriving").length,
      expected_arrivals: bookings.filter((b) => 
        (b.status === "arriving" || b.status === "expected_arrivals") &&
        format(parseISO(b.check_in), "yyyy-MM-dd") === today
      ).length,
      checked_in: bookings.filter((b) => b.status === "checked_in").length,
      in_house_guest: bookings.filter((b) => b.status === "in_house_guest").length,
      checked_out: bookings.filter((b) => b.status === "checked_out").length,
      expected_departures: bookings.filter((b) => 
        format(parseISO(b.check_out), "yyyy-MM-dd") === today &&
        (b.status === "checked_in" || b.status === "in_house_guest")
      ).length,
      no_show: bookings.filter((b) => b.status === "no_show").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
    };
  }, [bookings]);

  // Check if user is Reservationist or Ops Manager
  const isReservationist = profile?.staff_subrole === "reservationist" || role === "superadmin";
  const isOpsManager = role === "operations_manager" || role === "staff" || role === "superadmin" || role === "admin";

  // Handle row click
  const handleRowClick = (booking: OTABookingWithRelations) => {
    setSelectedBooking(booking);
    setDetailsOpen(true);
  };

  // Handle create booking
  const handleCreateBooking = async () => {
    if (!formExternalRef.trim() || !formGuestName.trim() || !formStudioId || !formCheckIn || !formCheckOut) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all required fields (External Ref, Guest Name, Studio, Check-in, Check-out).",
      });
      return;
    }

    // Validate dates
    if (new Date(formCheckOut) <= new Date(formCheckIn)) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Check-out date must be after check-in date.",
      });
      return;
    }

    // Check for conflicting bookings
    if (conflictingBookings.length > 0) {
      toast({
        variant: "destructive",
        title: "Studio Conflict",
        description: `This studio is already booked for the selected dates. Please choose different dates or another studio.`,
      });
      return;
    }

    // Validate financial fields
    const pricePerNight = parseFloat(formPricePerNight);
    const commission = parseFloat(formCommission) || 0;
    
    if (!formPricePerNight || isNaN(pricePerNight) || pricePerNight <= 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a valid price per night (must be greater than 0).",
      });
      return;
    }

    if (commission < 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Commission amount cannot be negative.",
      });
      return;
    }

    if (commission > calculatedTotalBookingValue) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Commission amount cannot exceed total booking value.",
      });
      return;
    }

    try {
      await createBooking.mutateAsync({
        external_ref: formExternalRef.trim(),
        channel: formChannel,
        guest_name: formGuestName.trim(),
        guest_phone: formGuestPhone.trim() || undefined,
        guest_email: formGuestEmail.trim() || undefined,
        studio_id: formStudioId,
        check_in: formCheckIn,
        check_out: formCheckOut,
        status: formStatus,
        notes: formNotes.trim() || undefined,
        internal_notes: formInternalNotes.trim() || undefined,
        price_per_night: pricePerNight,
        commission_amount: commission > 0 ? commission : undefined,
        currency: "GBP",
      });

      toast({
        title: "Booking created",
        description: "OTA booking has been created successfully.",
      });

      // Reset form
      setFormExternalRef("");
      setFormChannel("airbnb");
      setFormGuestName("");
      setFormGuestPhone("");
      setFormGuestEmail("");
      setFormStudioId("");
      setFormCheckIn("");
      setFormCheckOut("");
      setFormStatus("arriving");
      setFormNotes("");
      setFormInternalNotes("");
      setFormPricePerNight("");
      setFormCommission("");
      setCreateDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to create booking.",
      });
    }
  };

  // Handle bulk status update
  const handleBulkStatusUpdate = async () => {
    if (!selectedStatus || selectedBookings.size === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a status and at least one booking.",
      });
      return;
    }

    try {
      const ids = Array.from(selectedBookings);
      await bulkUpdate.mutateAsync({
        ids,
        updates: {
          status: selectedStatus,
        },
      });

      toast({
        title: "Status updated",
        description: `Updated status for ${ids.length} booking(s).`,
      });

      setStatusDialogOpen(false);
      setSelectedStatus("");
      setSelectedBookings(new Set());
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update status.",
      });
    }
  };

  // Handle bulk mark no-show
  const handleBulkMarkNoShow = async () => {
    if (selectedBookings.size === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select at least one booking.",
      });
      return;
    }

    try {
      const ids = Array.from(selectedBookings);
      await bulkUpdate.mutateAsync({
        ids,
        updates: {
          status: "no_show",
        },
      });

      toast({
        title: "Marked as No Show",
        description: `Marked ${ids.length} booking(s) as no show.`,
      });

      setSelectedBookings(new Set());
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update status.",
      });
    }
  };

  // Handle bulk cancel
  const handleBulkCancel = async () => {
    if (selectedBookings.size === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select at least one booking.",
      });
      return;
    }

    try {
      const ids = Array.from(selectedBookings);
      await bulkUpdate.mutateAsync({
        ids,
        updates: {
          status: "cancelled",
        },
      });

      toast({
        title: "Bookings cancelled",
        description: `Cancelled ${ids.length} booking(s).`,
      });

      setSelectedBookings(new Set());
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to cancel bookings.",
      });
    }
  };

  // Handle status update
  const handleStatusUpdate = async (newStatus: string) => {
    if (!selectedBooking) return;

    try {
      await updateBooking.mutateAsync({
        id: selectedBooking.id,
        updates: {
          status: newStatus,
        },
      });

      toast({
        title: "Status updated",
        description: "The booking status has been updated successfully.",
      });

      setDetailsOpen(false);
      setSelectedBooking(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update status.",
      });
    }
  };

  const renderCreateBookingForm = () => (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>External Reference *</Label>
          <Input
            placeholder="e.g., AB123456"
            value={formExternalRef}
            onChange={(e) => setFormExternalRef(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Channel *</Label>
          <Select value={formChannel} onValueChange={(value: "airbnb" | "booking" | "agoda" | "expedia" | "other") => setFormChannel(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.filter((c) => c.value !== "all").map((channel) => (
                <SelectItem key={channel.value} value={channel.value}>
                  {channel.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Guest Name *</Label>
        <Input
          placeholder="Guest full name"
          value={formGuestName}
          onChange={(e) => setFormGuestName(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Guest Phone</Label>
          <Input
            placeholder="+44 1234 567890"
            value={formGuestPhone}
            onChange={(e) => setFormGuestPhone(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Guest Email</Label>
          <Input
            type="email"
            placeholder="guest@example.com"
            value={formGuestEmail}
            onChange={(e) => setFormGuestEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Studio * (OTA Allocated Only)</Label>
        <Popover open={studioSearchOpen} onOpenChange={setStudioSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={studioSearchOpen}
              className={cn(
                "w-full justify-between font-normal",
                !formStudioId && "border-destructive"
              )}
            >
              <span className="truncate">{selectedStudioDisplay}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search studios by number..."
                value={studioSearch}
                onValueChange={setStudioSearch}
              />
              <CommandList>
                <CommandEmpty>No OTA studios found.</CommandEmpty>
                <CommandGroup>
                  {filteredOTAStudios.map((studio) => {
                    const hasConflict = conflictingBookings.some(
                      (b) => b.studio_id === studio.id
                    );
                    return (
                      <CommandItem
                        key={studio.id}
                        value={studio.studio_number || studio.id}
                        onSelect={() => {
                          setFormStudioId(studio.id);
                          setStudioSearchOpen(false);
                          setStudioSearch("");
                        }}
                        className={cn(
                          "cursor-pointer",
                          hasConflict && formCheckIn && formCheckOut && "opacity-50"
                        )}
                        disabled={hasConflict && formCheckIn && formCheckOut}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            formStudioId === studio.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex-1">
                          <p className="font-medium">
                            {studio.studio_number || studio.id}
                            {hasConflict && formCheckIn && formCheckOut && (
                              <span className="ml-2 text-xs text-destructive">
                                (Booked)
                              </span>
                            )}
                          </p>
                          {studio.floor && (
                            <p className="text-xs text-muted-foreground">
                              Floor {studio.floor}
                            </p>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {otaStudios.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No OTA-allocated studios available. Please allocate studios to OTA first.
          </p>
        )}
        {conflictingBookings.length > 0 && formCheckIn && formCheckOut && (
          <p className="text-xs text-destructive font-medium">
            ⚠️ This studio has conflicting bookings for the selected dates. Please choose different dates.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Check-in Date *</Label>
          <Input
            type="date"
            value={formCheckIn}
            onChange={(e) => setFormCheckIn(e.target.value)}
            disabled={!formStudioId}
          />
          {!formStudioId && (
            <p className="text-xs text-muted-foreground">Select a studio first</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Check-out Date *</Label>
          <Input
            type="date"
            value={formCheckOut}
            onChange={(e) => setFormCheckOut(e.target.value)}
            min={formCheckIn || undefined}
            disabled={!formStudioId}
          />
          {formCheckIn && formCheckOut && (
            <p className={cn(
              "text-xs",
              calculatedNights > 0 ? "text-muted-foreground" : "text-destructive"
            )}>
              {calculatedNights > 0
                ? `${calculatedNights} night${calculatedNights !== 1 ? "s" : ""}`
                : "Check-out must be after check-in"
              }
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={formStatus} onValueChange={setFormStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OTA_STATUSES.filter((s) => s.value !== "all").map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Price per Night (GBP) *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="25.00"
            value={formPricePerNight}
            onChange={(e) => setFormPricePerNight(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Commission Amount (GBP) *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="15.00"
            value={formCommission}
            onChange={(e) => setFormCommission(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Number of Nights</Label>
          <Input
            value={calculatedNights > 0 ? calculatedNights.toString() : "0"}
            readOnly
            className={cn(
              "bg-muted",
              formCheckIn && formCheckOut && calculatedNights === 0 && "border-destructive"
            )}
          />
        </div>
        <div className="space-y-2">
          <Label>Total Booking Value (GBP)</Label>
          <Input
            value={calculatedTotalBookingValue.toFixed(2)}
            readOnly
            className="bg-muted"
          />
        </div>
        <div className="space-y-2">
          <Label>Total Revenue (GBP)</Label>
          <Input
            value={calculatedTotalRevenue.toFixed(2)}
            readOnly
            className="bg-muted font-semibold"
          />
        </div>
      </div>

      {calculatedNights > 0 && formPricePerNight && (
        <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
          <div className="font-medium mb-1">Calculation Breakdown:</div>
          <div>Total Booking Value: £{formPricePerNight} × {calculatedNights} night{calculatedNights !== 1 ? "s" : ""} = £{calculatedTotalBookingValue.toFixed(2)}</div>
          {formCommission && parseFloat(formCommission) > 0 && (
            <div>Commission: -£{parseFloat(formCommission).toFixed(2)}</div>
          )}
          <div className="font-semibold mt-1">Total Revenue: £{calculatedTotalRevenue.toFixed(2)}</div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Internal Notes (Staff Only)</Label>
        <Textarea
          placeholder="Internal notes for staff reference..."
          value={formInternalNotes}
          onChange={(e) => setFormInternalNotes(e.target.value)}
          className="min-h-[80px]"
        />
      </div>
    </div>
  );

  const renderCreateBookingActions = () => (
    <>
      <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="rounded-md">
        Cancel
      </Button>
      <Button
        onClick={handleCreateBooking}
        className="rounded-md"
        disabled={createBooking.isPending || (conflictingBookings.length > 0 && !!formCheckIn && !!formCheckOut)}
      >
        {createBooking.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Plus className="h-4 w-4 mr-2" />
            Create Booking
          </>
        )}
      </Button>
    </>
  );

  // Skeleton loader
  if (isLoading) {
    return (
      <AdminLayout pageTitle="OTA Bookings" subtitle="Manage OTA bookings and allocations">
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
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
    <AdminLayout 
      pageTitle="OTA Bookings" 
      subtitle="Manage OTA bookings and allocations"
      mobileActionButton={
        <Button
          onClick={() => setCreateDialogOpen(true)}
          size="sm"
          className="rounded-md h-9 w-9 p-0 bg-primary hover:bg-primary/90 text-white flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Header with Create Button (Desktop) */}
        <div className="hidden lg:flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold uppercase tracking-wide">
              OTA Bookings
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage OTA bookings and allocations
            </p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="rounded-md uppercase tracking-wide gap-2"
          >
            <Plus className="h-4 w-4" />
            New Booking
          </Button>
        </div>
        
        {/* Stats Cards - Click to Filter */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "arriving" ? "all" : "arriving")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Arriving</div>
              <div className="text-xl md:text-2xl font-bold text-blue-600">{stats.arriving}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "expected_arrivals" ? "all" : "expected_arrivals")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Today Arrivals</div>
              <div className="text-xl md:text-2xl font-bold text-green-600">{stats.expected_arrivals}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "checked_in" ? "all" : "checked_in")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Checked In</div>
              <div className="text-xl md:text-2xl font-bold text-emerald-600">{stats.checked_in}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "in_house_guest" ? "all" : "in_house_guest")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">In House</div>
              <div className="text-xl md:text-2xl font-bold text-teal-600">{stats.in_house_guest}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "checked_out" ? "all" : "checked_out")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Checked Out</div>
              <div className="text-xl md:text-2xl font-bold text-gray-600">{stats.checked_out}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "expected_departures" ? "all" : "expected_departures")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Today Departures</div>
              <div className="text-xl md:text-2xl font-bold text-orange-600">{stats.expected_departures}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "no_show" ? "all" : "no_show")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">No Show</div>
              <div className="text-xl md:text-2xl font-bold text-red-600">{stats.no_show}</div>
            </CardContent>
          </Card>
          <Card
            className="rounded-3xl border border-border/60 shadow-xl cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => setStatusFilter(statusFilter === "cancelled" ? "all" : "cancelled")}
          >
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Cancelled</div>
              <div className="text-xl md:text-2xl font-bold text-slate-600">{stats.cancelled}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Bulk Actions */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base md:text-lg font-display font-bold uppercase tracking-wide">
                <Filter className="h-4 w-4 md:h-5 md:w-5" />
                Filters & Actions
              </CardTitle>
              <div className="hidden lg:flex items-center gap-2">
                <Button
                  type="button"
                  variant={unallocatedOnly ? "default" : "outline"}
                  onClick={() => setUnallocatedOnly((prev) => !prev)}
                  className="rounded-md"
                >
                  {unallocatedOnly ? "Unallocated Only: ON" : "Unallocated Only"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setStatusFilter("all");
                    setChannelFilter("all");
                    setSearchQuery("");
                    setSortBy("operational");
                    setCheckInFromFilter("");
                    setCheckInToFilter("");
                    setUnallocatedOnly(false);
                    setSelectedBookings(new Set());
                  }}
                  className="rounded-md"
                  disabled={!hasActiveFilters}
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 items-center">
                <div className="xl:col-span-3">
                <Input
                  placeholder="Ref, guest name, studio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-md text-sm md:text-base"
                />
                </div>
                <div className="xl:col-span-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OTA_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
                <div className="xl:col-span-2">
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((channel) => (
                      <SelectItem key={channel.value} value={channel.value}>
                        {channel.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
                <div className="xl:col-span-3">
                  <Popover open={checkInRangeOpen} onOpenChange={setCheckInRangeOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="rounded-md w-full justify-start text-left font-normal"
                      >
                        {checkInRangeLabel}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-4" align="end">
                      <div className="space-y-3">
                        <Input
                          type="date"
                          value={checkInFromFilter}
                          onChange={(e) => setCheckInFromFilter(e.target.value)}
                          className="rounded-md text-sm"
                        />
                        <Input
                          type="date"
                          value={checkInToFilter}
                          onChange={(e) => setCheckInToFilter(e.target.value)}
                          className="rounded-md text-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-md"
                            onClick={() => {
                              setCheckInFromFilter("");
                              setCheckInToFilter("");
                            }}
                          >
                            Reset
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-md"
                            onClick={() => setCheckInRangeOpen(false)}
                          >
                            Done
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="xl:col-span-2">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:hidden">
                <Button
                  type="button"
                  variant={unallocatedOnly ? "default" : "outline"}
                  onClick={() => setUnallocatedOnly((prev) => !prev)}
                  className="rounded-md"
                >
                  {unallocatedOnly ? "Unallocated Only: ON" : "Unallocated Only"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setStatusFilter("all");
                    setChannelFilter("all");
                    setSearchQuery("");
                    setSortBy("operational");
                    setCheckInFromFilter("");
                    setCheckInToFilter("");
                    setUnallocatedOnly(false);
                    setSelectedBookings(new Set());
                  }}
                  className="rounded-md"
                  disabled={!hasActiveFilters}
                >
                  Clear Filters
                </Button>
              </div>
              {selectedBookings.size > 0 && (
                <div className="flex flex-col gap-2">
                  <Label className="text-xs md:text-sm">Bulk Actions</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={() => setStatusDialogOpen(true)}
                      variant="outline"
                      size="sm"
                      className="rounded-md text-xs"
                    >
                      Update Status ({selectedBookings.size})
                    </Button>
                    <Button
                      onClick={handleBulkMarkNoShow}
                      variant="outline"
                      size="sm"
                      className="rounded-md text-xs"
                    >
                      Mark No Show ({selectedBookings.size})
                    </Button>
                    <Button
                      onClick={handleBulkCancel}
                      variant="destructive"
                      size="sm"
                      className="rounded-md text-xs"
                    >
                      Cancel ({selectedBookings.size})
                    </Button>
                    <Button
                      onClick={() => setSelectedBookings(new Set())}
                      variant="ghost"
                      size="sm"
                      className="rounded-md text-xs"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Bookings List */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              Bookings
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {filteredBookings.length} booking{filteredBookings.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredBookings.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No bookings found</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {searchQuery || statusFilter !== "all" || channelFilter !== "all"
                    ? "Try adjusting your filters."
                    : "No OTA bookings found."}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop: Table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {isReservationist && (
                          <TableHead className="w-12">
                            <Checkbox
                              checked={
                                paginatedBookings.length > 0 &&
                                paginatedBookings.every((booking) => selectedBookings.has(booking.id))
                              }
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  const newSet = new Set(selectedBookings);
                                  paginatedBookings.forEach((booking) => newSet.add(booking.id));
                                  setSelectedBookings(newSet);
                                } else {
                                  const newSet = new Set(selectedBookings);
                                  paginatedBookings.forEach((booking) => newSet.delete(booking.id));
                                  setSelectedBookings(newSet);
                                }
                              }}
                            />
                          </TableHead>
                        )}
                        <TableHead className="text-xs md:text-sm">Booking Ref</TableHead>
                        <TableHead className="text-xs md:text-sm">Guest</TableHead>
                        <TableHead className="text-xs md:text-sm">Studio</TableHead>
                        <TableHead className="text-xs md:text-sm">Check-in</TableHead>
                        <TableHead className="text-xs md:text-sm">Check-out</TableHead>
                        <TableHead className="text-xs md:text-sm">Status</TableHead>
                        <TableHead className="text-xs md:text-sm">Channel</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedBookings.map((booking) => (
                        <TableRow
                          key={booking.id}
                          className="hover:bg-accent/50 cursor-pointer"
                          onClick={() => handleRowClick(booking)}
                        >
                          {isReservationist && (
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selectedBookings.has(booking.id)}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(selectedBookings);
                                  if (checked) {
                                    newSet.add(booking.id);
                                  } else {
                                    newSet.delete(booking.id);
                                  }
                                  setSelectedBookings(newSet);
                                }}
                              />
                            </TableCell>
                          )}
                          <TableCell>
                            <span className="font-semibold text-sm">{booking.external_ref}</span>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{booking.guest_name}</div>
                              {booking.guest_email && (
                                <div className="text-xs text-muted-foreground">{booking.guest_email}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {booking.studio ? (
                              <span className="text-sm font-medium">
                                {booking.studio.studio_number}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">Unallocated</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {format(parseISO(booking.check_in), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-xs">
                            {format(parseISO(booking.check_out), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>{getStatusBadge(booking.status)}</TableCell>
                          <TableCell>{getChannelBadge(booking.channel)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile: Cards */}
                <div className="md:hidden space-y-4">
                  {paginatedBookings.map((booking) => (
                    <Card
                      key={booking.id}
                      className="rounded-2xl border border-border/60 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleRowClick(booking)}
                    >
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="text-sm font-semibold mb-1">{booking.guest_name}</h3>
                              <p className="text-xs text-muted-foreground">{booking.external_ref}</p>
                            </div>
                            {getStatusBadge(booking.status)}
                          </div>
                          {booking.studio && (
                            <div className="text-xs text-muted-foreground">
                              Studio: {booking.studio.studio_number}
                            </div>
                          )}
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <div>
                              <div>Check-in</div>
                              <div className="font-medium text-foreground">
                                {format(parseISO(booking.check_in), "MMM d")}
                              </div>
                            </div>
                            <div>
                              <div>Check-out</div>
                              <div className="font-medium text-foreground">
                                {format(parseISO(booking.check_out), "MMM d")}
                              </div>
                            </div>
                          </div>
                          <div>{getChannelBadge(booking.channel)}</div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {filteredBookings.length > bookingsPerPage && (
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground md:text-sm">
                      Showing {(currentPage - 1) * bookingsPerPage + 1}-
                      {Math.min(currentPage * bookingsPerPage, filteredBookings.length)} of {filteredBookings.length}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md"
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-muted-foreground md:text-sm">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md"
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Details Drawer/Sheet */}
        {selectedBooking && (
          <>
            {isMobile ? (
              <Drawer open={detailsOpen} onOpenChange={(open) => { setDetailsOpen(open); if (!open) setDetailsEditing(false); }}>
                <DrawerContent className="max-h-[96vh]">
                  <DrawerHeader className="text-left flex flex-row flex-wrap items-start justify-between gap-3 pr-10">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <DrawerTitle>{selectedBooking.guest_name}</DrawerTitle>
                      <DrawerDescription>
                        Booking {selectedBooking.external_ref}
                      </DrawerDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {detailsEditing ? (
                        <Button variant="outline" size="sm" onClick={() => setDetailsEditing(false)} className="rounded-md gap-2">
                          Cancel
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setDetailsEditing(true)} className="rounded-md gap-2">
                          <Pencil className="h-4 w-4" />
                          Edit booking
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(false)} className="rounded-md">
                        Close
                      </Button>
                    </div>
                  </DrawerHeader>
                  <ScrollArea className="flex-1 px-4">
                    <OTABookingDetailsContent
                      booking={selectedBooking}
                      activityLog={activityLog || []}
                      onStatusUpdate={handleStatusUpdate}
                      isReservationist={isReservationist}
                      isOpsManager={isOpsManager}
                      isEditing={detailsEditing}
                      setIsEditing={setDetailsEditing}
                      studios={otaStudios.map((s) => ({ id: s.id, studio_number: s.studio_number }))}
                      allBookings={bookings ?? []}
                    />
                  </ScrollArea>
                </DrawerContent>
              </Drawer>
            ) : (
              <Sheet open={detailsOpen} onOpenChange={(open) => { setDetailsOpen(open); if (!open) setDetailsEditing(false); }}>
                <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
                  <SheetHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pr-10">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <SheetTitle>{selectedBooking.guest_name}</SheetTitle>
                      <SheetDescription>
                        Booking {selectedBooking.external_ref}
                      </SheetDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {detailsEditing ? (
                        <Button variant="outline" size="sm" onClick={() => setDetailsEditing(false)} className="rounded-md gap-2">
                          Cancel
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setDetailsEditing(true)} className="rounded-md gap-2">
                          <Pencil className="h-4 w-4" />
                          Edit booking
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(false)} className="rounded-md">
                        Close
                      </Button>
                    </div>
                  </SheetHeader>
                  <ScrollArea className="flex-1 mt-6">
                    <OTABookingDetailsContent
                      booking={selectedBooking}
                      activityLog={activityLog || []}
                      onStatusUpdate={handleStatusUpdate}
                      isReservationist={isReservationist}
                      isOpsManager={isOpsManager}
                      isEditing={detailsEditing}
                      setIsEditing={setDetailsEditing}
                      studios={otaStudios.map((s) => ({ id: s.id, studio_number: s.studio_number }))}
                      allBookings={bookings ?? []}
                    />
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            )}
          </>
        )}

        {/* Create Booking Sheet */}
        {isMobile ? (
          <Drawer open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DrawerContent className="max-h-[90vh] rounded-t-[28px] mb-0">
              <DrawerHeader className="text-left px-4 pt-6 pb-2">
                <DrawerTitle>Create New OTA Booking</DrawerTitle>
                <DrawerDescription>
                  Add a new OTA booking to the system.
                </DrawerDescription>
              </DrawerHeader>
              <ScrollArea className="flex-1 px-4">
                {renderCreateBookingForm()}
              </ScrollArea>
              <DrawerFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
                {renderCreateBookingActions()}
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        ) : (
          <Sheet open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <SheetContent side="right" className="w-full sm:max-w-[600px] overflow-y-auto flex flex-col">
              <SheetHeader>
                <SheetTitle>Create New OTA Booking</SheetTitle>
                <SheetDescription>
                  Add a new OTA booking to the system.
                </SheetDescription>
              </SheetHeader>
              {renderCreateBookingForm()}
              <SheetFooter className="mt-auto pt-4">
                {renderCreateBookingActions()}
              </SheetFooter>
            </SheetContent>
          </Sheet>
        )}

        {/* Bulk Status Update Dialog */}
        <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-3xl">
            <DialogHeader>
              <DialogTitle>Update Status</DialogTitle>
              <DialogDescription>
                Update status for {selectedBookings.size} selected booking(s).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>New Status</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="rounded-md">
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    {OTA_STATUSES.filter((s) => s.value !== "all").map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusDialogOpen(false)} className="rounded-md">
                Cancel
              </Button>
              <Button onClick={handleBulkStatusUpdate} className="rounded-md">
                Update
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

// Studio option for edit form
type StudioOption = { id: string; studio_number: string };

const STATUS_OPTIONS = [
  "arriving", "expected_arrivals", "pre_check_in", "checked_in", "in_house_guest",
  "day_use", "checked_out", "expected_departures", "departing", "no_show", "cancelled",
];
const CHANNEL_OPTIONS = ["airbnb", "booking", "agoda", "expedia", "other"];

// OTA Booking Details Content Component
const OTABookingDetailsContent = ({
  booking,
  activityLog,
  onStatusUpdate,
  isReservationist,
  isOpsManager,
  isEditing,
  setIsEditing,
  studios,
  allBookings,
}: {
  booking: OTABookingWithRelations;
  activityLog: any[];
  onStatusUpdate: (status: string) => void;
  isReservationist: boolean;
  isOpsManager: boolean;
  isEditing?: boolean;
  setIsEditing?: (v: boolean) => void;
  studios?: StudioOption[];
  allBookings: OTABookingWithRelations[];
}) => {
  const { toast } = useToast();
  const updateBooking = useUpdateOTABooking();
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>(booking.status);
  const [internalNotes, setInternalNotes] = useState<string>(booking.internal_notes || "");
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);

  const [editForm, setEditForm] = useState({
    external_ref: booking.external_ref,
    channel: booking.channel,
    guest_name: booking.guest_name,
    guest_phone: booking.guest_phone ?? "",
    guest_email: booking.guest_email ?? "",
    studio_id: booking.studio_id ?? "",
    check_in: format(parseISO(booking.check_in), "yyyy-MM-dd"),
    check_out: format(parseISO(booking.check_out), "yyyy-MM-dd"),
    status: booking.status,
    notes: booking.notes ?? "",
    internal_notes: booking.internal_notes ?? "",
    price_per_night: booking.price_per_night != null ? String(booking.price_per_night) : "",
    commission_amount: booking.commission_amount != null ? String(booking.commission_amount) : "",
    currency: booking.currency ?? "GBP",
  });

  // Sync form from booking only when booking.id changes; use prev to avoid overwriting with empty when booking has null/undefined
  useEffect(() => {
    const checkIn = booking.check_in ? format(parseISO(booking.check_in), "yyyy-MM-dd") : "";
    const checkOut = booking.check_out ? format(parseISO(booking.check_out), "yyyy-MM-dd") : "";
    setEditForm((prev) => ({
      external_ref: booking.external_ref ?? prev.external_ref,
      channel: booking.channel ?? prev.channel,
      guest_name: booking.guest_name ?? prev.guest_name,
      guest_phone: booking.guest_phone ?? prev.guest_phone ?? "",
      guest_email: booking.guest_email ?? prev.guest_email ?? "",
      studio_id: booking.studio_id ?? prev.studio_id ?? "",
      check_in: checkIn || prev.check_in,
      check_out: checkOut || prev.check_out,
      status: booking.status ?? prev.status,
      notes: booking.notes ?? prev.notes ?? "",
      internal_notes: booking.internal_notes ?? prev.internal_notes ?? "",
      price_per_night: booking.price_per_night != null ? String(booking.price_per_night) : (prev.price_per_night ?? ""),
      commission_amount: booking.commission_amount != null ? String(booking.commission_amount) : (prev.commission_amount ?? ""),
      currency: booking.currency ?? prev.currency ?? "GBP",
    }));
    if (setIsEditing) setIsEditing(false);
  }, [booking.id]);

  const handleUpdateNotes = async () => {
    try {
      await updateBooking.mutateAsync({
        id: booking.id,
        updates: {
          internal_notes: internalNotes,
        },
      });

      toast({
        title: "Notes updated",
        description: "Internal notes have been updated successfully.",
      });

      setNotesDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update notes.",
      });
    }
  };

  const handleStatusChange = async () => {
    try {
      await updateBooking.mutateAsync({
        id: booking.id,
        updates: {
          status: selectedStatus,
        },
      });

      toast({
        title: "Status updated",
        description: "The booking status has been updated successfully.",
      });

      onStatusUpdate(selectedStatus);
      setStatusDialogOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update status.",
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editForm.guest_name.trim() || !editForm.external_ref.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Guest name and booking reference are required." });
      return;
    }
    try {
      await updateBooking.mutateAsync({
        id: booking.id,
        updates: {
          external_ref: editForm.external_ref,
          channel: editForm.channel as "airbnb" | "booking" | "agoda" | "expedia" | "other",
          guest_name: editForm.guest_name,
          guest_phone: editForm.guest_phone || null,
          guest_email: editForm.guest_email || null,
          studio_id: editForm.studio_id || null,
          check_in: editForm.check_in,
          check_out: editForm.check_out,
          status: editForm.status,
          notes: editForm.notes || null,
          internal_notes: editForm.internal_notes || null,
          price_per_night: editForm.price_per_night ? Number(editForm.price_per_night) : null,
          commission_amount: editForm.commission_amount ? Number(editForm.commission_amount) : null,
          currency: editForm.currency || "GBP",
        },
      });
      toast({ title: "Booking updated", description: "OTA booking has been saved." });
      if (setIsEditing) setIsEditing(false);
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error?.message || "Failed to update booking." });
    }
  };

  // Determine next possible statuses based on current status
  const getNextStatuses = (currentStatus: string) => {
    const statusFlow: Record<string, string[]> = {
      arriving: ["expected_arrivals", "pre_check_in", "checked_in", "no_show", "cancelled"],
      expected_arrivals: ["pre_check_in", "checked_in", "no_show", "cancelled"],
      pre_check_in: ["checked_in", "no_show", "cancelled"],
      checked_in: ["in_house_guest", "checked_out", "cancelled"],
      in_house_guest: ["day_use", "checked_out", "expected_departures", "departing"],
      day_use: ["checked_out"],
      checked_out: [],
      expected_departures: ["departing", "checked_out"],
      departing: ["checked_out"],
      no_show: [],
      cancelled: [],
    };
    return statusFlow[currentStatus] || [];
  };

  const nextStatuses = getNextStatuses(booking.status);

  if (isEditing && setIsEditing && studios && studios.length >= 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2 items-center">
          <Button variant="outline" size="sm" className="rounded-md gap-2" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
          <Button variant="default" size="sm" className="rounded-md gap-2" disabled={updateBooking.isPending || !editForm.guest_name.trim() || !editForm.external_ref.trim()} onClick={handleSaveEdit}>
            {updateBooking.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Booking reference</Label>
            <Input value={editForm.external_ref} onChange={(e) => setEditForm((f) => ({ ...f, external_ref: e.target.value }))} className="rounded-md" />
          </div>
          <div className="space-y-2">
            <Label>Channel</Label>
            <Select value={editForm.channel} onValueChange={(v) => setEditForm((f) => ({ ...f, channel: v }))}>
              <SelectTrigger className="rounded-md"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.map((ch) => <SelectItem key={ch} value={ch}>{ch}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Guest name</Label>
            <Input value={editForm.guest_name} onChange={(e) => setEditForm((f) => ({ ...f, guest_name: e.target.value }))} className="rounded-md" />
          </div>
          <div className="space-y-2">
            <Label>Guest email</Label>
            <Input type="email" value={editForm.guest_email} onChange={(e) => setEditForm((f) => ({ ...f, guest_email: e.target.value }))} className="rounded-md" />
          </div>
          <div className="space-y-2">
            <Label>Guest phone</Label>
            <Input value={editForm.guest_phone} onChange={(e) => setEditForm((f) => ({ ...f, guest_phone: e.target.value }))} className="rounded-md" />
          </div>
          <div className="space-y-2">
            <Label>Studio</Label>
            <Select value={editForm.studio_id || "none"} onValueChange={(v) => setEditForm((f) => ({ ...f, studio_id: v === "none" ? "" : v }))}>
              <SelectTrigger className="rounded-md"><SelectValue placeholder="Unallocated" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unallocated</SelectItem>
                {studios.map((s) => <SelectItem key={s.id} value={s.id}>{s.studio_number}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger className="rounded-md"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Check-in</Label>
            <Input type="date" value={editForm.check_in} onChange={(e) => setEditForm((f) => ({ ...f, check_in: e.target.value }))} className="rounded-md" />
          </div>
          <div className="space-y-2">
            <Label>Check-out</Label>
            <Input type="date" value={editForm.check_out} onChange={(e) => setEditForm((f) => ({ ...f, check_out: e.target.value }))} className="rounded-md" />
          </div>
          <div className="space-y-2">
            <Label>Price per night</Label>
            <Input type="number" step="0.01" value={editForm.price_per_night} onChange={(e) => setEditForm((f) => ({ ...f, price_per_night: e.target.value }))} className="rounded-md" />
          </div>
          <div className="space-y-2">
            <Label>Commission amount</Label>
            <Input type="number" step="0.01" value={editForm.commission_amount} onChange={(e) => setEditForm((f) => ({ ...f, commission_amount: e.target.value }))} className="rounded-md" />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Input value={editForm.currency} onChange={(e) => setEditForm((f) => ({ ...f, currency: e.target.value }))} className="rounded-md" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Guest-facing notes" className="rounded-2xl min-h-[80px] resize-none" />
        </div>
        <div className="space-y-2">
          <Label>Internal notes</Label>
          <Textarea value={editForm.internal_notes} onChange={(e) => setEditForm((f) => ({ ...f, internal_notes: e.target.value }))} placeholder="Internal only" className="rounded-2xl min-h-[80px] resize-none" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className="space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">Current Status</Label>
          <div className="mt-1">{getStatusBadge(booking.status)}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-muted-foreground">Booking Reference</Label>
            <div className="mt-1 text-sm font-semibold">{booking.external_ref}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Channel</Label>
            <div className="mt-1">{getChannelBadge(booking.channel)}</div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Guest Name</Label>
            <div className="mt-1 text-sm font-semibold">{booking.guest_name}</div>
          </div>
          {booking.guest_email && (
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <div className="mt-1 text-sm flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {booking.guest_email}
              </div>
            </div>
          )}
          {booking.guest_phone && (
            <div>
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <div className="mt-1 text-sm flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {booking.guest_phone}
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Studio</Label>
            <div className="mt-1 text-sm">
              {booking.studio ? (
                <span className="font-medium">{booking.studio.studio_number}</span>
              ) : (
                <span className="text-muted-foreground">Unallocated</span>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Check-in</Label>
            <div className="mt-1 text-sm">
              {format(parseISO(booking.check_in), "MMM d, yyyy")}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Check-out</Label>
            <div className="mt-1 text-sm">
              {format(parseISO(booking.check_out), "MMM d, yyyy")}
            </div>
          </div>
          {booking.number_of_nights !== null && booking.number_of_nights !== undefined && (
            <div>
              <Label className="text-xs text-muted-foreground">Number of Nights</Label>
              <div className="mt-1 text-sm font-semibold">{booking.number_of_nights}</div>
            </div>
          )}
        </div>

        {/* Revenue Breakdown Section */}
        {(booking.price_per_night !== null && booking.price_per_night !== undefined) ||
         (booking.commission_amount !== null && booking.commission_amount !== undefined) ||
         (booking.total_revenue !== null && booking.total_revenue !== undefined) ? (
          <>
            <Separator />
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Revenue Breakdown</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {booking.price_per_night !== null && booking.price_per_night !== undefined && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Price per Night</Label>
                    <div className="mt-1 text-sm font-semibold">
                      {new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: booking.currency || "GBP",
                      }).format(booking.price_per_night)}
                    </div>
                  </div>
                )}
                {booking.number_of_nights !== null && booking.number_of_nights !== undefined && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Number of Nights</Label>
                    <div className="mt-1 text-sm font-semibold">{booking.number_of_nights}</div>
                  </div>
                )}
                {booking.price_per_night !== null && booking.number_of_nights !== null && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Total Booking Value</Label>
                    <div className="mt-1 text-sm font-semibold">
                      {new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: booking.currency || "GBP",
                      }).format((booking.price_per_night || 0) * (booking.number_of_nights || 0))}
                    </div>
                  </div>
                )}
                {booking.commission_amount !== null && booking.commission_amount !== undefined && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Commission</Label>
                    <div className="mt-1 text-sm font-semibold text-orange-600">
                      -{new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: booking.currency || "GBP",
                      }).format(booking.commission_amount)}
                    </div>
                  </div>
                )}
                {booking.total_revenue !== null && booking.total_revenue !== undefined && (
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">Expected payout</Label>
                    <div className="mt-1 text-lg font-bold text-amber-700">
                      {new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: booking.currency || "GBP",
                      }).format(booking.total_revenue)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Not cash received — record payments separately.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}

        <OTABookingPaymentsSection booking={booking} allBookings={allBookings} />

        {booking.notes && (
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <p className="text-sm mt-1 whitespace-pre-wrap">{booking.notes}</p>
          </div>
        )}

        {booking.internal_notes && (
          <div>
            <Label className="text-xs text-muted-foreground">Internal Notes</Label>
            <p className="text-sm mt-1 whitespace-pre-wrap">{booking.internal_notes}</p>
          </div>
        )}
      </div>

      <Separator />

      {/* Activity Log / Timeline */}
      <div>
        <Label className="text-xs text-muted-foreground mb-3 block">Status Timeline</Label>
        <div className="space-y-3">
          {activityLog.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity yet.</p>
          ) : (
            activityLog.map((log) => (
              <div key={log.id} className="flex gap-3 text-xs">
                <div className="flex-shrink-0 w-2 h-2 rounded-md bg-primary mt-1.5" />
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
      {isReservationist && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Actions</p>
          {nextStatuses.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedStatus(booking.status);
                setStatusDialogOpen(true);
              }}
              className="rounded-md w-full justify-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Update Status
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setNotesDialogOpen(true)}
            className="rounded-md w-full justify-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Edit Internal Notes
          </Button>
          {booking.status !== "no_show" && booking.status !== "cancelled" && (
            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border/60">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStatusUpdate("no_show")}
                className="rounded-md flex-1 justify-center gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              >
                <XCircle className="h-4 w-4" />
                Mark as No Show
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onStatusUpdate("cancelled")}
                className="rounded-md flex-1 justify-center gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Cancel Booking
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Status Update Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
            <DialogDescription>
              Change the booking status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="rounded-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OTA_STATUSES.filter((s) => s.value !== "all").map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)} className="rounded-md">
              Cancel
            </Button>
            <Button onClick={handleStatusChange} className="rounded-md">
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Internal Notes Dialog */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Internal Notes</DialogTitle>
            <DialogDescription>
              Add or edit internal notes for this booking (staff only).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Add internal notes..."
                className="min-h-[120px] rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesDialogOpen(false)} className="rounded-md">
              Cancel
            </Button>
            <Button onClick={handleUpdateNotes} className="rounded-md">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OTABookingsDashboard;

