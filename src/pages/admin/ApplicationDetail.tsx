import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudentApplication } from "@/hooks/useStudentApplication";
import { useUpdateApplicationStatus } from "@/hooks/useAdminApplications";
import { useAdminStudios } from "@/hooks/useAdminStudios";
import { ArrowLeft, User, Mail, Phone, MapPin, Calendar, Building2, CreditCard, FileText, CheckCircle2, XCircle, Download, Send, RotateCcw, Gift, Percent, Handshake, Upload } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ManualPaymentDialog from "@/components/admin/ManualPaymentDialog";
import { useCreateNotification } from "@/hooks/useNotifications";
import { useApplicationCashback, useActiveCashbackCampaigns, useApplyCashback } from "@/hooks/useCashback";
import { useApplicationDiscount, useActiveDiscountCampaigns, useApplyDiscount, useRemoveDiscount } from "@/hooks/useDiscount";
import { useApplicationPartnerReferral, usePartners, useCreatePartnerReferral } from "@/hooks/usePartners";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";
import { logActivity } from "@/utils/auditLog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const getStatusBadge = (status: string) => {
  const statusConfig: Record<string, { className: string; label: string }> = {
    draft: {
      className: "bg-gray-500 hover:bg-gray-600 text-white",
      label: "Draft",
    },
    awaiting_deposit: {
      className: "bg-yellow-500 hover:bg-yellow-600 text-white",
      label: "Awaiting Deposit",
    },
    awaiting_signature: {
      className: "bg-blue-500 hover:bg-blue-600 text-white",
      label: "Awaiting Signature",
    },
    awaiting_verification: {
      className: "bg-purple-500 hover:bg-purple-600 text-white",
      label: "Awaiting Verification",
    },
    confirmed: {
      className: "bg-green-500 hover:bg-green-600 text-white",
      label: "Confirmed",
    },
    cancelled: {
      className: "bg-red-500 hover:bg-red-600 text-white",
      label: "Cancelled",
    },
    expired: {
      className: "bg-orange-500 hover:bg-orange-600 text-white",
      label: "Expired",
    },
  };

  const config = statusConfig[status] || {
    className: "bg-gray-500 hover:bg-gray-600 text-white",
    label: status,
  };

  return (
    <Badge className={`uppercase ${config.className} rounded-full px-2.5 py-0.5 text-xs font-medium`}>
      {config.label}
    </Badge>
  );
};

