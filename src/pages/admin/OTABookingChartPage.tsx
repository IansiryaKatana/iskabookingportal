import { useState, useMemo, useEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useOTABookings, useUpdateOTABooking, type OTABookingWithRelations } from "@/hooks/useOTABookings";
import { useOutOfOrderRecords } from "@/hooks/useOutOfOrder";
import { useAdminStudios } from "@/hooks/useAdminStudios";
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday, isSameDay, parseISO } from "date-fns";
import {
  Calendar, ChevronLeft, ChevronRight, Filter, Building2, AlertTriangle,
  CheckCircle2, XCircle, Users, Clock, Pencil, Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// Status color mapping
const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    arriving: "bg-blue-500",
    expected_arrivals: "bg-green-500",
    pre_check_in: "bg-purple-500",
    checked_in: "bg-emerald-500",
    in_house_guest: "bg-teal-500",
    day_use: "bg-indigo-500",
    checked_out: "bg-gray-400",
    expected_departures: "bg-orange-500",
    departing: "bg-amber-500",
    no_show: "bg-red-500",
    cancelled: "bg-slate-500",
  };
  return colors[status] || "bg-gray-300";
};

// Channel color mapping - using official brand colors
const getChannelColor = (channel: string) => {
  const colors: Record<string, string> = {
    airbnb: "bg-[#FF5A5F]", // Airbnb brand red/coral
    booking: "bg-[#003580]", // Booking.com brand dark blue
    agoda: "bg-[#5392F9]", // Agoda brand blue
    expedia: "bg-[#FFCC00] text-black", // Expedia brand yellow
    other: "bg-gray-500",
  };
  return colors[channel] || "bg-gray-300";
};

