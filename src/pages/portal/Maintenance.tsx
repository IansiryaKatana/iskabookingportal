import { useState, useMemo, useEffect } from "react";
import { Wrench, Plus, Clock, CheckCircle2, XCircle, AlertCircle, Loader2, Image as ImageIcon, X, Minus } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useMaintenanceRequests, useCreateMaintenanceRequest } from "@/hooks/useMaintenanceRequests";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentApplicationsList } from "@/hooks/useStudentApplications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { getPriorityInfoFromUrgency } from "@/utils/maintenancePriority";

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
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uploadingImages, setUploadingImages] = useState<string[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | undefined>(undefined);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data: requests, isLoading } = useMaintenanceRequests(user?.id);
  const { data: applications } = useStudentApplicationsList(user?.id);
  const createRequest = useCreateMaintenanceRequest();

  // Get confirmed application for auto-linking
  const confirmedApplication = useMemo(
    () => applications?.find((app) => app.status === "confirmed") || null,
    [applications],
  );

  // Form state
  const [formData, setFormData] = useState({
    request_type: "maintenance" as "maintenance" | "cleaning" | "general" | "other",
    // New, more specific category field used by the maintenance workflow.
    // Default to "other" so requests are still valid if the student doesn't change it.
    category: "other" as
      | "plumbing"
      | "electrical"
      | "internet_wifi"
      | "furniture"
      | "appliance"
      | "hvac"
      | "bathroom"
      | "kitchen"
      | "other",
    title: "",
    description: "",
    // urgency replaces the legacy priority concept used in admin dashboards and SLA logic
    urgency: "medium" as "low" | "medium" | "high" | "emergency",
  });

  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    if (statusFilter === "all") return requests;
    return requests.filter((req) => req.status === statusFilter);
  }, [requests, statusFilter]);

  const handleRowClick = (request: any) => {
    setSelectedRequest(request);
    setDetailsOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { className: string; icon: typeof Clock; label: string }> = {
      // Legacy + new workflow statuses (match admin dashboards so students see the same language)
      pending: {
        className: "bg-yellow-500 hover:bg-yellow-600 text-white",
        icon: Clock,
        label: "Pending",
      },
      new: {
        className: "bg-blue-500 hover:bg-blue-600 text-white",
        icon: Clock,
        label: "New",
      },
      triaged: {
        className: "bg-purple-500 hover:bg-purple-600 text-white",
        icon: AlertCircle,
        label: "Triaged",
      },
      assigned: {
        className: "bg-indigo-500 hover:bg-indigo-600 text-white",
        icon: Loader2,
        label: "Assigned",
      },
      in_progress: {
        className: "bg-blue-500 hover:bg-blue-600 text-white",
        icon: Loader2,
        label: "In Progress",
      },
      completed_pending_approval: {
        className: "bg-orange-500 hover:bg-orange-600 text-white",
        icon: Clock,
        label: "Pending Approval",
      },
      resolved: {
        className: "bg-green-500 hover:bg-green-600 text-white",
        icon: CheckCircle2,
        label: "Resolved",
      },
      rework_required: {
        className: "bg-red-500 hover:bg-red-600 text-white",
        icon: AlertCircle,
        label: "Rework Required",
      },
      cancelled: {
        className: "bg-gray-500 hover:bg-gray-600 text-white",
        icon: XCircle,
        label: "Cancelled",
      },
    };

    // Treat "new" and "pending" as equivalent in the student view for older data
    const normalizedStatus = status === "new" ? "new" : status;
    const config = configs[normalizedStatus] || configs.pending;
    const Icon = config.icon;

    return (
      <Badge className={`uppercase ${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getPriorityBadge = (urgency: "low" | "medium" | "high" | "emergency") => {
    const info = getPriorityInfoFromUrgency(urgency);

    const colorByBand: Record<string, { className: string }> = {
      P1: { className: "bg-red-500 hover:bg-red-600 text-white" },
      P2: { className: "bg-orange-500 hover:bg-orange-600 text-white" },
      P3: { className: "bg-blue-500 hover:bg-blue-600 text-white" },
    };

    const config = colorByBand[info.band] || colorByBand.P3;

    return (
      <Badge className={`uppercase ${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium flex flex-col items-start`}>
        <span>{info.label}</span>
        <span className="normal-case text-[10px] opacity-90">
          {info.targetWindowLabel}
        </span>
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Limit to 5 images
    const remainingSlots = 5 - imageFiles.length;
    const filesToAdd = files.slice(0, remainingSlots);

    filesToAdd.forEach((file) => {
      if (!file.type.startsWith("image/")) {
        toast({
          variant: "destructive",
          title: "Invalid file type",
          description: "Please upload image files only.",
        });
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "File too large",
          description: "Please upload images smaller than 5MB.",
        });
        return;
      }

      const preview = URL.createObjectURL(file);
      setImagePreviews((prev) => [...prev, preview]);
      setImageFiles((prev) => [...prev, file]);
    });

    e.target.value = "";
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please sign in to submit a request.",
      });
      return;
    }

    if (!formData.title.trim() || !formData.description.trim()) {
      toast({
        variant: "destructive",
        title: "Validation error",
        description: "Please fill in all required fields.",
      });
      return;
    }

    try {
      // Upload images first using user ID (will be moved to request ID after creation)
      const imagePaths: string[] = [];
      setUploadingImages(["uploading"]);

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const extension = file.name.split(".").pop() || "jpg";
        // Use user ID for initial upload - will be associated with request after creation
        const path = `${user.id}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("maintenance-images")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error("Image upload error:", uploadError);
          toast({
            variant: "destructive",
            title: "Upload failed",
            description: `Failed to upload ${file.name}. Please try again.`,
          });
          setUploadingImages([]);
          return;
        }

        imagePaths.push(path);
      }

      setUploadingImages([]);

      // Create request with image paths
      await createRequest.mutateAsync({
        student_id: user.id,
        application_id: confirmedApplication?.id,
        studio_id: confirmedApplication?.assigned_studio_id || undefined,
        request_type: formData.request_type,
        category: formData.category,
        title: formData.title.trim(),
        description: formData.description.trim(),
        urgency: formData.urgency,
        images: imagePaths.length > 0 ? imagePaths : undefined,
        academic_year_id: confirmedApplication?.contract?.academic_year_id || undefined,
      });

      toast({
        title: "Request submitted",
        description: "Your maintenance request has been submitted successfully.",
      });

      // Reset form
      setFormData({
        request_type: "maintenance",
        category: "other",
        title: "",
        description: "",
        urgency: "medium",
      });
      // Clean up preview URLs
      imagePreviews.forEach((url) => URL.revokeObjectURL(url));
      setImagePreviews([]);
      setImageFiles([]);
      setCreateDialogOpen(false);
    } catch (error: any) {
      console.error("Error creating request:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to submit request. Please try again.",
      });
      setUploadingImages([]);
    }
  };

  const MaintenanceSkeleton = () => (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-border/60 p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-6 w-64" />
                  <div className="flex flex-wrap items-center gap-4">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );

  if (isLoading) {
    return (
      <PortalLayout>
        <MaintenanceSkeleton />
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      mobileHeaderActions={
        <Button
          onClick={() => setCreateDialogOpen(true)}
          size="sm"
          className="rounded-full h-9 w-9 p-0 bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Maintenance Requests</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Submit and track maintenance, cleaning, and general requests
            </p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="rounded-full uppercase tracking-wide gap-2 hidden md:flex"
          >
            <Plus className="h-4 w-4" />
            New Request
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] rounded-full">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed_pending_approval">Pending Approval</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="rework_required">Rework Required</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Requests List */}
        {filteredRequests.length === 0 ? (
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Wrench className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-base md:text-lg font-semibold mb-2">No requests found</h3>
              <p className="text-sm text-muted-foreground text-center mb-4">
                {statusFilter === "all"
                  ? "You haven't submitted any maintenance requests yet."
                  : `No requests with status "${statusFilter}".`}
              </p>
              <Button
                onClick={() => setCreateDialogOpen(true)}
                className="rounded-full uppercase tracking-wide gap-2"
              >
                <Plus className="h-4 w-4" />
                Create First Request
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-3xl border border-border/60 shadow-xl">
            <CardHeader>
              <CardTitle className="text-base md:text-lg font-display font-bold uppercase tracking-wide">Your Requests</CardTitle>
              <CardDescription className="text-xs md:text-sm">
                {filteredRequests.length} request{filteredRequests.length !== 1 ? "s" : ""} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Desktop: Clean table - click row to open details */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs md:text-sm text-left">Title</TableHead>
                      <TableHead className="text-xs md:text-sm text-center">Status</TableHead>
                      <TableHead className="text-xs md:text-sm text-center">Priority</TableHead>
                      <TableHead className="text-xs md:text-sm text-center">Type</TableHead>
                      <TableHead className="text-xs md:text-sm text-right">Created</TableHead>
                      <TableHead className="text-xs md:text-sm w-[60px] text-center"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRequests.map((request) => (
                      <TableRow
                        key={request.id}
                        className="hover:bg-accent/50 cursor-pointer [&>td]:py-4"
                        onClick={() => handleRowClick(request)}
                      >
                        <TableCell className="align-middle text-left">
                          <div className="font-semibold text-sm">{request.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1 mt-1">
                            {request.description}
                          </div>
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          {getStatusBadge(request.status)}
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          {getPriorityBadge(
                            (request.urgency || "medium") as
                              | "low"
                              | "medium"
                              | "high"
                              | "emergency"
                          )}
                        </TableCell>
                        <TableCell className="align-middle text-center">
                          <Badge variant="outline" className="rounded-full text-xs">
                            {getTypeLabel(request.request_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="align-middle text-right text-xs text-muted-foreground">
                          {format(new Date(request.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="align-middle text-center w-[60px]">
                          <Plus className="h-4 w-4 shrink-0 mx-auto" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile: Cards - tap to open details */}
              <div className="md:hidden space-y-4">
                {filteredRequests.map((request) => (
                  <Card
                    key={request.id}
                    className="rounded-2xl border border-border/60 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleRowClick(request)}
                  >
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="text-sm font-semibold mb-1">{request.title}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {request.description}
                            </p>
                          </div>
                          {getStatusBadge(request.status)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {getPriorityBadge(
                            (request.urgency || "medium") as
                              | "low"
                              | "medium"
                              | "high"
                              | "emergency"
                          )}
                          <Badge variant="outline" className="rounded-full text-xs">
                            {getTypeLabel(request.request_type)}
                          </Badge>
                          {request.studio && (
                            <Badge variant="outline" className="rounded-full text-xs">
                              Studio {request.studio.studio_number}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(request.created_at), "MMM d, yyyy")}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create Request Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-[600px] rounded-3xl">
            <DialogHeader>
              <DialogTitle>Create Maintenance Request</DialogTitle>
              <DialogDescription>
                Submit a new maintenance, cleaning, or general request. Our team will review it shortly.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="request_type">Request Type *</Label>
                <Select
                  value={formData.request_type}
                  onValueChange={(value: "maintenance" | "cleaning" | "general" | "other") =>
                    setFormData((prev) => ({ ...prev, request_type: value }))
                  }
                >
                  <SelectTrigger id="request_type" className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="cleaning">Cleaning</SelectItem>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Maintenance Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(
                    value:
                      | "plumbing"
                      | "electrical"
                      | "internet_wifi"
                      | "furniture"
                      | "appliance"
                      | "hvac"
                      | "bathroom"
                      | "kitchen"
                      | "other"
                  ) => setFormData((prev) => ({ ...prev, category: value }))}
                >
                  <SelectTrigger id="category" className="rounded-full">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plumbing">Plumbing</SelectItem>
                    <SelectItem value="electrical">Electrical</SelectItem>
                    <SelectItem value="internet_wifi">Internet / WiFi</SelectItem>
                    <SelectItem value="furniture">Furniture</SelectItem>
                    <SelectItem value="appliance">Appliance</SelectItem>
                    <SelectItem value="hvac">Heating / Cooling (HVAC)</SelectItem>
                    <SelectItem value="bathroom">Bathroom</SelectItem>
                    <SelectItem value="kitchen">Kitchen</SelectItem>
                    <SelectItem value="other">Other / Not Listed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Brief description of the issue"
                  className="rounded-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Provide detailed information about your request..."
                  rows={4}
                  className="rounded-2xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="urgency">Urgency / Priority</Label>
                <Select
                  value={formData.urgency}
                  onValueChange={(value: "low" | "medium" | "high" | "emergency") =>
                    setFormData((prev) => ({ ...prev, urgency: value }))
                  }
                >
                  <SelectTrigger id="urgency" className="rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">
                      Low – Priority 3 (Non‑urgent, 28 days)
                    </SelectItem>
                    <SelectItem value="medium">
                      Medium – Priority 3 (Non‑urgent, 28 days)
                    </SelectItem>
                    <SelectItem value="high">
                      High – Priority 2 (Urgent, 5 working days)
                    </SelectItem>
                    <SelectItem value="emergency">
                      Emergency – Priority 1 (24 hours)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  We categorise requests into Priority 1 (emergency, 24 hours),
                  Priority 2 (urgent, 5 working days) and Priority 3
                  (non‑urgent, 28 days) based on the urgency you select.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="images">Images (Optional, max 5)</Label>
                <div className="space-y-3">
                  {imagePreviews.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {imagePreviews.map((preview, idx) => (
                        preview ? (
                          <div key={idx} className="relative w-24 h-24 rounded-lg overflow-hidden border border-border/60">
                            <img
                              src={preview}
                              alt={`Preview ${idx + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                console.error("Error loading preview image:", idx);
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(idx)}
                              className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 z-10"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : null
                      ))}
                    </div>
                  )}
                  {imageFiles.length < 5 && (
                    <div>
                      <input
                        id="images"
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full rounded-full gap-2"
                        onClick={() => {
                          const input = document.getElementById("images") as HTMLInputElement;
                          if (input) {
                            input.click();
                          }
                        }}
                      >
                        <ImageIcon className="h-4 w-4" />
                        {imageFiles.length === 0 ? "Add Images" : `Add More (${5 - imageFiles.length} remaining)`}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {confirmedApplication && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-900">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    This request will be linked to your confirmed application and studio.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={createRequest.isPending || uploadingImages.length > 0}
                className="rounded-full uppercase tracking-wide gap-2"
              >
                {createRequest.isPending || uploadingImages.length > 0 ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Submit Request
                  </>
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

        {/* Details Drawer / Sheet - read-only, matches admin UX */}
        {selectedRequest && (
          <>
            {isMobile ? (
              <Drawer open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DrawerContent className="max-h-[96vh]">
                  <DrawerHeader className="text-left">
                    <DrawerTitle>{selectedRequest.title}</DrawerTitle>
                    <DrawerDescription>
                      Maintenance request details
                    </DrawerDescription>
                  </DrawerHeader>
                  <ScrollArea className="flex-1 px-4">
                    <div className="space-y-6 py-4">
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Priority
                          </Label>
                          <div className="mt-1">
                            {getPriorityBadge(
                              (selectedRequest.urgency || "medium") as
                                | "low"
                                | "medium"
                                | "high"
                                | "emergency"
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">Type</Label>
                            <div className="mt-1">
                              <Badge variant="outline" className="rounded-full text-xs">
                                {getTypeLabel(selectedRequest.request_type)}
                              </Badge>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Studio</Label>
                            <div className="mt-1 text-sm">
                              {selectedRequest.studio ? (
                                <span className="font-medium">
                                  Studio {selectedRequest.studio.studio_number}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Not linked</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <p className="text-sm mt-1 whitespace-pre-wrap">
                          {selectedRequest.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          Created{" "}
                          {format(
                            new Date(selectedRequest.created_at),
                            "MMM d, yyyy 'at' h:mm a",
                          )}
                        </span>
                        {selectedRequest.updated_at !== selectedRequest.created_at && (
                          <span>
                            Updated{" "}
                            {format(
                              new Date(selectedRequest.updated_at),
                              "MMM d, yyyy 'at' h:mm a",
                            )}
                          </span>
                        )}
                        {selectedRequest.resolved_at && (
                          <span className="text-green-600">
                            Resolved{" "}
                            {format(
                              new Date(selectedRequest.resolved_at),
                              "MMM d, yyyy 'at' h:mm a",
                            )}
                          </span>
                        )}
                      </div>

                      {selectedRequest.images && selectedRequest.images.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">
                            Images
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {selectedRequest.images.map((imagePath: string, idx: number) => (
                              <MaintenanceImage
                                key={idx}
                                imagePath={imagePath}
                                index={idx}
                                onClick={() => {
                                  setPreviewImages(selectedRequest.images || []);
                                  setPreviewIndex(idx);
                                  setPreviewOpen(true);
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedRequest.resolution_notes && (
                        <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                          <p className="text-xs font-medium text-green-900 dark:text-green-100 mb-1">
                            Resolution Notes
                          </p>
                          <p className="text-xs text-green-800 dark:text-green-200 whitespace-pre-wrap">
                            {selectedRequest.resolution_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                  <DrawerFooter className="gap-2">
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
              <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
                <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>{selectedRequest.title}</SheetTitle>
                    <SheetDescription>
                      Maintenance request details
                    </SheetDescription>
                  </SheetHeader>
                  <ScrollArea className="flex-1 mt-6">
                    <div className="space-y-6 pb-6">
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">
                            Priority
                          </Label>
                          <div className="mt-1">
                            {getPriorityBadge(
                              (selectedRequest.urgency || "medium") as
                                | "low"
                                | "medium"
                                | "high"
                                | "emergency"
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs text-muted-foreground">Type</Label>
                            <div className="mt-1">
                              <Badge variant="outline" className="rounded-full text-xs">
                                {getTypeLabel(selectedRequest.request_type)}
                              </Badge>
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Studio</Label>
                            <div className="mt-1 text-sm">
                              {selectedRequest.studio ? (
                                <span className="font-medium">
                                  Studio {selectedRequest.studio.studio_number}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Not linked</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <p className="text-sm mt-1 whitespace-pre-wrap">
                          {selectedRequest.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          Created{" "}
                          {format(
                            new Date(selectedRequest.created_at),
                            "MMM d, yyyy 'at' h:mm a",
                          )}
                        </span>
                        {selectedRequest.updated_at !== selectedRequest.created_at && (
                          <span>
                            Updated{" "}
                            {format(
                              new Date(selectedRequest.updated_at),
                              "MMM d, yyyy 'at' h:mm a",
                            )}
                          </span>
                        )}
                        {selectedRequest.resolved_at && (
                          <span className="text-green-600">
                            Resolved{" "}
                            {format(
                              new Date(selectedRequest.resolved_at),
                              "MMM d, yyyy 'at' h:mm a",
                            )}
                          </span>
                        )}
                      </div>

                      {selectedRequest.images && selectedRequest.images.length > 0 && (
                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">
                            Images
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {selectedRequest.images.map((imagePath: string, idx: number) => (
                              <MaintenanceImage
                                key={idx}
                                imagePath={imagePath}
                                index={idx}
                                onClick={() => {
                                  setPreviewImages(selectedRequest.images || []);
                                  setPreviewIndex(idx);
                                  setPreviewOpen(true);
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedRequest.resolution_notes && (
                        <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                          <p className="text-xs font-medium text-green-900 dark:text-green-100 mb-1">
                            Resolution Notes
                          </p>
                          <p className="text-xs text-green-800 dark:text-green-200 whitespace-pre-wrap">
                            {selectedRequest.resolution_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                  <SheetFooter>
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
    </PortalLayout>
  );
};

export default Maintenance;

