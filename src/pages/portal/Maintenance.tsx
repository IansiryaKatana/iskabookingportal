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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [uploadingImages, setUploadingImages] = useState<string[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | undefined>(undefined);

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
    title: "",
    description: "",
    priority: "normal" as "low" | "normal" | "high" | "urgent",
  });

  const filteredRequests = useMemo(() => {
    if (!requests) return [];
    if (statusFilter === "all") return requests;
    return requests.filter((req) => req.status === statusFilter);
  }, [requests, statusFilter]);

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
      <Badge className={`uppercase ${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
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
      <Badge className={`uppercase ${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium`}>
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
        title: formData.title.trim(),
        description: formData.description.trim(),
        priority: formData.priority,
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
        title: "",
        description: "",
        priority: "normal",
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
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] rounded-full">
              <SelectValue placeholder="Filter by status" />
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
              {/* Desktop: Table with Accordion */}
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
                              <TableCell className="align-middle text-left">
                                <div className="font-semibold text-sm">{request.title}</div>
                                <div className="text-xs text-muted-foreground line-clamp-1 mt-1">
                                  {request.description}
                                </div>
                              </TableCell>
                              <TableCell className="align-middle text-center">{getStatusBadge(request.status)}</TableCell>
                              <TableCell className="align-middle text-center">{getPriorityBadge(request.priority)}</TableCell>
                              <TableCell className="align-middle text-center">
                                <Badge variant="outline" className="rounded-full text-xs">
                                  {getTypeLabel(request.request_type)}
                                </Badge>
                              </TableCell>
                              <TableCell className="align-middle text-right text-xs text-muted-foreground">
                                {format(new Date(request.created_at), "MMM d, yyyy")}
                              </TableCell>
                              <TableCell className="align-middle text-center w-[60px]">
                                <Plus className={`h-4 w-4 shrink-0 transition-transform duration-200 mx-auto ${isOpen ? 'rotate-45' : ''}`} />
                              </TableCell>
                            </TableRow>
                            <AccordionContent asChild>
                              <TableRow>
                                <TableCell colSpan={6} className="p-4">
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
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
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
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value: "low" | "normal" | "high" | "urgent") =>
                    setFormData((prev) => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger id="priority" className="rounded-full">
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
      </div>
    </PortalLayout>
  );
};

export default Maintenance;

