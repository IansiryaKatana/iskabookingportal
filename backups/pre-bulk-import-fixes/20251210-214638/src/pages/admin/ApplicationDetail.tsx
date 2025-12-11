import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudentApplication } from "@/hooks/useStudentApplication";
import { useUpdateApplicationStatus } from "@/hooks/useAdminApplications";
import { useAdminStudios } from "@/hooks/useAdminStudios";
import { ArrowLeft, User, Mail, Phone, MapPin, Calendar, Building2, CreditCard, FileText, CheckCircle2, XCircle, Download, Send, RotateCcw, Gift, Handshake } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
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
import { useApplicationPartnerReferral, usePartners, useCreatePartnerReferral } from "@/hooks/usePartners";
import { logActivity } from "@/utils/auditLog";

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
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false);
  const [selectedCashbackCampaign, setSelectedCashbackCampaign] = useState<string>("");
  const [selectedPartner, setSelectedPartner] = useState<string>("");

  // Cashback and Partner hooks
  const { data: cashback } = useApplicationCashback(applicationId);
  const { data: activeCampaigns } = useActiveCashbackCampaigns(
    application?.is_rebooking ? "rebooking" : "new"
  );
  const applyCashback = useApplyCashback();
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["application-documents", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["student-application", applicationId] });
      toast({
        title: "Document verified",
        description: "Document status has been updated.",
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
              <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
                <User className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-sm sm:text-base">Step 1: Personal Information</span>
              </CardTitle>
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
                            doc.status === "approved"
                              ? "default"
                              : doc.status === "rejected"
                                ? "destructive"
                                : "outline"
                          }
                          className="uppercase"
                        >
                          {doc.status}
                        </Badge>
                      </div>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full uppercase tracking-wide gap-2 text-xs w-full sm:w-auto"
                          onClick={async () => {
                            const { data } = await supabase.storage
                              .from("documents")
                              .createSignedUrl(doc.storage_path, 3600);
                            if (data?.signedUrl) {
                              window.open(data.signedUrl, "_blank");
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
                  {cashback && cashback.cashback_amount > 0 && (
                    <p className="text-sm font-semibold text-primary">
                      Adjusted: {formatCurrency((application.total_contract_value || 0) - cashback.cashback_amount)}
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
    </AdminLayout>
  );
};

export default ApplicationDetail;