const OTABookingChartPage = () => {
  const { toast } = useToast();
  const { role, profile } = useAuth();
  const isMobile = useIsMobile();
  
  // Date navigation
  const [currentDate, setCurrentDate] = useState(new Date());
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [studioFilter, setStudioFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Details drawer/sheet
  const [selectedBooking, setSelectedBooking] = useState<OTABookingWithRelations | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsEditing, setDetailsEditing] = useState(false);

  // Fetch data
  const { data: bookings, isLoading: bookingsLoading } = useOTABookings({
    check_in_start: format(monthStart, "yyyy-MM-dd"),
    check_in_end: format(monthEnd, "yyyy-MM-dd"),
  });
  const { data: outOfOrderRecords } = useOutOfOrderRecords({ is_active: true });
  const { data: studios } = useAdminStudios({ allocation: "OTA" });

  // Filter bookings
  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    let filtered = bookings;

    if (statusFilter !== "all") {
      filtered = filtered.filter((b) => b.status === statusFilter);
    }

    if (channelFilter !== "all") {
      filtered = filtered.filter((b) => b.channel === channelFilter);
    }

    if (studioFilter !== "all") {
      filtered = filtered.filter((b) => b.studio_id === studioFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (b) =>
          b.external_ref.toLowerCase().includes(query) ||
          b.guest_name.toLowerCase().includes(query) ||
          b.studio?.studio_number.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [bookings, statusFilter, channelFilter, studioFilter, searchQuery]);

  // Get bookings for a specific studio and date
  const getBookingsForStudioDate = (studioId: string, date: Date): OTABookingWithRelations[] => {
    const dateStr = format(date, "yyyy-MM-dd");
    return filteredBookings.filter((booking) => {
      if (!booking.studio_id || booking.studio_id !== studioId) return false;
      const checkIn = format(parseISO(booking.check_in), "yyyy-MM-dd");
      const checkOut = format(parseISO(booking.check_out), "yyyy-MM-dd");
      return dateStr >= checkIn && dateStr < checkOut;
    });
  };

  // Check if studio is out of order on a specific date
  const isStudioOutOfOrder = (studioId: string, date: Date): boolean => {
    if (!outOfOrderRecords) return false;
    const dateStr = format(date, "yyyy-MM-dd");
    return outOfOrderRecords.some((record) => {
      if (record.studio_id !== studioId || !record.is_active) return false;
      const startDate = format(parseISO(record.start_at), "yyyy-MM-dd");
      const endDate = record.end_at ? format(parseISO(record.end_at), "yyyy-MM-dd") : null;
      if (endDate) {
        return dateStr >= startDate && dateStr <= endDate;
      }
      return dateStr >= startDate;
    });
  };

  // Get filtered studios (OTA allocation only)
  const filteredStudios = useMemo(() => {
    if (!studios) return [];
    let filtered = studios.filter((s) => s.allocation === "OTA" && s.is_active);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((s) =>
        s.studio_number.toLowerCase().includes(query)
      );
    }

    return filtered.sort((a, b) => a.studio_number.localeCompare(b.studio_number));
  }, [studios, searchQuery]);

  // Handle cell click
  const handleCellClick = (studioId: string, date: Date) => {
    const dayBookings = getBookingsForStudioDate(studioId, date);
    if (dayBookings.length > 0) {
      // If multiple bookings, show the first one or a list
      setSelectedBooking(dayBookings[0]);
      setDetailsOpen(true);
    }
  };

  // Skeleton loader
  if (bookingsLoading) {
    return (
      <AdminLayout pageTitle="OTA Booking Chart" subtitle="Calendar view of OTA bookings">
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
    <AdminLayout pageTitle="OTA Booking Chart" subtitle="Calendar view of OTA bookings">
      <div className="space-y-6">
        {/* Month Navigation */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                  className="rounded-full"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-center">
                  <div className="text-lg md:text-xl font-semibold">
                    {format(currentDate, "MMMM yyyy")}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                  className="rounded-full"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentDate(new Date())}
                  className="rounded-full"
                >
                  Today
                </Button>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="arriving">Arriving</SelectItem>
                    <SelectItem value="checked_in">Checked In</SelectItem>
                    <SelectItem value="in_house_guest">In House Guest</SelectItem>
                    <SelectItem value="checked_out">Checked Out</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Channel</Label>
                <Select value={channelFilter} onValueChange={setChannelFilter}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Channels</SelectItem>
                    <SelectItem value="airbnb">Airbnb</SelectItem>
                    <SelectItem value="booking">Booking.com</SelectItem>
                    <SelectItem value="agoda">Agoda</SelectItem>
                    <SelectItem value="expedia">Expedia</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Studio</Label>
                <Select value={studioFilter} onValueChange={setStudioFilter}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Studios</SelectItem>
                    {filteredStudios.map((studio) => (
                      <SelectItem key={studio.id} value={studio.id}>
                        {studio.studio_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Search</Label>
                <Input
                  placeholder="Booking ref, guest, studio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-full text-sm md:text-base"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar Chart */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">
              Booking Chart
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Studios as rows, dates as columns. Click a cell to view booking details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredStudios.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No OTA studios found</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  No studios are allocated for OTA bookings.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full">
                  {/* Header row - dates */}
                  <div className="flex border-b-2 border-border sticky top-0 bg-background z-10">
                    <div className="w-32 md:w-40 flex-shrink-0 border-r border-border p-2 font-semibold text-xs md:text-sm">
                      Studio
                    </div>
                    {daysInMonth.map((day) => (
                      <div
                        key={format(day, "yyyy-MM-dd")}
                        className={cn(
                          "w-12 md:w-16 flex-shrink-0 border-r border-border p-1 text-center",
                          isToday(day) && "bg-primary/10"
                        )}
                      >
                        <div className="text-xs font-medium">{format(day, "EEE")}</div>
                        <div className={cn(
                          "text-xs",
                          isToday(day) && "font-bold text-primary"
                        )}>
                          {format(day, "d")}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Studio rows */}
                  {filteredStudios.map((studio) => (
                    <div key={studio.id} className="flex border-b border-border hover:bg-accent/50 transition-colors">
                      <div className="w-32 md:w-40 flex-shrink-0 border-r border-border p-2 text-xs md:text-sm font-medium">
                        {studio.studio_number}
                      </div>
                      {daysInMonth.map((day) => {
                        const dayBookings = getBookingsForStudioDate(studio.id, day);
                        const isOutOfOrder = isStudioOutOfOrder(studio.id, day);
                        const isTodayDate = isToday(day);

                        return (
                          <div
                            key={format(day, "yyyy-MM-dd")}
                            className={cn(
                              "w-12 md:w-16 flex-shrink-0 border-r border-border p-0.5 relative cursor-pointer",
                              isTodayDate && "bg-primary/5",
                              isOutOfOrder && "bg-red-100 dark:bg-red-900/20"
                            )}
                            onClick={() => handleCellClick(studio.id, day)}
                            title={
                              dayBookings.length > 0
                                ? dayBookings.map((b) => `${b.guest_name} (${b.channel})`).join(", ")
                                : isOutOfOrder
                                ? "Out of Order"
                                : "Available"
                            }
                          >
                            {dayBookings.length > 0 ? (
                              <div className="space-y-0.5 h-full">
{dayBookings.slice(0, 2).map((booking, idx) => (
                                                  <div
                                                    key={booking.id}
                                                    className={cn(
                                                      "h-3 md:h-4 rounded text-[8px] md:text-[10px] flex items-center justify-center font-bold overflow-hidden",
                                                      getChannelColor(booking.channel),
                                                      booking.channel !== "expedia" && "text-white",
                                                      idx === 0 && dayBookings.length > 1 && "border-b border-white/30"
                                                    )}
                                                  >
                                                    {booking.channel === "airbnb" ? "A" : booking.channel === "booking" ? "B" : booking.channel === "agoda" ? "G" : booking.channel === "expedia" ? "E" : "O"}
                                                  </div>
                                                ))}
                                {dayBookings.length > 2 && (
                                  <div className="text-[8px] text-center text-muted-foreground">
                                    +{dayBookings.length - 2}
                                  </div>
                                )}
                              </div>
                            ) : isOutOfOrder ? (
                              <div className="h-full w-full flex items-center justify-center">
                                <AlertTriangle className="h-3 w-3 md:h-4 md:w-4 text-red-600" />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-sm md:text-base font-semibold">Legend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs font-semibold mb-2">Status Colors</div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-500 rounded" />
                    <span>Arriving</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-emerald-500 rounded" />
                    <span>Checked In</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-teal-500 rounded" />
                    <span>In House</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-400 rounded" />
                    <span>Checked Out</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold mb-2">Channel Colors</div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[#FF5A5F] rounded flex items-center justify-center text-white text-[8px] font-bold">A</div>
                    <span>Airbnb</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[#003580] rounded flex items-center justify-center text-white text-[8px] font-bold">B</div>
                    <span>Booking.com</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[#5392F9] rounded flex items-center justify-center text-white text-[8px] font-bold">G</div>
                    <span>Agoda</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[#FFCC00] rounded flex items-center justify-center text-black text-[8px] font-bold">E</div>
                    <span>Expedia</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-500 rounded flex items-center justify-center text-white text-[8px] font-bold">O</div>
                    <span>Other</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold mb-2">Other</div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <span>Out of Order</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-primary/10 rounded border border-primary" />
                    <span>Today</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Details Drawer/Sheet */}
        {selectedBooking && (
          <>
            {isMobile ? (
              <Drawer open={detailsOpen} onOpenChange={(open) => { setDetailsOpen(open); if (!open) setDetailsEditing(false); }}>
                <DrawerContent className="max-h-[96vh]">
                  <DrawerHeader className="text-left">
                    <DrawerTitle>{selectedBooking.guest_name}</DrawerTitle>
                    <DrawerDescription>
                      Booking {selectedBooking.external_ref}
                    </DrawerDescription>
                  </DrawerHeader>
                  <ScrollArea className="flex-1 px-4">
                    <OTABookingDetails
                      booking={selectedBooking}
                      studios={filteredStudios}
                      onClose={() => setDetailsOpen(false)}
                      isEditing={detailsEditing}
                      setIsEditing={setDetailsEditing}
                    />
                  </ScrollArea>
                  <DrawerFooter className="gap-2 flex-wrap">
                    {detailsEditing ? (
                      <Button
                        variant="outline"
                        onClick={() => setDetailsEditing(false)}
                        className="rounded-full"
                      >
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        onClick={() => setDetailsEditing(true)}
                        className="rounded-full"
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit booking
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setDetailsOpen(false)}
                      className="rounded-full"
                    >
                      Close
                    </Button>
                  </DrawerFooter>
                </DrawerContent>
              </Drawer>
            ) : (
              <Sheet open={detailsOpen} onOpenChange={(open) => { setDetailsOpen(open); if (!open) setDetailsEditing(false); }}>
                <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>{selectedBooking.guest_name}</SheetTitle>
                    <SheetDescription>
                      Booking {selectedBooking.external_ref}
                    </SheetDescription>
                  </SheetHeader>
                  <ScrollArea className="flex-1 mt-6">
                    <OTABookingDetails
                      booking={selectedBooking}
                      studios={filteredStudios}
                      onClose={() => setDetailsOpen(false)}
                      isEditing={detailsEditing}
                      setIsEditing={setDetailsEditing}
                    />
                  </ScrollArea>
                  <SheetFooter className="gap-2 flex-wrap">
                    {detailsEditing ? (
                      <Button
                        variant="outline"
                        onClick={() => setDetailsEditing(false)}
                        className="rounded-full"
                      >
                        Cancel
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        onClick={() => setDetailsEditing(true)}
                        className="rounded-full"
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit booking
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={() => setDetailsOpen(false)}
                      className="rounded-full"
                    >
                      Close
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

// Studio type for dropdown
type StudioOption = { id: string; studio_number: string };

// OTA Booking Details Component – view + edit all fields
const OTABookingDetails = ({
  booking,
  studios,
  onClose,
  isEditing,
  setIsEditing,
}: {
  booking: OTABookingWithRelations;
  studios: StudioOption[];
  onClose: () => void;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
}) => {
  const { toast } = useToast();
  const updateBooking = useUpdateOTABooking();
  const [form, setForm] = useState({
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

  useEffect(() => {
    setForm({
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
    setIsEditing(false);
  }, [booking.id]);

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { className: string; label: string }> = {
      arriving: { className: "bg-blue-500 text-white", label: "Arriving" },
      expected_arrivals: { className: "bg-green-500 text-white", label: "Expected Arrivals" },
      pre_check_in: { className: "bg-purple-500 text-white", label: "Pre Check-in" },
      checked_in: { className: "bg-emerald-500 text-white", label: "Checked In" },
      in_house_guest: { className: "bg-teal-500 text-white", label: "In House Guest" },
      day_use: { className: "bg-indigo-500 text-white", label: "Day Use" },
      checked_out: { className: "bg-gray-500 text-white", label: "Checked Out" },
      expected_departures: { className: "bg-orange-500 text-white", label: "Expected Departures" },
      departing: { className: "bg-amber-500 text-white", label: "Departing" },
      no_show: { className: "bg-red-500 text-white", label: "No Show" },
      cancelled: { className: "bg-slate-500 text-white", label: "Cancelled" },
    };
    const config = configs[status] || configs.arriving;
    return (
      <Badge className={`${config.className} rounded-full`}>
        {config.label}
      </Badge>
    );
  };

  const getChannelBadge = (channel: string) => {
    const configs: Record<string, { className: string; label: string }> = {
      airbnb: { className: "bg-[#FF5A5F] text-white", label: "Airbnb" },
      booking: { className: "bg-[#003580] text-white", label: "Booking.com" },
      agoda: { className: "bg-[#5392F9] text-white", label: "Agoda" },
      expedia: { className: "bg-[#FFCC00] text-black", label: "Expedia" },
      other: { className: "bg-gray-500 text-white", label: "Other" },
    };
    const config = configs[channel] || configs.other;
    return (
      <Badge className={`${config.className} rounded-full`}>
        {config.label}
      </Badge>
    );
  };

  const handleSave = async () => {
    try {
      await updateBooking.mutateAsync({
        id: booking.id,
        updates: {
          external_ref: form.external_ref,
          channel: form.channel as "airbnb" | "booking" | "agoda" | "expedia" | "other",
          guest_name: form.guest_name,
          guest_phone: form.guest_phone || null,
          guest_email: form.guest_email || null,
          studio_id: form.studio_id || null,
          check_in: form.check_in,
          check_out: form.check_out,
          status: form.status,
          notes: form.notes || null,
          internal_notes: form.internal_notes || null,
          price_per_night: form.price_per_night ? Number(form.price_per_night) : null,
          commission_amount: form.commission_amount ? Number(form.commission_amount) : null,
          currency: form.currency || "GBP",
        },
      });
      toast({ title: "Booking updated", description: "OTA booking has been saved." });
      setIsEditing(false);
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to update booking",
        variant: "destructive",
      });
    }
  };

  const statusOptions = [
    "arriving", "expected_arrivals", "pre_check_in", "checked_in", "in_house_guest",
    "day_use", "checked_out", "expected_departures", "departing", "no_show", "cancelled",
  ];
  const channelOptions = ["airbnb", "booking", "agoda", "expedia", "other"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {!isEditing ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit booking
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-full"
              disabled={updateBooking.isPending || !form.guest_name.trim() || !form.external_ref.trim()}
              onClick={handleSave}
            >
              {updateBooking.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {isEditing ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Booking reference</Label>
                <Input
                  value={form.external_ref}
                  onChange={(e) => setForm((f) => ({ ...f, external_ref: e.target.value }))}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {channelOptions.map((ch) => (
                      <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Guest name</Label>
                <Input
                  value={form.guest_name}
                  onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value }))}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Guest email</Label>
                <Input
                  type="email"
                  value={form.guest_email}
                  onChange={(e) => setForm((f) => ({ ...f, guest_email: e.target.value }))}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Guest phone</Label>
                <Input
                  value={form.guest_phone}
                  onChange={(e) => setForm((f) => ({ ...f, guest_phone: e.target.value }))}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Studio</Label>
                <Select value={form.studio_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, studio_id: v === "none" ? "" : v }))}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue placeholder="Unallocated" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unallocated</SelectItem>
                    {studios.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.studio_number}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Check-in</Label>
                <Input
                  type="date"
                  value={form.check_in}
                  onChange={(e) => setForm((f) => ({ ...f, check_in: e.target.value }))}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Check-out</Label>
                <Input
                  type="date"
                  value={form.check_out}
                  onChange={(e) => setForm((f) => ({ ...f, check_out: e.target.value }))}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Price per night</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.price_per_night}
                  onChange={(e) => setForm((f) => ({ ...f, price_per_night: e.target.value }))}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Commission amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.commission_amount}
                  onChange={(e) => setForm((f) => ({ ...f, commission_amount: e.target.value }))}
                  className="rounded-full"
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                  className="rounded-full"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Guest-facing notes"
                className="rounded-2xl min-h-[80px] resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Internal notes</Label>
              <Textarea
                value={form.internal_notes}
                onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
                placeholder="Internal only"
                className="rounded-2xl min-h-[80px] resize-none"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
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
              {(booking.guest_email || booking.guest_phone) && (
                <>
                  {booking.guest_email && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Email</Label>
                      <div className="mt-1 text-sm">{booking.guest_email}</div>
                    </div>
                  )}
                  {booking.guest_phone && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Phone</Label>
                      <div className="mt-1 text-sm">{booking.guest_phone}</div>
                    </div>
                  )}
                </>
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
                <div className="mt-1 text-sm">{format(parseISO(booking.check_in), "MMM d, yyyy")}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Check-out</Label>
                <div className="mt-1 text-sm">{format(parseISO(booking.check_out), "MMM d, yyyy")}</div>
              </div>
              {(booking.price_per_night != null || booking.commission_amount != null) && (
                <>
                  {booking.price_per_night != null && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Price per night</Label>
                      <div className="mt-1 text-sm">{booking.currency} {Number(booking.price_per_night).toFixed(2)}</div>
                    </div>
                  )}
                  {booking.commission_amount != null && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Commission</Label>
                      <div className="mt-1 text-sm">{booking.currency} {Number(booking.commission_amount).toFixed(2)}</div>
                    </div>
                  )}
                </>
              )}
            </div>
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
          </>
        )}
      </div>
    </div>
  );
};

export default OTABookingChartPage;

