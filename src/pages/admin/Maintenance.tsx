import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { useMaintenanceRequests, useUpdateMaintenanceRequest } from "@/hooks/useMaintenanceRequests";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { Wrench, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, ExternalLink, Filter, Plus, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AcademicYearSelector } from "@/components/admin/AcademicYearSelector";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MaintenanceImagePreview } from "@/components/MaintenanceImagePreview";

// Component to display maintenance images with signed URLs (clickable thumbnails)
const MaintenanceImage = ({ 
  imagePath, 
  index, 
  onClick 
}: { 
  imagePath: string; 
  index: number;
  onClick: () => void;
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      try {
        const { data, error } = await supabase.storage
          .from("maintenance-images")
          .createSignedUrl(imagePath, 3600);

        if (error) throw error;
        if (data?.signedUrl) {
          setImageUrl(data.signedUrl);
        }
      } catch (error) {
        console.error("Error fetching signed URL:", error);
        // Fallback to public URL
        const { data } = supabase.storage
          .from("maintenance-images")
          .getPublicUrl(imagePath);
        setImageUrl(data.publicUrl);
      } finally {
        setLoading(false);
      }
    };

    fetchSignedUrl();
  }, [imagePath]);

  return (
    <button
      onClick={onClick}
      className="relative w-20 h-20 rounded-lg overflow-hidden border border-border/60 hover:ring-2 hover:ring-primary transition-all cursor-pointer"
    >
      {loading ? (
        <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : imageUrl ? (
        <img
          src={imageUrl}
          alt={`Request image ${index + 1}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            console.error("Error loading image:", imagePath);
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted text-muted-foreground text-xs">
          Error
        </div>
      )}
    </button>
  );
};

const Maintenance = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [academicYearFilter, setAcademicYearFilter] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateData, setUpdateData] = useState({
    status: "pending" as "pending" | "in_progress" | "resolved" | "cancelled",
    priority: "normal" as "low" | "normal" | "high" | "urgent",
    resolution_notes: "",
  });
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | undefined>(undefined);

  const { data: requests, isLoading } = useMaintenanceRequests();
  const updateRequest = useUpdateMaintenanceRequest();

  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    let filtered = requests;

    if (statusFilter !== "all") {
      filtered = filtered.filter((req) => req.status === statusFilter);
    }
    if (priorityFilter !== "all") {
      filtered = filtered.filter((req) => req.priority === priorityFilter);
    }
    if (typeFilter !== "all") {
      filtered = filtered.filter((req) => req.request_type === typeFilter);
    }
    if (academicYearFilter) {
      filtered = filtered.filter((req) => req.academic_year_id === academicYearFilter);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (req) =>
          req.title.toLowerCase().includes(query) ||
          req.description.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [requests, statusFilter, priorityFilter, typeFilter, academicYearFilter, searchQuery]);

  const stats = useMemo(() => {
    if (!requests) return { total: 0, pending: 0, in_progress: 0, resolved: 0, urgent: 0 };
    return {
      total: requests.length,
      pending: requests.filter((r) => r.status === "pending").length,
      in_progress: requests.filter((r) => r.status === "in_progress").length,
      resolved: requests.filter((r) => r.status === "resolved").length,
      urgent: requests.filter((r) => r.priority === "urgent").length,
    };
  }, [requests]);

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { className: string; icon: typeof Clock; label: string }> = {
      pending: {
        className: "bg-yellow-500 hover:bg-yellow-600 text-white",
        icon: Clock,
        label: "Pending",
      },
      in_progress: {
        className: "bg-blue-500 hover:bg-blue-600 text-white",
        icon: Loader2,
        label: "In Progress",
      },
      resolved: {
        className: "bg-green-500 hover:bg-green-600 text-white",
        icon: CheckCircle2,
        label: "Resolved",
      },
      cancelled: {
        className: "bg-gray-500 hover:bg-gray-600 text-white",
        icon: XCircle,
        label: "Cancelled",
      },
    };

    const config = configs[status] || configs.pending;
    const Icon = config.icon;

    return (
      <Badge className={`uppercase ${config.className} rounded-full px-2 py-0.5 md:px-2.5 text-[10px] md:text-xs font-medium flex items-center gap-1`}>
        <Icon className="h-2.5 w-2.5 md:h-3 md:w-3" />
        {config.label}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const configs: Record<string, { className: string; label: string }> = {
      low: { className: "bg-gray-500 hover:bg-gray-600 text-white", label: "Low" },
      normal: { className: "bg-blue-500 hover:bg-blue-600 text-white", label: "Normal" },
      high: { className: "bg-orange-500 hover:bg-orange-600 text-white", label: "High" },
      urgent: { className: "bg-red-500 hover:bg-red-600 text-white", label: "Urgent" },
    };

    const config = configs[priority] || configs.normal;

    return (
      <Badge className={`uppercase ${config.className} rounded-full px-2 py-0.5 md:px-2.5 text-[10px] md:text-xs font-medium`}>
        {config.label}
      </Badge>
    );
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      maintenance: "Maintenance",
      cleaning: "Cleaning",
      general: "General",
      other: "Other",
    };
    return labels[type] || type;
  };

  const handleUpdateRequest = async () => {
    if (!selectedRequest) return;

    try {
      const updates: any = {
        status: updateData.status,
        priority: updateData.priority,
      };

      if (updateData.status === "resolved") {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = (await supabase.auth.getUser()).data.user?.id;
        if (updateData.resolution_notes.trim()) {
          updates.resolution_notes = updateData.resolution_notes.trim();
        }
      } else {
        updates.resolved_at = null;
        updates.resolved_by = null;
        if (updateData.status !== "resolved") {
          updates.resolution_notes = null;
        }
      }

      await updateRequest.mutateAsync({
        id: selectedRequest,
        updates,
      });

      toast({
        title: "Request updated",
        description: "The maintenance request has been updated successfully.",
      });

      setUpdateDialogOpen(false);
      setSelectedRequest(null);
      setUpdateData({
        status: "pending",
        priority: "normal",
        resolution_notes: "",
      });
    } catch (error: any) {
      console.error("Error updating request:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update request. Please try again.",
      });
    }
  };

  const openUpdateDialog = (requestId: string) => {
    const request = requests?.find((r) => r.id === requestId);
    if (!request) return;

    setSelectedRequest(requestId);
    setUpdateData({
      status: request.status as any,
      priority: request.priority as any,
      resolution_notes: request.resolution_notes || "",
    });
    setUpdateDialogOpen(true);
  };

  const MaintenanceSkeleton = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
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
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </CardContent>
      </Card>
    </div>
  );

  if (isLoading) {
    return (
      <AdminLayout pageTitle="Maintenance Requests" subtitle="Manage student maintenance requests">
        <MaintenanceSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout pageTitle="Maintenance Requests" subtitle="Manage all student maintenance requests">
      <div className="space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Total Requests</div>
              <div className="text-xl md:text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Pending</div>
              <div className="text-xl md:text-2xl font-bold text-yellow-600">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">In Progress</div>
              <div className="text-xl md:text-2xl font-bold text-blue-600">{stats.in_progress}</div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="p-4 md:p-6">
              <div className="text-xs md:text-sm text-muted-foreground mb-1">Urgent</div>
              <div className="text-xl md:text-2xl font-bold text-red-600">{stats.urgent}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg font-display font-bold uppercase tracking-wide">
              <Filter className="h-4 w-4 md:h-5 md:w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Search</Label>
                <Input
                  placeholder="Search requests..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-full text-sm md:text-base"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Priority</Label>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="rounded-full text-sm md:text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Type</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="rounded-full text-sm md:text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs md:text-sm">Academic Year</Label>
                <AcademicYearSelector
                  value={academicYearFilter}
                  onValueChange={setAcademicYearFilter}
                  allowEmpty
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requests List */}
        <Card className="rounded-3xl border border-border/60 shadow-xl">
          <CardHeader>
            <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">All Requests</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {filteredRequests.length} request{filteredRequests.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredRequests.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No requests found</h3>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {searchQuery || statusFilter !== "all" || priorityFilter !== "all" || typeFilter !== "all"
                    ? "Try adjusting your filters."
                    : "No maintenance requests have been submitted yet."}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop: Table with Accordion */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs md:text-sm">Title</TableHead>
                        <TableHead className="text-xs md:text-sm">Status</TableHead>
                        <TableHead className="text-xs md:text-sm">Priority</TableHead>
                        <TableHead className="text-xs md:text-sm">Type</TableHead>
                        <TableHead className="text-xs md:text-sm">Created</TableHead>
                        <TableHead className="text-xs md:text-sm">Actions</TableHead>
                        <TableHead className="text-xs md:text-sm w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <Accordion 
                        type="single" 
                        collapsible 
                        className="w-full"
                        value={expandedRow}
                        onValueChange={setExpandedRow}
                      >
                        {filteredRequests.map((request) => {
                          const isOpen = expandedRow === request.id;
                          return (
                            <AccordionItem key={request.id} value={request.id} className="border-b">
                              <AccordionTrigger className="hidden" />
                              <TableRow 
                                className="hover:bg-accent/50 cursor-pointer [&>td]:py-4"
                                onClick={() => setExpandedRow(isOpen ? undefined : request.id)}
                              >
                                <TableCell className="align-middle">
                                  <div className="font-semibold text-sm">{request.title}</div>
                                  <div className="text-xs text-muted-foreground line-clamp-1 mt-1">
                                    {request.description}
                                  </div>
                                </TableCell>
                                <TableCell className="align-middle">{getStatusBadge(request.status)}</TableCell>
                                <TableCell className="align-middle">{getPriorityBadge(request.priority)}</TableCell>
                                <TableCell className="align-middle">
                                  <Badge variant="outline" className="rounded-full text-xs">
                                    {getTypeLabel(request.request_type)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="align-middle text-xs text-muted-foreground">
                                  {format(new Date(request.created_at), "MMM d, yyyy")}
                                </TableCell>
                                <TableCell className="align-middle">
                                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    {request.application && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(`/admin/applications/${request.application?.id}`);
                                        }}
                                        className="rounded-full gap-2 text-xs h-7 px-2"
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openUpdateDialog(request.id);
                                      }}
                                      className="rounded-full uppercase tracking-wide gap-2 text-xs h-7 px-2"
                                    >
                                      Update
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell className="align-middle w-[60px]">
                                  <Plus className={`h-4 w-4 shrink-0 transition-transform duration-200 mx-auto ${isOpen ? 'rotate-45' : ''}`} />
                                </TableCell>
                              </TableRow>
                            <AccordionContent asChild>
                              <TableRow>
                                <TableCell colSpan={7} className="p-4">
                                  <div className="space-y-4">
                                    <div>
                                      <h4 className="text-xs font-semibold mb-2">Description</h4>
                                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                        {request.description}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                      {request.studio && (
                                        <Badge variant="outline" className="rounded-full text-xs">
                                          Studio {request.studio.studio_number}
                                        </Badge>
                                      )}
                                      {request.academic_year && (
                                        <Badge variant="outline" className="rounded-full text-xs">
                                          {request.academic_year.name}
                                        </Badge>
                                      )}
                                      <span>Created {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
                                      {request.updated_at !== request.created_at && (
                                        <span>Updated {format(new Date(request.updated_at), "MMM d, yyyy 'at' h:mm a")}</span>
                                      )}
                                      {request.resolved_at && (
                                        <span className="text-green-600">
                                          Resolved {format(new Date(request.resolved_at), "MMM d, yyyy")}
                                        </span>
                                      )}
                                    </div>
                                    {request.images && request.images.length > 0 && (
                                      <div>
                                        <h4 className="text-xs font-semibold mb-2">Images</h4>
                                        <div className="flex flex-wrap gap-2">
                                          {request.images.map((imagePath, idx) => (
                                            <MaintenanceImage
                                              key={idx}
                                              imagePath={imagePath}
                                              index={idx}
                                              onClick={() => {
                                                setPreviewImages(request.images || []);
                                                setPreviewIndex(idx);
                                                setPreviewOpen(true);
                                              }}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {request.resolution_notes && (
                                      <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                                        <p className="text-xs font-medium text-green-900 dark:text-green-100 mb-1">
                                          Resolution Notes:
                                        </p>
                                        <p className="text-xs text-green-800 dark:text-green-200 whitespace-pre-wrap">
                                          {request.resolution_notes}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                      </Accordion>
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile: Cards */}
                <div className="md:hidden space-y-4">
                  {filteredRequests.map((request) => (
                    <Card key={request.id} className="rounded-2xl border border-border/60">
                      <CardContent className="p-4">
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={request.id} className="border-0">
                            <AccordionTrigger className="hover:no-underline py-2">
                              <div className="flex-1 text-left space-y-2">
                                <h3 className="text-sm font-semibold">{request.title}</h3>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {request.description}
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                  {getStatusBadge(request.status)}
                                  {getPriorityBadge(request.priority)}
                                  <Badge variant="outline" className="rounded-full text-xs">
                                    {getTypeLabel(request.request_type)}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {format(new Date(request.created_at), "MMM d, yyyy")}
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pt-4 space-y-4">
                              <div>
                                <h4 className="text-xs font-semibold mb-2">Description</h4>
                                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                  {request.description}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {request.studio && (
                                  <Badge variant="outline" className="rounded-full text-xs">
                                    Studio {request.studio.studio_number}
                                  </Badge>
                                )}
                                {request.academic_year && (
                                  <Badge variant="outline" className="rounded-full text-xs">
                                    {request.academic_year.name}
                                  </Badge>
                                )}
                                <span>Created {format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
                                {request.updated_at !== request.created_at && (
                                  <span>Updated {format(new Date(request.updated_at), "MMM d, yyyy 'at' h:mm a")}</span>
                                )}
                                {request.resolved_at && (
                                  <span className="text-green-600">
                                    Resolved {format(new Date(request.resolved_at), "MMM d, yyyy")}
                                  </span>
                                )}
                              </div>
                              {request.images && request.images.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-semibold mb-2">Images</h4>
                                  <div className="flex flex-wrap gap-2">
                                    {request.images.map((imagePath, idx) => (
                                      <MaintenanceImage
                                        key={idx}
                                        imagePath={imagePath}
                                        index={idx}
                                        onClick={() => {
                                          setPreviewImages(request.images || []);
                                          setPreviewIndex(idx);
                                          setPreviewOpen(true);
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                              {request.resolution_notes && (
                                <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                                  <p className="text-xs font-medium text-green-900 dark:text-green-100 mb-1">
                                    Resolution Notes:
                                  </p>
                                  <p className="text-xs text-green-800 dark:text-green-200 whitespace-pre-wrap">
                                    {request.resolution_notes}
                                  </p>
                                </div>
                              )}
                              <div className="flex flex-col gap-2 pt-2">
                                {request.application && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate(`/admin/applications/${request.application?.id}`)}
                                    className="rounded-full gap-2 text-xs w-full"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    View Application
                                  </Button>
                                )}
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => openUpdateDialog(request.id)}
                                  className="rounded-full uppercase tracking-wide gap-2 text-xs w-full"
                                >
                                  Update
                                </Button>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Update Request Dialog */}
        <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
          <DialogContent className="sm:max-w-[500px] rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Update Maintenance Request</DialogTitle>
              <DialogDescription className="text-xs md:text-sm">
                Update the status, priority, and resolution notes for this request.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="update_status" className="text-xs md:text-sm">Status *</Label>
                <Select
                  value={updateData.status}
                  onValueChange={(value: "pending" | "in_progress" | "resolved" | "cancelled") =>
                    setUpdateData((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger id="update_status" className="rounded-full text-sm md:text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="update_priority" className="text-xs md:text-sm">Priority *</Label>
                <Select
                  value={updateData.priority}
                  onValueChange={(value: "low" | "normal" | "high" | "urgent") =>
                    setUpdateData((prev) => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger id="update_priority" className="rounded-full text-sm md:text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {updateData.status === "resolved" && (
                <div className="space-y-2">
                  <Label htmlFor="resolution_notes" className="text-xs md:text-sm">Resolution Notes (Optional)</Label>
                  <Textarea
                    id="resolution_notes"
                    value={updateData.resolution_notes}
                    onChange={(e) => setUpdateData((prev) => ({ ...prev, resolution_notes: e.target.value }))}
                    placeholder="Add notes about how this request was resolved..."
                    rows={4}
                    className="rounded-2xl text-sm md:text-base"
                  />
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setUpdateDialogOpen(false)}
                className="rounded-full text-xs md:text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateRequest}
                disabled={updateRequest.isPending}
                className="rounded-full uppercase tracking-wide gap-2 text-xs md:text-sm"
              >
                {updateRequest.isPending ? (
                  <>
                    <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Request"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Image Preview Modal */}
        <MaintenanceImagePreview
          images={previewImages}
          initialIndex={previewIndex}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      </div>
    </AdminLayout>
  );
};

export default Maintenance;