const ApplicationDetail = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: application, isLoading } = useStudentApplication(applicationId || "");
  const updateStatus = useUpdateApplicationStatus();
  const createNotification = useCreateNotification();
  const queryClient = useQueryClient();
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false);
  const [selectedStudio, setSelectedStudio] = useState<string>("");
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const [cashbackDialogOpen, setCashbackDialogOpen] = useState(false);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false);
  const [selectedCashbackCampaign, setSelectedCashbackCampaign] = useState<string>("");
  const [selectedDiscountCampaign, setSelectedDiscountCampaign] = useState<string>("");
  const [selectedPartner, setSelectedPartner] = useState<string>("");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedRejectedDoc, setSelectedRejectedDoc] = useState<{ id: string; documentType: string; notes?: string } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadDocument = useDocumentUpload();

  // Cashback, Discount and Partner hooks
  const { data: cashback } = useApplicationCashback(applicationId);
  const { data: activeCampaigns } = useActiveCashbackCampaigns(
    application?.is_rebooking ? "rebooking" : "new"
  );
  const applyCashback = useApplyCashback();
  const { data: discount } = useApplicationDiscount(applicationId);
  const { data: activeDiscountCampaigns } = useActiveDiscountCampaigns(
    application?.is_rebooking ? "rebooking" : "new"
  );
  const applyDiscount = useApplyDiscount();
  const removeDiscount = useRemoveDiscount();
  const { data: partnerReferral } = useApplicationPartnerReferral(applicationId);
  const { data: partners } = usePartners(true);
  const createPartnerReferral = useCreatePartnerReferral();

  // Fetch available studios for reassignment
  const { data: studios } = useAdminStudios({
    gradeId: application?.studio_grade_id,
    status: "available",
  });

  // Fetch student documents
  const { data: documents } = useQuery({
    queryKey: ["application-documents", applicationId],
    queryFn: async () => {
      if (!applicationId) return [];
      const { data, error } = await supabase
        .from("student_documents")
        .select("*")
        .eq("application_id", applicationId)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!applicationId,
  });

  // Passport photo for visual identification
  const [passportPhotoUrl, setPassportPhotoUrl] = useState<string | null>(null);
  const [isPassportPhotoDialogOpen, setIsPassportPhotoDialogOpen] = useState(false);

  useEffect(() => {
    const loadPassportPhoto = async () => {
      try {
        const passportPhotoDoc = (documents || []).find(
          (doc) => doc.document_type === "passport_photo",
        );

        if (!passportPhotoDoc) {
          setPassportPhotoUrl(null);
          return;
        }

        const path = passportPhotoDoc.storage_path;
        const extension = path.toLowerCase().split(".").pop() ?? "";
        const isImageExtension = ["png", "jpg", "jpeg", "webp"].includes(
          extension,
        );

        if (!isImageExtension) {
          setPassportPhotoUrl(null);
          return;
        }

        const { data, error } = await supabase.storage
          .from("documents")
          .createSignedUrl(path, 3600);

        if (error || !data?.signedUrl) {
          setPassportPhotoUrl(null);
          return;
        }

        setPassportPhotoUrl(data.signedUrl);
      } catch (error) {
        console.error("Error loading passport photo preview:", error);
        setPassportPhotoUrl(null);
      }
    };

    void loadPassportPhoto();
  }, [documents]);

  // Verify document mutation
  const verifyDocument = useMutation({
    mutationFn: async ({ documentId, status, notes }: { documentId: string; status: "approved" | "rejected"; notes?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Get current document to log old status
      const { data: currentDoc } = await supabase
        .from("student_documents")
        .select("status, document_type, application_id")
        .eq("id", documentId)
        .single();

      const updateData: any = {
        status,
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      };

      // Add notes if provided (check if column exists)
      if (notes !== undefined) {
        updateData.notes = notes || null;
      }

      const { error } = await supabase
        .from("student_documents")
        .update(updateData)
        .eq("id", documentId);

      if (error) {
        console.error("Document verification error:", error);
        throw error;
      }

      // Log document verification
      await logActivity({
        action: status === "approved" ? "approve" : "reject",
        entityType: "document",
        entityId: documentId,
        payload: {
          application_id: currentDoc?.application_id,
          document_type: currentDoc?.document_type,
          status_change: {
            from: currentDoc?.status,
            to: status,
          },
          notes: notes || null,
        },
      });

      // Send email notification if rejected
      if (status === "rejected" && currentDoc?.application_id) {
        try {
          // Get application to find student_id
          const { data: app } = await supabase
            .from("student_applications")
            .select("student_id")
            .eq("id", currentDoc.application_id)
            .single();

          if (app?.student_id) {
            // Get student name from Step 1
            const { data: step1 } = await supabase
              .from("student_application_steps")
              .select("payload")
              .eq("application_id", currentDoc.application_id)
              .eq("step_number", 1)
              .single();

            const step1Data = step1?.payload as any;
            const studentName = step1Data?.first_name && step1Data?.last_name
              ? `${step1Data.first_name} ${step1Data.last_name}`
              : "Student";

            // Send rejection email
            await supabase.functions.invoke("send-transactional-email", {
              body: {
                user_id: app.student_id,
                email_type: "document_rejected",
                variables: {
                  student_name: studentName,
                  document_type: currentDoc.document_type?.replace(/_/g, " ") || "document",
                  rejection_reason: notes || "Please review the document requirements and upload a new document.",
                  application_id: currentDoc.application_id,
                },
                create_notification: true,
              },
            });
          }
        } catch (emailError) {
          console.error("Error sending document rejection email:", emailError);
          // Don't fail the rejection if email fails
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["application-documents", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-application", applicationId] });
      toast({
        title: "Document verified",
        description: variables.status === "rejected" 
          ? "Document rejected and student has been notified."
          : "Document status has been updated.",
      });
    },
    onError: (error) => {
      console.error("Failed to verify document:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to verify document. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reassign studio mutation
  const reassignStudio = useMutation({
    mutationFn: async (studioId: string) => {
      if (!applicationId) throw new Error("Application ID required");
      
      const oldStudioId = application?.assigned_studio_id;
      
      // Get studio details for logging
      const { data: oldStudio } = oldStudioId ? await supabase
        .from("studios")
        .select("studio_number, status")
        .eq("id", oldStudioId)
        .single() : { data: null };
      
      const { data: newStudio } = await supabase
        .from("studios")
        .select("studio_number, status")
        .eq("id", studioId)
        .single();

      const { error } = await supabase
        .from("student_applications")
        .update({ assigned_studio_id: studioId })
        .eq("id", applicationId);

      if (error) throw error;

      // Update old studio to available if it exists
      if (oldStudioId) {
        await supabase
          .from("studios")
          .update({ status: "available" })
          .eq("id", oldStudioId);
      }

      // Update new studio to occupied
      await supabase
        .from("studios")
        .update({ status: "occupied" })
        .eq("id", studioId);

      // Log studio reassignment
      await logActivity({
        action: "reassign",
        entityType: "student_application",
        entityId: applicationId,
        payload: {
          studio_reassignment: {
            from: oldStudioId ? {
              studio_id: oldStudioId,
              studio_number: oldStudio?.studio_number,
              status: oldStudio?.status,
            } : null,
            to: {
              studio_id: studioId,
              studio_number: newStudio?.studio_number,
              status: newStudio?.status,
            },
          },
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-application", applicationId] });
      toast({
        title: "Studio reassigned",
        description: "Studio has been successfully reassigned.",
      });
    },
  });

  const BOOKING_SOURCE_NONE = "__none__";

  const updateBookingSource = useMutation({
    mutationFn: async (value: string) => {
      const bookingSource = value === BOOKING_SOURCE_NONE || value === "" ? null : value;
      const isRebooking = bookingSource === "rebooker";
      const payload: { booking_source: string | null; is_rebooking: boolean; rebooking_reason?: string | null } = {
        booking_source: bookingSource,
        is_rebooking: isRebooking,
      };
      if (isRebooking && !application?.rebooking_reason) {
        payload.rebooking_reason = "Marked as rebooker (previous year can be linked when data is uploaded)";
      } else if (!isRebooking) {
        payload.rebooking_reason = null;
      }
      const { error } = await supabase
        .from("student_applications")
        .update(payload)
        .eq("id", applicationId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-application", applicationId] });
      toast({ title: "Booking source updated", description: "Application booking source has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update booking source", variant: "destructive" });
    },
  });

  const handleBookingSourceChange = (value: string) => {
    if (!applicationId) return;
    updateBookingSource.mutate(value);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!applicationId) return;

    try {
      await updateStatus.mutateAsync({
        id: applicationId,
        status: newStatus as any,
      });

      // Auto-allocate studio if confirming
      if (newStatus === "confirmed" && selectedStudio && !application?.assigned_studio_id) {
        await reassignStudio.mutateAsync(selectedStudio);
      }

      // Auto-update studio status to occupied when confirmed
      if (newStatus === "confirmed" && application?.assigned_studio_id) {
        await supabase
          .from("studios")
          .update({ status: "occupied" })
          .eq("id", application.assigned_studio_id);
      }

      toast({
        title: "Status updated",
        description: `Application status changed to ${newStatus}.`,
      });
    } catch (error) {
      console.error("Failed to update status:", error);
      toast({
        title: "Error",
        description: "Failed to update application status.",
        variant: "destructive",
      });
    }
  };

  const handleSendNotification = async (title: string, message: string) => {
    if (!application?.student_id) return;

    try {
      await createNotification.mutateAsync({
        user_id: application.student_id,
        title,
        message,
        type: "info",
        link: `/portal/applications/${application.id}`,
      });

      toast({
        title: "Notification sent",
        description: "Student has been notified.",
      });
    } catch (error) {
      console.error("Failed to send notification:", error);
      toast({
        title: "Error",
        description: "Failed to send notification.",
        variant: "destructive",
      });
    }
  };

  // Get step data
  const step1 = application?.student_application_steps?.find((s) => s.step_number === 1);
  const step1Data = step1?.payload as any;
  const step2 = application?.student_application_steps?.find((s) => s.step_number === 2);
  const step2Data = step2?.payload as any;
  const step3 = application?.student_application_steps?.find((s) => s.step_number === 3);
  const step3Data = step3?.payload as any;
  const step4 = application?.student_application_steps?.find((s) => s.step_number === 4);
  const step4Data = step4?.payload as any;
  const step5 = application?.student_application_steps?.find((s) => s.step_number === 5);
  const step5Data = step5?.payload as any;

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "—";
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <AdminLayout pageTitle="Application Review" subtitle="Review and verify student application">
        <div className="space-y-6">
          <Skeleton className="h-10 w-32" />
          <Card className="rounded-3xl">
            <CardContent className="p-6">
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  if (!application) {
    return (
      <AdminLayout pageTitle="Application Review" subtitle="Review and verify student application">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle>Application Not Found</CardTitle>
            <CardDescription>The requested application could not be found.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/admin/applications")} className="rounded-full uppercase tracking-wide">
              Back to Applications
            </Button>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      pageTitle="Application Review" 
      subtitle="Review and verify student application"
      mobileActionButton={
        <Button
          onClick={() => navigate("/admin/applications")}
          className="rounded-full h-9 w-9 p-0 bg-red-600 hover:bg-red-700 text-white flex-shrink-0"
          size="sm"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Header - Hidden on mobile, shown on desktop */}
        <div className="hidden lg:flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/admin/applications")}
            className="rounded-full uppercase tracking-wide gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Applications
          </Button>
          <div className="flex items-center gap-3">
            {getStatusBadge(application.status)}
            {application.is_rebooking && (
              <Badge className="bg-primary/10 text-primary border-primary/20 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
                <RotateCcw className="h-3 w-3" />
                Rebooking
              </Badge>
            )}
            <Select
              value={application.status}
              onValueChange={handleStatusChange}
            >
              <SelectTrigger className="w-48 rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="awaiting_deposit">Awaiting Deposit</SelectItem>
                <SelectItem value="awaiting_signature">Awaiting Signature</SelectItem>
                <SelectItem value="awaiting_verification">Awaiting Verification</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Booking source</Label>
              <Select
                value={application.booking_source || BOOKING_SOURCE_NONE}
                onValueChange={handleBookingSourceChange}
                disabled={updateBookingSource.isPending}
              >
                <SelectTrigger className="w-40 rounded-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BOOKING_SOURCE_NONE}>—</SelectItem>
                  <SelectItem value="rebooker">Rebooker</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="imported">Imported</SelectItem>
                  <SelectItem value="partner_referral">Partner referral</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Status and Select - Mobile only, shown below header */}
        <div className="lg:hidden flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            {getStatusBadge(application.status)}
            {application.is_rebooking && (
              <Badge className="bg-primary/10 text-primary border-primary/20 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
                <RotateCcw className="h-3 w-3" />
                Rebooking
              </Badge>
            )}
          </div>
          <Select
            value={application.status}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="w-full sm:w-48 rounded-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="awaiting_deposit">Awaiting Deposit</SelectItem>
                <SelectItem value="awaiting_signature">Awaiting Signature</SelectItem>
                <SelectItem value="awaiting_verification">Awaiting Verification</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
          </Select>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Booking source</Label>
            <Select
              value={application.booking_source || BOOKING_SOURCE_NONE}
              onValueChange={handleBookingSourceChange}
              disabled={updateBookingSource.isPending}
            >
              <SelectTrigger className="w-full sm:w-40 rounded-full text-sm">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BOOKING_SOURCE_NONE}>—</SelectItem>
                <SelectItem value="rebooker">Rebooker</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="imported">Imported</SelectItem>
                <SelectItem value="partner_referral">Partner referral</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Rebooking Information */}
        {application.is_rebooking && (
          <Card className="rounded-3xl border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
                <RotateCcw className="h-4 w-4 sm:h-5 sm:w-5" />
                Rebooking Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {application.previous_application_id && (
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Previous Application</p>
                  <Button
                    variant="link"
                    className="p-0 h-auto text-primary font-medium"
                    onClick={() => navigate(`/admin/applications/${application.previous_application_id}`)}
                  >
                    View Previous Application →
                  </Button>
                </div>
              )}
              {application.rebooking_reason && (
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Reason</p>
                  <p className="font-medium text-sm sm:text-base">{application.rebooking_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
          {/* Step 1: Personal Information */}
          <Card className="rounded-3xl">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
                <User className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-sm sm:text-base">Step 1: Personal Information</span>
              </CardTitle>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs sm:text-sm text-muted-foreground">Student Photo</p>
                    {passportPhotoUrl && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground">
                        Click to preview
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
                    onClick={() => {
                      if (passportPhotoUrl) setIsPassportPhotoDialogOpen(true);
                    }}
                    aria-label="Preview student passport photo"
                  >
                    <Avatar className="h-10 w-10 sm:h-12 sm:w-12 border cursor-pointer">
                      {passportPhotoUrl ? (
                        <AvatarImage src={passportPhotoUrl} alt="Student passport photo" />
                      ) : (
                        <AvatarFallback className="text-xs sm:text-sm">
                          {step1Data?.first_name?.[0]}
                          {step1Data?.last_name?.[0]}
                        </AvatarFallback>
                      )}
                    </Avatar>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">First Name</p>
                  <p className="font-medium text-sm sm:text-base break-words">{step1Data?.first_name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Last Name</p>
                  <p className="font-medium text-sm sm:text-base break-words">{step1Data?.last_name || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Date of Birth</p>
                  <p className="font-medium text-sm sm:text-base">
                    {step1Data?.date_of_birth ? format(new Date(step1Data.date_of_birth), "d MMM yyyy") : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Country</p>
                  <p className="font-medium text-sm sm:text-base break-words">{step1Data?.country || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Ethnicity</p>
                  <p className="font-medium text-sm sm:text-base break-words">{step1Data?.ethnicity || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Gender</p>
                  <p className="font-medium text-sm sm:text-base break-words">{step1Data?.gender || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">UCAS ID</p>
                  <p className="font-medium text-sm sm:text-base break-words">{step1Data?.ucas_id || "—"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">UK Citizen</p>
                  <p className="font-medium text-sm sm:text-base">{step4Data?.uk_citizen === "yes" ? "Yes" : step4Data?.uk_citizen === "no" ? "No" : "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 2: Contact Information */}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
                <Mail className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-sm sm:text-base">Step 2: Contact Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Email</p>
                  <p className="font-medium text-sm sm:text-base break-words">{step2Data?.email || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Mobile</p>
                  <p className="font-medium text-sm sm:text-base break-words">{step2Data?.mobile || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Address</p>
                  <p className="font-medium text-sm sm:text-base break-words">
                    {step2Data?.address_line_1 || step2Data?.town || step2Data?.postcode
                      ? [
                          step2Data?.address_line_1,
                          step2Data?.address_line_2,
                          step2Data?.town,
                          step2Data?.postcode,
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Academic Information */}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-sm sm:text-base">Step 3: Academic Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Year of Study</p>
                  <p className="font-medium text-sm sm:text-base break-words">{step3Data?.year_of_study || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Field of Study</p>
                  <p className="font-medium text-sm sm:text-base break-words">{step3Data?.field_of_study || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Disability</p>
                  <p className="font-medium text-sm sm:text-base break-words">
                    {step3Data?.disabled === "yes" ? "Yes" : step3Data?.disabled === "no" ? "No" : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Smoker</p>
                  <p className="font-medium text-sm sm:text-base break-words">
                    {step3Data?.smoker === "yes" ? "Yes" : step3Data?.smoker === "no" ? "No" : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-1">Entry to UK</p>
                  <p className="font-medium text-sm sm:text-base break-words">{step3Data?.entry_into_uk || "—"}</p>
                </div>
                {step3Data?.medical_requirements && (
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground text-xs sm:text-sm mb-1">Medical Requirements</p>
                    <p className="font-medium text-sm sm:text-base break-words">{step3Data.medical_requirements}</p>
                  </div>
                )}
              </div>

              {/* Guarantor & Witness Information */}
              {(step5Data?.guarantor_name || step5Data?.witness_name) && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wide">
                    Guarantor & Witness Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {step5Data?.guarantor_name && (
                      <>
                        <div>
                          <p className="text-muted-foreground text-xs sm:text-sm mb-1">Guarantor Name</p>
                          <p className="font-medium text-sm sm:text-base break-words">{step5Data.guarantor_name}</p>
                        </div>
                        {step5Data?.guarantor_email && (
                          <div>
                            <p className="text-muted-foreground text-xs sm:text-sm mb-1">Guarantor Email</p>
                            <p className="font-medium text-sm sm:text-base break-words">{step5Data.guarantor_email}</p>
                          </div>
                        )}
                        {step5Data?.guarantor_phone && (
                          <div>
                            <p className="text-muted-foreground text-xs sm:text-sm mb-1">Guarantor Phone</p>
                            <p className="font-medium text-sm sm:text-base break-words">{step5Data.guarantor_phone}</p>
                          </div>
                        )}
                        {step5Data?.guarantor_relationship && (
                          <div>
                            <p className="text-muted-foreground text-xs sm:text-sm mb-1">Relationship</p>
                            <p className="font-medium text-sm sm:text-base break-words">{step5Data.guarantor_relationship}</p>
                          </div>
                        )}
                        {step5Data?.guarantor_dob && (
                          <div>
                            <p className="text-muted-foreground text-xs sm:text-sm mb-1">Guarantor Date of Birth</p>
                            <p className="font-medium text-sm sm:text-base break-words">{step5Data.guarantor_dob}</p>
                          </div>
                        )}
                      </>
                    )}
                    {step5Data?.witness_name && (
                      <>
                        <div>
                          <p className="text-muted-foreground text-xs sm:text-sm mb-1">Witness Name</p>
                          <p className="font-medium text-sm sm:text-base break-words">{step5Data.witness_name}</p>
                        </div>
                        {step5Data?.witness_email && (
                          <div>
                            <p className="text-muted-foreground text-xs sm:text-sm mb-1">Witness Email</p>
                            <p className="font-medium text-sm sm:text-base break-words">{step5Data.witness_email}</p>
                          </div>
                        )}
                        {step5Data?.witness_phone && (
                          <div>
                            <p className="text-muted-foreground text-xs sm:text-sm mb-1">Witness Phone</p>
                            <p className="font-medium text-sm sm:text-base break-words">{step5Data.witness_phone}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-sm sm:text-base">Documents</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {documents && documents.length > 0 ? (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div key={doc.id} className="p-3 bg-muted/40 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm capitalize">{doc.document_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(doc.uploaded_at), "d MMM yyyy")}
                          </p>
                        </div>
                        <Badge
                          variant={
                            doc.status === "rejected"
                              ? "destructive"
                              : doc.status === "approved"
                                ? undefined
                                : doc.status === "pending"
                                  ? undefined
                                  : "outline"
                          }
                          className={
                            doc.status === "approved"
                              ? "bg-green-600 hover:bg-green-700 text-white uppercase"
                              : doc.status === "pending"
                                ? "bg-orange-300 hover:bg-orange-400 text-orange-900 uppercase"
                                : "uppercase"
                          }
                        >
                          {doc.status}
                        </Badge>
                      </div>
                      {doc.status === "rejected" && doc.notes && (
                        <div className="mb-2 p-2 bg-destructive/10 border border-destructive/20 rounded-lg">
                          <p className="text-xs font-medium text-destructive mb-1">Rejection Reason:</p>
                          <p className="text-xs text-destructive/90">{doc.notes}</p>
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full uppercase tracking-wide gap-2 text-xs w-full sm:w-auto"
                          onClick={async () => {
                            try {
                              // Try both encoded and decoded paths since the issue could be either way
                              let pathToUse = doc.storage_path;
                              
                              // First try: Use the path as-is
                              let { data, error } = await supabase.storage
                                .from("documents")
                                .createSignedUrl(pathToUse, 3600);
                              
                              // If that fails with "not found", try decoding
                              if (error && (error.message?.includes("not found") || error.message?.includes("Object not found"))) {
                                try {
                                  const decodedPath = decodeURIComponent(doc.storage_path);
                                  if (decodedPath !== doc.storage_path) {
                                    if (import.meta.env.DEV) console.log("Trying decoded path:", decodedPath);
                                    const result = await supabase.storage
                                      .from("documents")
                                      .createSignedUrl(decodedPath, 3600);
                                    data = result.data;
                                    error = result.error;
                                    pathToUse = decodedPath;
                                  }
                                } catch (decodeErr) {
                                  // Decoding failed, use original error
                                  console.error("Failed to decode path:", decodeErr);
                                }
                              }
                              
                              if (error) {
                                console.error("Error creating signed URL:", error, { 
                                  path: pathToUse, 
                                  originalPath: doc.storage_path,
                                  documentId: doc.id,
                                  documentType: doc.document_type
                                });
                                
                                // Provide more specific error message
                                let errorMessage = "Unable to generate preview link.";
                                if (error.message?.includes("not found") || error.message?.includes("Object not found")) {
                                  errorMessage = "The document file is missing from storage. The file may have been deleted or the path is incorrect. Please contact support if this persists.";
                                } else if (error.message) {
                                  errorMessage = error.message;
                                }
                                
                                toast({
                                  variant: "destructive",
                                  title: "Preview unavailable",
                                  description: errorMessage,
                                });
                                return;
                              }
                              
                              if (data?.signedUrl) {
                                window.open(data.signedUrl, "_blank");
                              } else {
                                toast({
                                  variant: "destructive",
                                  title: "Preview unavailable",
                                  description: "Unable to generate preview link.",
                                });
                              }
                            } catch (err) {
                              console.error("Error previewing document:", err, { storagePath: doc.storage_path });
                              toast({
                                variant: "destructive",
                                title: "Preview failed",
                                description: err instanceof Error ? err.message : "An unexpected error occurred.",
                              });
                            }
                          }}
                        >
                          <Download className="h-4 w-4" />
                          Preview
                        </Button>
                        {doc.status === "pending" && (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full uppercase tracking-wide gap-2 text-green-600 text-xs w-full sm:w-auto"
                              onClick={async () => {
                                try {
                                  await verifyDocument.mutateAsync({
                                    documentId: doc.id,
                                    status: "approved",
                                    notes: documentNotes[doc.id] || undefined,
                                  });
                                  // Clear notes after successful approval
                                  setDocumentNotes({ ...documentNotes, [doc.id]: "" });
                                } catch (error) {
                                  console.error("Failed to approve document:", error);
                                  toast({
                                    title: "Error",
                                    description: "Failed to approve document. Please try again.",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              disabled={verifyDocument.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full uppercase tracking-wide gap-2 text-red-600 text-xs w-full sm:w-auto"
                              onClick={async () => {
                                try {
                                  await verifyDocument.mutateAsync({
                                    documentId: doc.id,
                                    status: "rejected",
                                    notes: documentNotes[doc.id] || undefined,
                                  });
                                  // Clear notes after successful rejection
                                  setDocumentNotes({ ...documentNotes, [doc.id]: "" });
                                } catch (error) {
                                  console.error("Failed to reject document:", error);
                                  toast({
                                    title: "Error",
                                    description: "Failed to reject document. Please try again.",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              disabled={verifyDocument.isPending}
                            >
                              <XCircle className="h-4 w-4" />
                              Reject
                            </Button>
                          </div>
                        )}
                        {doc.status === "rejected" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full uppercase tracking-wide gap-2 text-blue-600 text-xs w-full sm:w-auto"
                            onClick={() => {
                              setSelectedRejectedDoc({
                                id: doc.id,
                                documentType: doc.document_type,
                                notes: doc.notes || undefined,
                              });
                              setUploadDialogOpen(true);
                            }}
                          >
                            <Upload className="h-4 w-4" />
                            Upload New
                          </Button>
                        )}
                      </div>
                      <Textarea
                        placeholder="Add verification notes..."
                        value={documentNotes[doc.id] || ""}
                        onChange={(e) =>
                          setDocumentNotes({ ...documentNotes, [doc.id]: e.target.value })
                        }
                        className="mt-2 text-xs"
                        rows={2}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No documents uploaded</p>
              )}
            </CardContent>
          </Card>

          {/* Payment & Contract */}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
                <CreditCard className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-sm sm:text-base">Payment & Contract</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2">Deposit Status</p>
                <div className="font-medium">
                  {application.deposit_payment_intent_id ? (
                    <Badge variant="default" className="uppercase text-xs">Paid</Badge>
                  ) : (
                    <Badge variant="outline" className="uppercase text-xs">Pending</Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Contract</p>
                <p className="font-medium text-sm sm:text-base break-words">{application.contract?.slug || "—"}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Total Value</p>
                <div className="space-y-1">
                  <p className="font-medium text-base sm:text-lg">
                    {formatCurrency(application.total_contract_value)}
                  </p>
                  {cashback && cashback.cashback_amount > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Gift className="h-3 w-3 text-primary" />
                      <span className="text-muted-foreground">Cashback:</span>
                      <span className="font-semibold text-green-600">
                        -{formatCurrency(cashback.cashback_amount)}
                      </span>
                    </div>
                  )}
                  {discount && discount.discount_amount > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Percent className="h-3 w-3 text-primary" />
                      <span className="text-muted-foreground">Discount:</span>
                      <span className="font-semibold text-green-600">
                        -{formatCurrency(discount.discount_amount)}
                      </span>
                    </div>
                  )}
                  {(cashback?.cashback_amount || 0) + (discount?.discount_amount || 0) > 0 && (
                    <p className="text-sm font-semibold text-primary">
                      Adjusted: {formatCurrency((application.total_contract_value || 0) - (cashback?.cashback_amount || 0) - (discount?.discount_amount || 0))}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Cashback Section */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm text-muted-foreground">Cashback</span>
                  {cashback ? (
                    <Badge className="bg-green-600 text-white">
                      <Gift className="h-3 w-3 mr-1" />
                      Applied
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full uppercase tracking-wide text-xs"
                      onClick={() => setCashbackDialogOpen(true)}
                    >
                      <Gift className="h-3 w-3 mr-1" />
                      Apply
                    </Button>
                  )}
                </div>
                {cashback && (
                  <p className="text-xs text-muted-foreground">
                    {cashback.campaign?.name} - £{cashback.cashback_amount.toFixed(2)}
                  </p>
                )}
              </div>

              {/* Discount Section */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm text-muted-foreground">Discount</span>
                  {discount ? (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600 text-white">
                        <Percent className="h-3 w-3 mr-1" />
                        Applied
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full uppercase tracking-wide text-[10px]"
                        onClick={() => {
                          if (applicationId) {
                            removeDiscount.mutate({ applicationId });
                          }
                        }}
                        disabled={removeDiscount.isPending}
                      >
                        {removeDiscount.isPending ? "Removing..." : "Remove"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full uppercase tracking-wide text-xs"
                      onClick={() => setDiscountDialogOpen(true)}
                    >
                      <Percent className="h-3 w-3 mr-1" />
                      Apply
                    </Button>
                  )}
                </div>
                {discount && (
                  <p className="text-xs text-muted-foreground">
                    {discount.campaign?.name} - £{discount.discount_amount.toFixed(2)}
                  </p>
                )}
              </div>

              {/* Partner Referral Section */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm text-muted-foreground">Partner Referral</span>
                  {partnerReferral ? (
                    <Badge className="bg-primary text-white">
                      <Handshake className="h-3 w-3 mr-1" />
                      Referred
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full uppercase tracking-wide text-xs"
                      onClick={() => setPartnerDialogOpen(true)}
                    >
                      <Handshake className="h-3 w-3 mr-1" />
                      Assign
                    </Button>
                  )}
                </div>
                {partnerReferral && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>{partnerReferral.partner?.name}</p>
                    <p>Commission: {formatCurrency(partnerReferral.commission_amount)} ({partnerReferral.commission_percentage}%)</p>
                    <Badge variant="outline" className="text-xs">
                      {partnerReferral.commission_status}
                    </Badge>
                  </div>
                )}
              </div>

              <Button
                variant="outline"
                className="w-full rounded-full uppercase tracking-wide gap-2 mt-4"
                onClick={() => setManualPaymentOpen(true)}
              >
                <CreditCard className="h-4 w-4" />
                Record Manual Payment
              </Button>
            </CardContent>
          </Card>

          {/* Studio Assignment */}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-sm sm:text-base">Studio Assignment</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Assign/Reassign Studio</Label>
                <Select value={selectedStudio || application.assigned_studio_id || ""} onValueChange={setSelectedStudio}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select a studio" />
                  </SelectTrigger>
                  <SelectContent>
                    {studios?.map((studio) => (
                      <SelectItem key={studio.id} value={studio.id}>
                        {studio.studio_number} - {studio.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {application.assigned_studio && (
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">Currently Assigned</p>
                  <p className="font-medium text-sm sm:text-base">{application.assigned_studio.studio_number}</p>
                </div>
              )}
              {selectedStudio && selectedStudio !== application.assigned_studio_id && (
                <Button
                  onClick={() => reassignStudio.mutate(selectedStudio)}
                  className="w-full rounded-full uppercase tracking-wide"
                  disabled={reassignStudio.isPending}
                >
                  {reassignStudio.isPending ? "Reassigning..." : "Reassign Studio"}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {passportPhotoUrl && (
          <Dialog
            open={isPassportPhotoDialogOpen}
            onOpenChange={setIsPassportPhotoDialogOpen}
          >
            <DialogContent className="max-w-md sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Student Photo</DialogTitle>
                <DialogDescription>
                  Passport-style photo uploaded by the student for identification.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex justify-center">
                <img
                  src={passportPhotoUrl}
                  alt="Student passport photo preview"
                  className="max-h-[70vh] w-auto rounded-3xl shadow-md"
                />
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Quick Actions */}
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
              <Send className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-sm sm:text-base">Quick Actions</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              <Button
                variant="outline"
                className="rounded-full uppercase tracking-wide gap-2 text-xs sm:text-sm w-full sm:w-auto"
                onClick={() => handleSendNotification("Deposit Reminder", "Please complete your deposit payment to proceed with your application.")}
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send Deposit Reminder</span>
                <span className="sm:hidden">Deposit Reminder</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-full uppercase tracking-wide gap-2 text-xs sm:text-sm w-full sm:w-auto"
                onClick={() => handleSendNotification("Signature Reminder", "Please complete signing your tenancy agreement.")}
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send Signature Reminder</span>
                <span className="sm:hidden">Signature Reminder</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-full uppercase tracking-wide gap-2 text-xs sm:text-sm w-full sm:w-auto"
                onClick={() => handleSendNotification("Application Confirmed", "Your application has been confirmed! Welcome to Urban Hub.")}
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send Confirmation</span>
                <span className="sm:hidden">Confirmation</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {applicationId && (
        <ManualPaymentDialog
          open={manualPaymentOpen}
          onOpenChange={setManualPaymentOpen}
          applicationId={applicationId}
        />
      )}

      {/* Cashback Dialog */}
      <Dialog open={cashbackDialogOpen} onOpenChange={setCashbackDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-display uppercase tracking-wide">
              Apply Cashback
            </DialogTitle>
            <DialogDescription>
              Select a cashback campaign to apply to this application
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {activeCampaigns && activeCampaigns.length > 0 ? (
              <Select value={selectedCashbackCampaign} onValueChange={setSelectedCashbackCampaign}>
                <SelectTrigger>
                  <SelectValue placeholder="Select campaign" />
                </SelectTrigger>
                <SelectContent>
                  {activeCampaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name} - £{campaign.cashback_amount.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active cashback campaigns available for this application type.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCashbackDialogOpen(false)}
              className="rounded-full uppercase tracking-wide"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedCashbackCampaign && applicationId) {
                  applyCashback.mutate({
                    applicationId,
                    campaignId: selectedCashbackCampaign,
                  });
                  setCashbackDialogOpen(false);
                  setSelectedCashbackCampaign("");
                }
              }}
              disabled={!selectedCashbackCampaign || applyCashback.isPending}
              className="rounded-full uppercase tracking-wide"
            >
              {applyCashback.isPending ? "Applying..." : "Apply Cashback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount Dialog */}
      <Dialog open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-display uppercase tracking-wide">
              Apply Discount
            </DialogTitle>
            <DialogDescription>
              Select a discount campaign to apply to this application
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {activeDiscountCampaigns && activeDiscountCampaigns.length > 0 ? (
              <Select value={selectedDiscountCampaign} onValueChange={setSelectedDiscountCampaign}>
                <SelectTrigger>
                  <SelectValue placeholder="Select campaign" />
                </SelectTrigger>
                <SelectContent>
                  {activeDiscountCampaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name} - £{campaign.discount_amount.toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active discount campaigns available for this application type.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDiscountDialogOpen(false)}
              className="rounded-full uppercase tracking-wide"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedDiscountCampaign && applicationId) {
                  applyDiscount.mutate({
                    applicationId,
                    campaignId: selectedDiscountCampaign,
                  });
                  setDiscountDialogOpen(false);
                  setSelectedDiscountCampaign("");
                }
              }}
              disabled={!selectedDiscountCampaign || applyDiscount.isPending}
              className="rounded-full uppercase tracking-wide"
            >
              {applyDiscount.isPending ? "Applying..." : "Apply Discount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partner Referral Dialog */}
      <Dialog open={partnerDialogOpen} onOpenChange={setPartnerDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-display uppercase tracking-wide">
              Assign Partner Referral
            </DialogTitle>
            <DialogDescription>
              Select a partner who referred this application
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {partners && partners.length > 0 ? (
              <Select value={selectedPartner} onValueChange={setSelectedPartner}>
                <SelectTrigger>
                  <SelectValue placeholder="Select partner" />
                </SelectTrigger>
                <SelectContent>
                  {partners.map((partner) => (
                    <SelectItem key={partner.id} value={partner.id}>
                      {partner.name} ({partner.commission_percentage}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active partners available. Create a partner first.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPartnerDialogOpen(false)}
              className="rounded-full uppercase tracking-wide"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedPartner && applicationId) {
                  createPartnerReferral.mutate({
                    applicationId,
                    partnerId: selectedPartner,
                  });
                  setPartnerDialogOpen(false);
                  setSelectedPartner("");
                }
              }}
              disabled={!selectedPartner || createPartnerReferral.isPending}
              className="rounded-full uppercase tracking-wide"
            >
              {createPartnerReferral.isPending ? "Assigning..." : "Assign Partner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload New Document Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload New Document</DialogTitle>
            <DialogDescription>
              Upload a new document to replace the rejected one. The student will be notified.
            </DialogDescription>
          </DialogHeader>
          {selectedRejectedDoc && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Document Type</Label>
                <p className="text-sm text-muted-foreground capitalize mt-1">
                  {selectedRejectedDoc.documentType.replace(/_/g, " ")}
                </p>
              </div>
              {selectedRejectedDoc.notes && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-xs font-medium text-destructive mb-1">Rejection Reason:</p>
                  <p className="text-xs text-destructive/90">{selectedRejectedDoc.notes}</p>
                </div>
              )}
              <div>
                <Label htmlFor="file-upload" className="text-sm font-medium">
                  Select File
                </Label>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="mt-1"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setUploadFile(file || null);
                  }}
                />
                {uploadFile && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Selected: {uploadFile.name} ({(uploadFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false);
                setUploadFile(null);
                setSelectedRejectedDoc(null);
              }}
              disabled={uploadDocument.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!uploadFile || !selectedRejectedDoc || !applicationId) return;

                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                  toast({
                    variant: "destructive",
                    title: "Authentication required",
                    description: "Please sign in to upload documents.",
                  });
                  return;
                }

                try {
                  await uploadDocument.mutateAsync({
                    file: uploadFile,
                    applicationId,
                    documentType: selectedRejectedDoc.documentType,
                    uploadedBy: user.id,
                  });

                  // Send notification to student
                  if (application?.student_id) {
                    try {
                      // Get student name from Step 1
                      const { data: step1 } = await supabase
                        .from("student_application_steps")
                        .select("payload")
                        .eq("application_id", applicationId)
                        .eq("step_number", 1)
                        .single();

                      const step1Data = step1?.payload as any;
                      const studentName = step1Data?.first_name && step1Data?.last_name
                        ? `${step1Data.first_name} ${step1Data.last_name}`
                        : "Student";

                      // Create notification
                      await createNotification.mutateAsync({
                        userId: application.student_id,
                        title: "New Document Uploaded",
                        message: `A new ${selectedRejectedDoc.documentType.replace(/_/g, " ")} document has been uploaded for your application. Please review it in your portal.`,
                        type: "info",
                        link: `/portal/documents`,
                      });
                    } catch (notifError) {
                      console.error("Error creating notification:", notifError);
                      // Don't fail the upload if notification fails
                    }
                  }

                  setUploadDialogOpen(false);
                  setUploadFile(null);
                  setSelectedRejectedDoc(null);
                  
                  toast({
                    title: "Document uploaded",
                    description: "The new document has been uploaded and the student has been notified.",
                  });
                } catch (error) {
                  console.error("Failed to upload document:", error);
                }
              }}
              disabled={!uploadFile || uploadDocument.isPending}
            >
              {uploadDocument.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default ApplicationDetail;


