import { useParams, useNavigate, useLocation } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStudentApplication } from "@/hooks/useStudentApplication";
import { useUpdateApplicationStatus } from "@/hooks/useAdminApplications";
import { useAdminStudios } from "@/hooks/useAdminStudios";
import { ArrowLeft, ArrowUpLeft, User, Mail, Phone, MapPin, Calendar, Building2, CreditCard, FileText, CheckCircle2, XCircle, Download, Send, RotateCcw, Gift, Percent, Handshake, Pencil, Check, ChevronsUpDown, CalendarPlus, DoorOpen, DoorClosed, Upload, LogIn } from "lucide-react";
import { addDays, differenceInCalendarDays, format, isAfter, parseISO } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useMemo, useState } from "react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ManualPaymentDialog from "@/components/admin/ManualPaymentDialog";
import { useInstallmentBreakdown, usePaymentSummary } from "@/hooks/useUnifiedPayments";
import { useStudentPayments } from "@/hooks/useStudentPayments";
import {
  useCreateCustomContractFromApplication,
  applicationHasInstalmentPayments,
  type CustomInstallmentInput,
} from "@/hooks/useCreateCustomContractFromApplication";
import { useCreateNotification } from "@/hooks/useNotifications";
import { useApplicationCashback, useActiveCashbackCampaigns, useApplyCashback, useRemoveCashback } from "@/hooks/useCashback";
import { useApplicationDiscount, useActiveDiscountCampaigns, useApplyDiscount, useRemoveDiscount } from "@/hooks/useDiscount";
import { useApplicationPartnerReferral, usePartners, useCreatePartnerReferral } from "@/hooks/usePartners";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";
import { CheckInCheckOutDialog } from "@/components/admin/CheckInCheckOutDialog";
import { formatDocumentDisplayName, formatDocumentTypeTitle } from "@/utils/documentDisplay";
import { getStayStatus, STAY_STATUS_LABELS } from "@/utils/stayStatus";
import { logActivity } from "@/utils/auditLog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { BOOKING_SOURCE_OPTIONS } from "@/constants/bookingSources";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { FinanceStatusBadge } from "@/components/finance/FinanceStatusBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  downloadCSV,
  exportSingleApplicationCustomCSV,
  exportSingleApplicationDefaultCSV,
} from "@/utils/csvTemplateGenerator";
import { useCreateExtensionApplication } from "@/hooks/useCreateExtensionApplication";
import { AmendBookingDialog } from "@/components/admin/AmendBookingDialog";
import { isApplicationAmendable } from "@/hooks/useAmendStudentApplicationBooking";
import { useResendAgreements } from "@/hooks/useResendAgreements";
import { useEarlyCheckoutStudent } from "@/hooks/useEarlyCheckout";
import { useEarlyCheckInSummary } from "@/hooks/useEarlyCheckIn";
import EarlyCheckInSection from "@/components/admin/EarlyCheckInSection";
import {
  usePendingEnvelopeStatusSync,
  useRefreshAgreementStatus,
} from "@/hooks/useDocusignStatusSync";
import {
  computeContractEndDate,
  datesToWeeksAndExtraDays,
} from "@/utils/contractDuration";
import {
  canDownloadEnvelope,
  formatEnvelopeStatus,
  getActiveEnvelopeForType,
  getEnvelopeDescription,
  getEnvelopeProgressLabel,
  getEnvelopeRecipientStatuses,
  formatRecipientStatusLabel,
  isRecipientSigningComplete,
  isEnvelopeCompleted,
  isEnvelopeSuperseded,
  allActiveEnvelopesCompleted,
} from "@/utils/envelopeStatus";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

const STATUS_DOT_CLASS: Record<string, string> = {
  draft: "bg-muted-foreground",
  awaiting_deposit: "bg-yellow-500",
  awaiting_signature: "bg-blue-500",
  awaiting_verification: "bg-purple-500",
  confirmed: "bg-green-500",
  cancelled: "bg-red-500",
  expired: "bg-orange-500",
  confirmed_ended: "bg-slate-500",
  checked_out: "bg-slate-600",
  checked_out_early: "bg-amber-600",
};

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
    // Confirmed booking where the stay has ended but the studio
    // has not yet been released via the admin checkout flow.
    confirmed_ended: {
      className: "bg-slate-600 hover:bg-slate-700 text-white",
      label: "Confirmed – stay ended (release pending)",
    },
    checked_out: {
      className: "bg-slate-700 hover:bg-slate-800 text-white",
      label: "Checked Out",
    },
    checked_out_early: {
      className: "bg-amber-700 hover:bg-amber-800 text-white",
      label: "Checked Out (Early)",
    },
  };

  const config = statusConfig[status] || {
    className: "bg-gray-500 hover:bg-gray-600 text-white",
    label: status,
  };

  return (
    <Badge className={`uppercase ${config.className} rounded-md px-2.5 py-0.5 text-xs font-medium`}>
      {config.label}
    </Badge>
  );
};

const ApplicationDetail = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo =
    (location.state as { returnTo?: string } | null)?.returnTo ??
    "/admin/applications";
  const navigateToApplications = () => navigate(returnTo);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: application, isLoading } = useStudentApplication(applicationId || "");
  const resendAgreements = useResendAgreements(applicationId);
  const { refresh: refreshAgreementStatus, isRefreshing: refreshingAgreementStatus } =
    useRefreshAgreementStatus(applicationId);
  // Auto-pull DocuSign status when staff open an app still waiting on signatures.
  usePendingEnvelopeStatusSync(
    application
      ? [
          {
            id: application.id,
            status: application.status,
            docusign_envelopes: application.docusign_envelopes,
          },
        ]
      : undefined,
    !!application,
  );
  const updateStatus = useUpdateApplicationStatus();
  const createNotification = useCreateNotification();
  const queryClient = useQueryClient();
  const [manualPaymentOpen, setManualPaymentOpen] = useState(false);
  const [manualPaymentInitialType, setManualPaymentInitialType] = useState<"deposit" | "instalment">("deposit");
  const [selectedStudio, setSelectedStudio] = useState<string>("");
  const [studioDropdownOpen, setStudioDropdownOpen] = useState(false);
  const [studioSearchQuery, setStudioSearchQuery] = useState("");
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const [applicationNotes, setApplicationNotes] = useState<string>(
    ((application as any)?.internal_notes as string | null) ?? ""
  );
  const [applicationNotesDirty, setApplicationNotesDirty] = useState(false);
  const [cashbackDialogOpen, setCashbackDialogOpen] = useState(false);
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false);
  const [selectedCashbackCampaign, setSelectedCashbackCampaign] = useState<string>("");
  const [selectedDiscountCampaign, setSelectedDiscountCampaign] = useState<string>("");
  const [selectedPartner, setSelectedPartner] = useState<string>("");
  const [partnerDropdownOpen, setPartnerDropdownOpen] = useState(false);
  const [partnerSearchQuery, setPartnerSearchQuery] = useState("");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadDialogMode, setUploadDialogMode] = useState<"rejected" | "additional">("rejected");
  const [selectedRejectedDoc, setSelectedRejectedDoc] = useState<{ id: string; documentType: string; notes?: string } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [additionalDocLabel, setAdditionalDocLabel] = useState("");
  const [checkInOutDialogOpen, setCheckInOutDialogOpen] = useState(false);
  const [customScheduleOpen, setCustomScheduleOpen] = useState(false);
  const [customInstallments, setCustomInstallments] = useState<CustomInstallmentInput[]>([]);
  const [createExtensionOpen, setCreateExtensionOpen] = useState(false);
  const [amendBookingOpen, setAmendBookingOpen] = useState(false);
  const [extensionForm, setExtensionForm] = useState({
    extensionWeeks: 12,
    extensionDays: 0,
    numInstallments: 4,
    extensionStartDate: "",
    extensionEndDate: "",
    weeklyPrice: 0,
    depositAmount: 0,
  });
  const uploadDocument = useDocumentUpload();
  const createExtension = useCreateExtensionApplication();
  const [downloadingAgreementId, setDownloadingAgreementId] = useState<string | null>(null);
  const [uploadingTenancy, setUploadingTenancy] = useState(false);
  const [uploadingGuarantor, setUploadingGuarantor] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [earlyCheckoutSheetOpen, setEarlyCheckoutSheetOpen] = useState(false);
  const [earlyCheckoutDate, setEarlyCheckoutDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [earlyCheckoutNotes, setEarlyCheckoutNotes] = useState("");
  const earlyCheckout = useEarlyCheckoutStudent();
  const [earlyCheckInSheetOpen, setEarlyCheckInSheetOpen] = useState(false);
  const { data: earlyCheckInSummary } = useEarlyCheckInSummary(applicationId);

  // Extensions of this application (when this is the original booking)
  const { data: extensionApplications } = useQuery({
    queryKey: ["student-application-extensions", applicationId],
    queryFn: async () => {
      if (!applicationId) return [];
      const { data, error } = await supabase
        .from("student_applications")
        .select(`
          id,
          status,
          created_at,
          total_contract_value,
          contract:contracts!contract_id ( id, name, contract_start, contract_end, weeks )
        `)
        .eq("extension_of_application_id", applicationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!applicationId,
  });
  const isExtension = !!(application as { extension_of_application_id?: string | null })?.extension_of_application_id;
  const isOriginalBooking = !!applicationId && !isExtension;

  // Derive a display status that shows "Checked Out" when a confirmed booking
  // has passed its final contract end date (original + any extensions), but
  // only once the admin release flow has been run. Before that, show a
  // "stay ended, release pending" state.
  const displayStatus = useMemo(() => {
    if (!application) return "";

    const rawStatus = application.status;

    if (rawStatus === "checked_out") {
      const actualCheckout = (application as { actual_check_out_date?: string | null })
        .actual_check_out_date;
      const contractEnd = (application.contract as { contract_end?: string | null } | null)
        ?.contract_end;
      if (actualCheckout && contractEnd) {
        try {
          if (parseISO(actualCheckout) < parseISO(contractEnd)) {
            return "checked_out_early";
          }
        } catch {
          // fall through to checked_out
        }
      }
      return rawStatus;
    }

    if (rawStatus !== "confirmed") return rawStatus;

    const endDates: string[] = [];
    const baseEnd = (application.contract as { contract_end?: string | null } | null)?.contract_end;
    if (baseEnd) endDates.push(baseEnd);

    (extensionApplications ?? []).forEach(
      (ext: { contract?: { contract_end?: string | null } | null }) => {
        const extEnd = ext.contract?.contract_end;
        if (extEnd) endDates.push(extEnd);
      },
    );

    if (!endDates.length) return rawStatus;

    const latestEnd = endDates
      .map((d) => {
        try {
          return parseISO(d);
        } catch {
          return null;
        }
      })
      .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
      .at(-1);

    if (!latestEnd) return rawStatus;

    const now = new Date();
    if (isAfter(now, latestEnd)) {
      // Keep the underlying DB status as "confirmed" until the admin
      // explicitly runs the checkout/release flow. The UI uses this
      // derived value to signal that action is pending.
      return "confirmed_ended";
    }

    return rawStatus;
  }, [application, extensionApplications]);

  const canEarlyCheckout = useMemo(() => {
    if (!application || application.status !== "confirmed") return false;
    if (!application.assigned_studio_id) return false;
    if (displayStatus === "confirmed_ended") return false;

    const hasActiveExtensions = (extensionApplications ?? []).some(
      (ext: { status?: string }) =>
        ["draft", "awaiting_deposit", "awaiting_signature", "awaiting_verification", "confirmed"].includes(
          ext.status ?? "",
        ),
    );
    if (hasActiveExtensions) return false;

    return true;
  }, [application, displayStatus, extensionApplications]);

  const hasActiveEarlyCheckIn = earlyCheckInSummary?.status === "confirmed";
  const canCreateEarlyCheckIn = useMemo(() => {
    if (!application || application.status !== "confirmed") return false;
    if (!application.assigned_studio_id) return false;
    if (!application.contract?.contract_start) return false;
    if (hasActiveEarlyCheckIn) return false;
    return true;
  }, [application, hasActiveEarlyCheckIn]);

  const { data: paymentSchedule } = useStudentPayments(applicationId);
  const { data: hasInstalmentPayments } = useQuery({
    queryKey: ["application-has-instalment-payments", applicationId],
    queryFn: () => applicationHasInstalmentPayments(applicationId ?? ""),
    enabled: !!applicationId,
  });
  const createCustomContract = useCreateCustomContractFromApplication();

  useEffect(() => {
    if (applicationNotesDirty) return;
    setApplicationNotes(
      ((application as any)?.internal_notes as string | null) ?? ""
    );
  }, [application, applicationNotesDirty]);

  // Cashback, Discount and Partner hooks
  const { data: cashback } = useApplicationCashback(applicationId);
  const { data: activeCampaigns } = useActiveCashbackCampaigns(
    application?.is_rebooking ? "rebooking" : "new"
  );
  const applyCashback = useApplyCashback();
  const removeCashback = useRemoveCashback();
  const { data: discount } = useApplicationDiscount(applicationId);
  const { data: activeDiscountCampaigns } = useActiveDiscountCampaigns(
    application?.is_rebooking ? "rebooking" : "new"
  );
  const applyDiscount = useApplyDiscount();
  const removeDiscount = useRemoveDiscount();
  const { data: partnerReferral } = useApplicationPartnerReferral(applicationId);
  const { data: partners } = usePartners(true);
  const createPartnerReferral = useCreatePartnerReferral();
  const { data: paymentSummary } = usePaymentSummary(applicationId);
  const { data: installmentBreakdown } = useInstallmentBreakdown(applicationId);

  // Fetch available studios for reassignment (same room grade + academic year as application; uses same "available" logic as Studio Roster)
  const { data: studios } = useAdminStudios({
    gradeId: application?.studio_grade_id,
    status: "available",
    academicYearId: application?.contract?.academic_year_id ?? undefined,
  });

  const filteredStudiosForAssignment = useMemo(() => {
    if (!studios) return [];
    const q = studioSearchQuery.trim().toLowerCase();
    if (!q) return studios;
    return studios.filter(
      (s) =>
        (s.studio_number ?? "").toLowerCase().includes(q) ||
        (s.id ?? "").toLowerCase().includes(q)
    );
  }, [studios, studioSearchQuery]);

  const filteredPartners = useMemo(() => {
    if (!partners) return [];
    const query = partnerSearchQuery.trim().toLowerCase();
    if (!query) return partners;
    return partners.filter((partner) =>
      partner.name.toLowerCase().includes(query),
    );
  }, [partners, partnerSearchQuery]);

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

  const requestedFlexibleStart = (application as any)?.requested_contract_start as string | null;
  const requestedFlexibleEnd = (application as any)?.requested_contract_end as string | null;
  const isFlexiblePlaceholderContract = Boolean(
    (application as any)?.contract?.is_custom_duration_placeholder,
  );

  const amendEligibility = isApplicationAmendable(
    application?.status,
    hasInstalmentPayments,
  );

  const agreementEnvelopeState = useMemo(() => {
    const envelopes = application?.docusign_envelopes ?? [];
    const hasSuperseded = envelopes.some((e) => isEnvelopeSuperseded(e.status));
    const activeComplete = allActiveEnvelopesCompleted(envelopes);
    const canResend =
      !!application &&
      ["draft", "awaiting_deposit", "awaiting_signature", "awaiting_verification"].includes(
        application.status,
      );
    const needsAttention =
      hasSuperseded ||
      (application?.status === "awaiting_signature" && envelopes.length > 0 && !activeComplete);
    return { hasSuperseded, activeComplete, canResend, needsAttention };
  }, [application]);

  const handleResendAgreements = async () => {
    if (!applicationId) return;
    try {
      await resendAgreements.mutateAsync();
      toast({
        title: "Agreements resent",
        description: "Updated DocuSign envelopes were sent for the new contract terms.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not resend agreements",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

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
        .select("status, document_type, application_id, notes")
        .eq("id", documentId)
        .single();

      const updateData: any = {
        status,
        verified_by: user.id,
        verified_at: new Date().toISOString(),
      };

      // Preserve additional-doc labels on approve when no verification notes entered.
      // On reject, notes become the rejection reason.
      if (status === "rejected") {
        updateData.notes = notes?.trim() || "Please review the document requirements and upload a new document.";
      } else if (notes !== undefined && notes.trim()) {
        if (currentDoc?.document_type === "additional" && currentDoc.notes?.trim()) {
          updateData.notes = `${currentDoc.notes.trim()}\n\nVerification: ${notes.trim()}`;
        } else {
          updateData.notes = notes.trim();
        }
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

  const updateApplicationNotes = useMutation({
    mutationFn: async (notes: string) => {
      if (!applicationId) throw new Error("Missing application id");
      const trimmed = notes.trim();
      const { error } = await supabase
        .from("student_applications")
        .update({
          internal_notes: trimmed.length > 0 ? trimmed : null,
        })
        .eq("id", applicationId);
      if (error) throw error;
    },
    onSuccess: () => {
      setApplicationNotesDirty(false);
      queryClient.invalidateQueries({ queryKey: ["student-application", applicationId] });
      toast({
        title: "Notes saved",
        description: "Application notes have been updated.",
      });
    },
    onError: (err: unknown) => {
      console.error("Failed to update application notes:", err);
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to save notes. Please try again.",
        variant: "destructive",
      });
    },
  });

  const discardDraftApplication = useMutation({
    mutationFn: async () => {
      if (!applicationId) throw new Error("Missing application id");
      if (!application || application.status !== "draft") {
        throw new Error("Only draft applications can be discarded");
      }

      const { error } = await supabase.rpc("delete_student_application", {
        p_application_id: applicationId,
      });

      if (error) {
        console.error("Failed to discard draft application:", error);
        throw error;
      }

      await logActivity({
        action: "delete",
        entityType: "student_application",
        entityId: applicationId,
        payload: {
          reason: "discard_draft",
          status_before: application.status,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      toast({
        title: "Draft discarded",
        description: "The draft application and its related data have been removed.",
      });
      navigateToApplications();
    },
    onError: (err: unknown) => {
      console.error("Error discarding draft application:", err);
      toast({
        title: "Unable to discard draft",
        description:
          err instanceof Error ? err.message : "Please try again or contact an administrator.",
        variant: "destructive",
      });
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
        description:
          error instanceof Error
            ? error.message
            : "Failed to update application status.",
        variant: "destructive",
      });
    }
  };

  const handleCheckoutAndRelease = async () => {
    if (!applicationId || !application?.assigned_studio_id) {
      return;
    }

    try {
      const studioId = application.assigned_studio_id;
      const academicYearId = (application.contract as { academic_year_id?: string | null } | null)
        ?.academic_year_id ?? null;

      const { error } = await supabase.rpc("admin_release_studio_occupancy", {
        p_studio_id: studioId,
        p_academic_year_id: academicYearId,
      });

      if (error) {
        throw error;
      }

      await queryClient.invalidateQueries({ queryKey: ["student-application", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
      queryClient.invalidateQueries({ queryKey: ["booking-calendar"] });

      toast({
        title: "Student checked out",
        description: "Studio released and application marked as checked out.",
      });
    } catch (error) {
      console.error("Failed to check out and release studio:", error);
      toast({
        title: "Unable to complete checkout",
        description:
          error instanceof Error ? error.message : "Please try again or contact an administrator.",
        variant: "destructive",
      });
    }
  };

  const handleEarlyCheckout = async () => {
    if (!applicationId || !earlyCheckoutDate) return;

    try {
      await earlyCheckout.mutateAsync({
        applicationId,
        checkoutDate: earlyCheckoutDate,
        notes: earlyCheckoutNotes.trim() || null,
      });

      setEarlyCheckoutSheetOpen(false);
      setEarlyCheckoutNotes("");

      toast({
        title: "Early checkout complete",
        description:
          "Student checked out, studio released for reallocation. No refunds were issued and payment history is unchanged.",
      });
    } catch (error) {
      console.error("Failed to complete early checkout:", error);
      toast({
        title: "Unable to complete early checkout",
        description:
          error instanceof Error ? error.message : "Please try again or contact an administrator.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadApplicationCsv = async () => {
    if (!applicationId || !application) return;

    try {
      const isCustomContract = Boolean(
        (application.contract as any)?.student_application_id,
      );

      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
        now.getDate(),
      )}_${pad(now.getHours())}${pad(now.getMinutes())}`;

      const academicYearName =
        (application.contract as any)?.academic_years?.name ?? "";
      const yearLabel =
        academicYearName !== ""
          ? academicYearName.replace(/\//g, "-")
          : "academic-year";

      if (isCustomContract) {
        const csv = await exportSingleApplicationCustomCSV(applicationId);
        const filename = `application_custom_contract_${yearLabel}_${applicationId}_${timestamp}.csv`;
        downloadCSV(csv, filename);
      } else {
        const csv = await exportSingleApplicationDefaultCSV(applicationId);
        const filename = `application_default_contract_${yearLabel}_${applicationId}_${timestamp}.csv`;
        downloadCSV(csv, filename);
      }

      toast({
        title: "Download started",
        description: "Application CSV has been generated in bulk import format.",
      });
    } catch (error: any) {
      console.error("Error exporting single application CSV:", error);
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error?.message || "Could not export this application. Please try again.",
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

  const formatStayDate = (value?: string | null) => {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "—";
    return format(parsed, "dd MMM yyyy");
  };

  const unpaidInstallments =
    installmentBreakdown?.filter(
      (inst) => inst.payment_status === "unpaid" || inst.payment_status === "partial",
    ) ?? [];

  const [installmentInvoiceDialogOpen, setInstallmentInvoiceDialogOpen] = useState(false);
  const [selectedInvoiceInstallmentId, setSelectedInvoiceInstallmentId] = useState<string>("");
  const [sendingInstallmentInvoice, setSendingInstallmentInvoice] = useState(false);

  const handleSendInstallmentInvoice = async () => {
    if (!applicationId || !selectedInvoiceInstallmentId) return;
    setSendingInstallmentInvoice(true);
    try {
      const { error } = await supabase.functions.invoke("send-installment-invoice-email", {
        body: {
          applicationId,
          installmentId: selectedInvoiceInstallmentId,
        },
      });

      if (error) {
        console.error("Error sending installment invoice:", error);
        toast({
          title: "Error",
          description: "Failed to send installment invoice. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Installment invoice sent",
          description: "The student has been emailed an invoice for the selected installment.",
        });
        setInstallmentInvoiceDialogOpen(false);
      }
    } catch (error) {
      console.error("Error invoking send-installment-invoice-email:", error);
      toast({
        title: "Error",
        description: "Failed to send installment invoice. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSendingInstallmentInvoice(false);
    }
  };

  const handleStaffUploadSignedDocument = async (envelopeType: "tenancy" | "guarantor", file: File) => {
    if (!applicationId || !application?.id) return;

    const setUploading = envelopeType === "tenancy" ? setUploadingTenancy : setUploadingGuarantor;
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("applicationId", application.id);
      formData.append("envelopeType", envelopeType);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/upload-signed-document`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok || data?.error) throw new Error(data?.error ?? "Upload failed");

      toast({
        title: `${envelopeType === "tenancy" ? "Tenancy" : "Guarantor"} agreement uploaded`,
        description: "The signed document has been saved.",
      });
      await queryClient.invalidateQueries({ queryKey: ["student-application", applicationId] });
    } catch (err) {
      console.error("Upload signed document failed:", err);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setUploading(false);
    }
  };

  const downloadAgreement = async (envelopeIdOrKey: string, envelopeType: "tenancy" | "guarantor") => {
    if (!applicationId) return;
    const downloadKey = envelopeIdOrKey || `${applicationId}-${envelopeType}`;
    setDownloadingAgreementId(downloadKey);
    try {
      const body = envelopeIdOrKey
        ? { envelopeId: envelopeIdOrKey, applicationId }
        : { applicationId, envelopeType };

      const { data, error } = await supabase.functions.invoke("download-signed-document", {
        body,
      });

      if (error) throw error;

      if (data?.url) {
        const newWindow = window.open(data.url, "_blank");
        if (!newWindow) {
          // Fallback if popup is blocked
          window.location.href = data.url;
        }
        toast({
          title: "Agreement opening",
          description: "The signed agreement is opening in your browser.",
        });
      } else if (data?.pdf_base64) {
        const dataUrl = `data:application/pdf;base64,${data.pdf_base64}`;
        const newWindow = window.open(dataUrl, "_blank");
        if (!newWindow) {
          window.location.href = dataUrl;
        }
        toast({
          title: "Agreement opening",
          description: "The signed agreement is opening in your browser.",
        });
      } else {
        toast({
          title: "Agreement unavailable",
          description:
            (data as { message?: string })?.message ||
            "Agreement download is not yet available. Please try again after signing is complete.",
        });
      }
    } catch (err: unknown) {
      console.error("Error downloading agreement:", err);
      const msg =
        (err as { context?: { body?: { error?: string } }; message?: string })?.context?.body?.error ??
        (err as Error)?.message ??
        "Unable to download the agreement. Please try again later.";
      toast({
        variant: "destructive",
        title: "Download failed",
        description: msg,
      });
    } finally {
      setDownloadingAgreementId(null);
    }
  };

  if (isLoading && !application) {
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
            <Button onClick={navigateToApplications} className="rounded-md uppercase tracking-wide gap-2 bg-black text-white hover:bg-accent hover:text-accent-foreground">
              <ArrowUpLeft className="h-4 w-4" />
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
          onClick={navigateToApplications}
          className="rounded-md h-9 w-9 p-0 bg-black text-white hover:bg-accent hover:text-accent-foreground flex-shrink-0"
          size="sm"
        >
          <ArrowUpLeft className="h-4 w-4" />
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Header - Hidden on mobile, shown on desktop */}
        <div className="hidden lg:block">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-2 py-2 shadow-sm">
            <Button
              variant="ghost"
              size="sm"
              onClick={navigateToApplications}
              className="shrink-0 gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to applications
            </Button>

            <Separator orientation="vertical" className="h-6" />

            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-2 px-1">
              {displayStatus !== application.status && getStatusBadge(displayStatus)}

              <div className="flex items-center gap-2">
                <Label
                  htmlFor="application-status"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Status
                </Label>
                <Select value={application.status} onValueChange={handleStatusChange}>
                  <SelectTrigger id="application-status" className="h-8 w-44">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          STATUS_DOT_CLASS[application.status] ?? "bg-muted-foreground",
                        )}
                        aria-hidden
                      />
                      <SelectValue />
                    </div>
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

              <div className="flex items-center gap-2">
                <Label
                  htmlFor="booking-source"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Booking source
                </Label>
                <Select
                  value={application.booking_source || BOOKING_SOURCE_NONE}
                  onValueChange={handleBookingSourceChange}
                  disabled={updateBookingSource.isPending}
                >
                  <SelectTrigger id="booking-source" className="h-8 w-40">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BOOKING_SOURCE_NONE}>—</SelectItem>
                    {BOOKING_SOURCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(application.is_rebooking || isExtension) && (
                <div className="flex items-center gap-1.5">
                  {application.is_rebooking && (
                    <Badge variant="outline" className="gap-1 font-normal">
                      <RotateCcw className="h-3 w-3" />
                      Rebooking
                    </Badge>
                  )}
                  {isExtension && (
                    <Badge variant="outline" className="gap-1 font-normal">
                      <CalendarPlus className="h-3 w-3" />
                      Extension
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {(application.status === "draft" ||
              canEarlyCheckout ||
              canCreateEarlyCheckIn ||
              (application.status === "confirmed" &&
                displayStatus === "confirmed_ended" &&
                application.assigned_studio_id)) && (
              <>
                <Separator orientation="vertical" className="h-6" />

                <div className="flex shrink-0 items-center gap-2 pr-1">
                  {canCreateEarlyCheckIn && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-900"
                      onClick={() => setEarlyCheckInSheetOpen(true)}
                    >
                      <DoorOpen className="h-4 w-4" />
                      Early check-in
                    </Button>
                  )}
                  {canEarlyCheckout && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-rose-200 bg-rose-100 text-rose-800 hover:bg-rose-200 hover:text-rose-900"
                      onClick={() => {
                        setEarlyCheckoutDate(new Date().toISOString().slice(0, 10));
                        setEarlyCheckoutSheetOpen(true);
                      }}
                    >
                      <DoorClosed className="h-4 w-4" />
                      Early checkout
                    </Button>
                  )}
                  {application.status === "confirmed" &&
                    displayStatus === "confirmed_ended" &&
                    application.assigned_studio_id && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCheckoutAndRelease}
                      >
                        Check out &amp; release studio
                      </Button>
                    )}
                  {application.status === "draft" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDiscardDialogOpen(true)}
                      disabled={discardDraftApplication.isPending}
                    >
                      <XCircle className="h-4 w-4" />
                      Discard draft
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Status and Select - Mobile only, shown below header */}
        <div className="lg:hidden flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            {getStatusBadge(displayStatus)}
            {application.is_rebooking && (
              <Badge className="bg-primary/10 text-primary border-primary/20 rounded-md px-3 py-1 text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
                <RotateCcw className="h-3 w-3" />
                Rebooking
              </Badge>
            )}
            {isExtension && (
              <Badge className="bg-primary/10 text-primary border-primary/20 rounded-md px-3 py-1 text-xs font-medium uppercase tracking-wide flex items-center gap-1.5">
                <CalendarPlus className="h-3 w-3" />
                Extension
              </Badge>
            )}
          </div>
          <Select
            value={application.status}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="w-full sm:w-48 rounded-md text-sm">
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
            <Label className="text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">
              Booking source
            </Label>
            <Select
              value={application.booking_source || BOOKING_SOURCE_NONE}
              onValueChange={handleBookingSourceChange}
              disabled={updateBookingSource.isPending}
            >
              <SelectTrigger className="w-full sm:w-40 rounded-md text-sm">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={BOOKING_SOURCE_NONE}>—</SelectItem>
                {BOOKING_SOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full sm:w-auto">
            {application.status === "draft" && (
              <Button
                type="button"
                variant="outline"
                className="mt-1 sm:mt-0 rounded-md uppercase tracking-wide border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground w-full sm:w-auto justify-center"
                onClick={() => setDiscardDialogOpen(true)}
                disabled={discardDraftApplication.isPending}
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                Discard draft
              </Button>
            )}
            {canCreateEarlyCheckIn && (
              <Button
                type="button"
                variant="outline"
                className="mt-1 sm:mt-0 rounded-md border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-200 hover:text-amber-900 w-full sm:w-auto justify-center"
                onClick={() => setEarlyCheckInSheetOpen(true)}
              >
                <DoorOpen className="h-4 w-4 mr-1.5" />
                Early check-in
              </Button>
            )}
            {canEarlyCheckout && (
              <Button
                type="button"
                variant="outline"
                className="mt-1 sm:mt-0 rounded-md border-rose-200 bg-rose-100 text-rose-800 hover:bg-rose-200 hover:text-rose-900 w-full sm:w-auto justify-center"
                onClick={() => {
                  setEarlyCheckoutDate(new Date().toISOString().slice(0, 10));
                  setEarlyCheckoutSheetOpen(true);
                }}
              >
                <DoorClosed className="h-4 w-4 mr-1.5" />
                Early checkout
              </Button>
            )}
            {application.status === "confirmed" &&
              displayStatus === "confirmed_ended" &&
              application.assigned_studio_id && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-1 sm:mt-0 rounded-md uppercase tracking-wide border-primary text-primary hover:bg-primary hover:text-primary-foreground w-full sm:w-auto justify-center"
                  onClick={handleCheckoutAndRelease}
                >
                  Check out &amp; release studio
                </Button>
              )}
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

        {/* Extension of (when this application is an extension) */}
        {(application as { extension_of_application_id?: string | null }).extension_of_application_id && (
          <Card className="rounded-3xl border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle
                className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2"
                tooltip="This application is an extension of an original booking."
                tooltipLabel="About Contract Extension"
              >
                <CalendarPlus className="h-4 w-4 sm:h-5 sm:w-5" />
                Contract Extension
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs sm:text-sm mb-1">Original Application</p>
                <Button
                  variant="link"
                  className="p-0 h-auto text-primary font-medium"
                  onClick={() => navigate(`/admin/applications/${(application as { extension_of_application_id?: string }).extension_of_application_id}`)}
                >
                  View Original Application →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Extensions (when this is the original: list extensions + Create extension) */}
        {!(application as { extension_of_application_id?: string | null })?.extension_of_application_id && (
          <Card className="rounded-3xl border-primary/20 bg-primary/5">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle
                    className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2"
                    tooltip="Add an extension period (e.g. extra weeks with a new instalment schedule) for this booking."
                    tooltipLabel="About Contract Extensions"
                  >
                    <CalendarPlus className="h-4 w-4 sm:h-5 sm:w-5" />
                    Contract Extensions
                  </CardTitle>
                </div>
                <Button
                  className="rounded-md uppercase tracking-wide gap-2"
                  onClick={() => {
                    const contract = application?.contract as { contract_end?: string; weekly_price_override?: number } | null;
                    const extensionStartDate = contract?.contract_end
                      ? addDays(new Date(contract.contract_end), 1).toISOString().slice(0, 10)
                      : "";
                    setExtensionForm((prev) => {
                      const extensionEndDate = computeContractEndDate(
                        extensionStartDate,
                        prev.extensionWeeks,
                        prev.extensionDays,
                      );
                      return {
                        ...prev,
                        extensionStartDate,
                        extensionEndDate,
                        weeklyPrice: contract?.weekly_price_override ?? prev.weeklyPrice,
                        depositAmount: prev.depositAmount,
                      };
                    });
                    setCreateExtensionOpen(true);
                  }}
                >
                  <CalendarPlus className="h-4 w-4" />
                  Create extension
                </Button>
              </div>
            </CardHeader>
            {(extensionApplications?.length ?? 0) > 0 && (
              <CardContent className="pt-0 space-y-2">
                <p className="text-muted-foreground text-xs sm:text-sm">Extensions linked to this booking:</p>
                <ul className="space-y-2">
                  {extensionApplications?.map((ext: { id: string; status: string; created_at: string; total_contract_value: number | null; contract: { name?: string; contract_start?: string; contract_end?: string; weeks?: number } | null }) => (
                    <li key={ext.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                      <span className="text-sm font-medium">{ext.contract?.name ?? "Extension"}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="rounded-md text-xs">{ext.status}</Badge>
                        <Button
                          variant="link"
                          className="p-0 h-auto text-primary text-sm"
                          onClick={() => navigate(`/admin/applications/${ext.id}`)}
                        >
                          View →
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
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
                    className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
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
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-sm sm:text-base">Documents</span>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="rounded-md uppercase tracking-wide text-xs gap-1 shrink-0"
                onClick={() => {
                  setUploadDialogMode("additional");
                  setSelectedRejectedDoc(null);
                  setUploadFile(null);
                  setAdditionalDocLabel("");
                  setUploadDialogOpen(true);
                }}
              >
                <Upload className="h-3 w-3" />
                Upload additional
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {documents && documents.length > 0 ? (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <div key={doc.id} className="p-3 bg-muted/40 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm capitalize">
                            {formatDocumentDisplayName(doc)}
                          </p>
                          {doc.document_type === "additional" && (
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {formatDocumentTypeTitle(doc.document_type)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(doc.uploaded_at), "d MMM yyyy")}
                            {doc.original_filename ? ` · ${doc.original_filename}` : ""}
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
                          className="rounded-md uppercase tracking-wide gap-2 text-xs w-full sm:w-auto"
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
                              className="rounded-md uppercase tracking-wide gap-2 text-green-600 text-xs w-full sm:w-auto"
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
                              className="rounded-md uppercase tracking-wide gap-2 text-red-600 text-xs w-full sm:w-auto"
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
                            className="rounded-md uppercase tracking-wide gap-2 text-blue-600 text-xs w-full sm:w-auto"
                            onClick={() => {
                              setUploadDialogMode("rejected");
                              setSelectedRejectedDoc({
                                id: doc.id,
                                documentType: doc.document_type,
                                notes: doc.notes || undefined,
                              });
                              setUploadFile(null);
                              setAdditionalDocLabel("");
                              setUploadDialogOpen(true);
                            }}
                          >
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
                <div className="font-medium flex flex-wrap items-center gap-2">
                  {application.deposit_payment_intent_id ? (
                    <Badge variant="default" className="uppercase text-xs">Paid</Badge>
                  ) : (
                    <>
                      <Badge variant="outline" className="uppercase text-xs">Not recorded</Badge>
                      <Button
                        variant="default"
                        size="sm"
                        className="rounded-md uppercase tracking-wide text-xs"
                        onClick={() => {
                          setManualPaymentInitialType("deposit");
                          setManualPaymentOpen(true);
                        }}
                      >
                        <CreditCard className="h-3 w-3 mr-1" />
                        Record deposit
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-1">Contract</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-sm sm:text-base break-words">{application.contract?.slug || "—"}</p>
                  {amendEligibility.allowed ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-md uppercase tracking-wide text-xs gap-1"
                      onClick={() => setAmendBookingOpen(true)}
                    >
                      <Pencil className="h-3 w-3" />
                      Amend booking
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-md uppercase tracking-wide text-xs gap-1 opacity-60"
                      disabled
                      title={amendEligibility.reason}
                    >
                      <Pencil className="h-3 w-3" />
                      Amend booking
                    </Button>
                  )}
                </div>
                {!amendEligibility.allowed && amendEligibility.reason && (
                  <p className="mt-1 text-[10px] text-muted-foreground italic">{amendEligibility.reason}</p>
                )}
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                  <div className="rounded-xl border border-border/60 px-3 py-2 bg-muted/30">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Check-in</p>
                    <p className="mt-0.5 font-medium">
                      {formatStayDate(
                        (application as { actual_check_in_date?: string | null }).actual_check_in_date ??
                          application.contract?.contract_start,
                      )}
                    </p>
                    {(application as { actual_check_in_date?: string | null }).actual_check_in_date ? (
                      <p className="mt-1 text-[10px] text-emerald-700 uppercase tracking-wide font-medium">
                        Actual check-in recorded
                      </p>
                    ) : application.status === "confirmed" ? (
                      <p className="mt-1 text-[10px] text-amber-700 uppercase tracking-wide font-medium">
                        Awaiting check-in
                      </p>
                    ) : null}
                    {hasActiveEarlyCheckIn && earlyCheckInSummary && (
                      <p className="mt-1 text-[10px] text-emerald-700 uppercase tracking-wide font-medium">
                        Early check-in · {earlyCheckInSummary.nights} night
                        {earlyCheckInSummary.nights !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl border border-border/60 px-3 py-2 bg-muted/30">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Check-out</p>
                    <p className="mt-0.5 font-medium">
                      {formatStayDate(
                        (application as { actual_check_out_date?: string | null }).actual_check_out_date ??
                          application.contract?.contract_end,
                      )}
                    </p>
                    {(application as { actual_check_out_date?: string | null }).actual_check_out_date &&
                      application.contract?.contract_end &&
                      new Date(
                        (application as { actual_check_out_date?: string }).actual_check_out_date!,
                      ) < new Date(application.contract.contract_end) && (
                        <p className="mt-1 text-[10px] text-amber-700 uppercase tracking-wide font-medium">
                          Early checkout
                        </p>
                      )}
                  </div>
                </div>
                {(() => {
                  const stay = getStayStatus({
                    status: application.status,
                    actual_check_in_date: (application as { actual_check_in_date?: string | null }).actual_check_in_date,
                    actual_check_out_date: (application as { actual_check_out_date?: string | null }).actual_check_out_date,
                  });
                  return stay ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Stay status:{" "}
                      <span className="font-medium text-foreground uppercase tracking-wide">
                        {STAY_STATUS_LABELS[stay]}
                      </span>
                    </p>
                  ) : null;
                })()}
                {(application as { check_out_notes?: string | null }).check_out_notes && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Checkout notes: </span>
                    {(application as { check_out_notes?: string | null }).check_out_notes}
                  </p>
                )}
                {(application.status === "confirmed" ||
                  application.status === "checked_out" ||
                  (application as { actual_check_in_date?: string | null }).actual_check_in_date) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 rounded-md uppercase tracking-wide text-xs gap-1"
                    onClick={() => setCheckInOutDialogOpen(true)}
                  >
                    <LogIn className="h-3 w-3" />
                    Manage check-in / out
                  </Button>
                )}
              </div>
              {application.contract?.contract_payment_plans && application.contract.contract_payment_plans.length > 0 && (
                <div>
                  <Label className="text-xs sm:text-sm text-muted-foreground">Payment plan</Label>
                  <Select
                    value={application.selected_payment_plan_id ?? ""}
                    onValueChange={async (planId) => {
                      if (!applicationId || !planId) return;
                      try {
                        const { error } = await supabase.rpc("set_selected_payment_plan", {
                          p_application_id: applicationId,
                          p_plan_id: planId,
                        });
                        if (error) throw error;
                        await queryClient.invalidateQueries({ queryKey: ["student-application", applicationId] });
                        await queryClient.invalidateQueries({ queryKey: ["student-payments", applicationId] });
                        await queryClient.invalidateQueries({ queryKey: ["payment-summary", applicationId] });
                        toast({ title: "Payment plan updated", description: "Schedule and journey will show the selected plan." });
                      } catch (err: unknown) {
                        toast({
                          variant: "destructive",
                          title: "Failed to update plan",
                          description: err instanceof Error ? err.message : "Please try again.",
                        });
                      }
                    }}
                    disabled={!!hasInstalmentPayments}
                  >
                    <SelectTrigger className="mt-1.5 rounded-md">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {[...(application.contract.contract_payment_plans || [])]
                        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
                        .filter((link) => link.payment_plan_id && link.payment_plan)
                        .map((link) => (
                          <SelectItem key={link.payment_plan_id!} value={link.payment_plan_id!}>
                            {link.payment_plan?.name ?? link.payment_plan_id}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {hasInstalmentPayments && (
                    <p className="text-[10px] text-muted-foreground mt-1 italic">Cannot change plan after instalment payments are recorded.</p>
                  )}
                </div>
              )}
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

              {/* Payment schedule preview & Customise (staff only, when no installment payments yet) */}
              {application.selected_payment_plan_id && paymentSchedule && paymentSchedule.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs sm:text-sm text-muted-foreground">Payment schedule</p>
                    {!hasInstalmentPayments && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md uppercase tracking-wide text-xs gap-1"
                        onClick={() => {
                          setCustomInstallments(
                            paymentSchedule.map((row) => ({
                              sequence: row.sequence,
                              label: row.label ?? `Instalment ${row.sequence}`,
                              amount: Number(row.amount) || 0,
                              due_date: row.due_date ?? "",
                            }))
                          );
                          setCustomScheduleOpen(true);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                        Customise schedule
                      </Button>
                    )}
                  </div>
                  <div className="rounded-xl border border-border/60 overflow-hidden">
                    <table className="w-full text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border/60">
                          <th className="text-left font-medium text-muted-foreground py-2 px-3">Instalment</th>
                          <th className="text-right font-medium text-muted-foreground py-2 px-3">Amount</th>
                          <th className="text-center font-medium text-muted-foreground py-2 px-3">Payment status</th>
                          <th className="text-right font-medium text-muted-foreground py-2 px-3">Due date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentSchedule.map((row) => {
                          const breakdown = installmentBreakdown?.find(
                            (b) => b.sequence === row.sequence
                          );

                          const displayAmount = breakdown
                            ? Number(breakdown.amount_due)
                            : Number(row.amount);

                          return (
                            <tr key={row.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                              <td className="py-2 px-3 text-muted-foreground">{row.label ?? `Instalment ${row.sequence}`}</td>
                              <td className="py-2 px-3 text-right font-medium">
                                {formatCurrency(displayAmount)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {breakdown ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <FinanceStatusBadge
                                      status={breakdown.payment_status}
                                      label={
                                        breakdown.payment_status === "unpaid"
                                          ? "Not paid"
                                          : breakdown.payment_status === "partial"
                                            ? "Partially paid"
                                            : "Paid"
                                      }
                                      className="text-xs uppercase"
                                    />
                                    {(breakdown.amount_paid > 0 ||
                                      breakdown.remaining_amount > 0) && (
                                      <span className="text-[10px] text-muted-foreground">
                                        £{Number(breakdown.amount_paid).toFixed(2)} of £
                                        {Number(breakdown.amount_due).toFixed(2)} paid
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <FinanceStatusBadge status="unpaid" label="Not paid" className="text-xs uppercase" />
                                )}
                              </td>
                              <td className="py-2 px-3 text-right text-muted-foreground">{row.due_date ? format(new Date(row.due_date), "d MMM yyyy") : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {hasInstalmentPayments && (
                    <p className="text-[10px] text-muted-foreground italic">
                      Schedule cannot be customised after installment payments have been recorded.
                    </p>
                  )}
                </div>
              )}

              {/* Cashback Section */}
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm text-muted-foreground">Cashback</span>
                  {cashback ? (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-600 text-white">
                        <Gift className="h-3 w-3 mr-1" />
                        Applied
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-md uppercase tracking-wide text-[10px]"
                        onClick={() => {
                          if (applicationId) {
                            removeCashback.mutate({ applicationId });
                          }
                        }}
                        disabled={removeCashback.isPending}
                      >
                        {removeCashback.isPending ? "Removing..." : "Remove"}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-md uppercase tracking-wide text-xs"
                      onClick={() => setCashbackDialogOpen(true)}
                    >
                      <Gift className="h-3 w-3 mr-1" />
                      Apply
                    </Button>
                  )}
                </div>
                {cashback && (
                  <p className="text-xs text-muted-foreground">
                    {cashback.campaign?.name ?? (cashback.is_denormalized_only ? "Imported/historical cashback" : "Cashback")} - £{cashback.cashback_amount.toFixed(2)}
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
                        className="rounded-md uppercase tracking-wide text-[10px]"
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
                      className="rounded-md uppercase tracking-wide text-xs"
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
                      className="rounded-md uppercase tracking-wide text-xs"
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

              {/* Installment progress – only when schedule exists and total_due > 0 */}
              {paymentSummary && paymentSummary.total_due > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm text-muted-foreground">Installment progress</span>
                    <FinanceStatusBadge
                      status={paymentSummary.payment_status}
                      label={
                        paymentSummary.payment_status === "fully_paid"
                          ? "Fully paid"
                          : paymentSummary.payment_status === "partially_paid"
                            ? "Partially paid"
                            : "Unpaid"
                      }
                      className="text-xs sm:text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Progress
                      value={Math.min(100, (Number(paymentSummary.total_paid) / Number(paymentSummary.total_due)) * 100)}
                      className="h-2"
                    />
                    <p className="text-xs sm:text-sm font-medium">
                      {formatCurrency(Number(paymentSummary.total_paid))} of {formatCurrency(Number(paymentSummary.total_due))} paid
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Remaining: {formatCurrency(Number(paymentSummary.remaining_balance))}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground italic">
                      {application.deposit_payment_intent_id
                        ? "Deposit has been recorded separately from these instalments."
                        : "Deposit will be recorded separately from these instalments when it is paid."}
                    </p>
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full rounded-md uppercase tracking-wide gap-2 mt-4 bg-black hover:bg-yellow-500 hover:text-black text-white border-0 justify-between transition-colors"
                onClick={() => {
                  setManualPaymentInitialType("deposit");
                  setManualPaymentOpen(true);
                }}
              >
                <span>Record Manual Payment</span>
                <CreditCard className="h-4 w-4 ml-2 shrink-0" />
              </Button>
            </CardContent>
          </Card>

          {applicationId && (
            <EarlyCheckInSection
              applicationId={applicationId}
              applicationStatus={application.status}
              assignedStudioId={application.assigned_studio_id}
              contractStart={application.contract?.contract_start ?? null}
              createSheetOpen={earlyCheckInSheetOpen}
              onCreateSheetOpenChange={setEarlyCheckInSheetOpen}
            />
          )}

          {isFlexiblePlaceholderContract && (requestedFlexibleStart || requestedFlexibleEnd) && (
            <Card className="rounded-3xl border border-dashed border-border/70">
              <CardHeader>
                <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide">
                  Flexible stay request
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  This application was started from a flexible stay placeholder contract. The student requested the dates below; use Amend booking to set the real contract dates and grade.
                </p>
                <p>
                  <span className="font-semibold">Requested start:</span>{" "}
                  {requestedFlexibleStart || "—"}
                </p>
                <p>
                  <span className="font-semibold">Requested end:</span>{" "}
                  {requestedFlexibleEnd || "—"}
                </p>
                {amendEligibility.allowed && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="rounded-md uppercase tracking-wide text-xs mt-2"
                    onClick={() => setAmendBookingOpen(true)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Amend booking from request
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Agreements & Studio Assignment (combined section) */}
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base sm:text-lg font-display uppercase tracking-wide flex items-center gap-2">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="text-sm sm:text-base">Agreements & Studio</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Agreements block */}
              <div className="space-y-3">
                <div className="flex flex-col gap-3">
                  <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Agreements
                  </h3>
                  <div className="flex flex-col xl:flex-row xl:flex-wrap gap-2 w-full">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-md uppercase tracking-wide text-xs w-full xl:w-auto whitespace-normal h-auto min-h-9 py-2"
                      onClick={() => void refreshAgreementStatus()}
                      disabled={refreshingAgreementStatus || !applicationId}
                    >
                      {refreshingAgreementStatus ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 shrink-0 animate-spin" />
                          Refreshing…
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-3 w-3 mr-1 shrink-0" />
                          Refresh agreement status
                        </>
                      )}
                    </Button>
                    {agreementEnvelopeState.canResend && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-md uppercase tracking-wide text-xs w-full xl:w-auto whitespace-normal h-auto min-h-9 py-2"
                        onClick={() => void handleResendAgreements()}
                        disabled={resendAgreements.isPending}
                      >
                        {resendAgreements.isPending ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 shrink-0 animate-spin" />
                            Sending…
                          </>
                        ) : (
                          <>
                            <Send className="h-3 w-3 mr-1 shrink-0" />
                            Resend agreements (updated terms)
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {agreementEnvelopeState.needsAttention && (
                  <Alert className="rounded-2xl border-amber-200 bg-amber-50/80">
                    <AlertTitle className="text-sm text-amber-900">
                      Agreements may be outdated
                    </AlertTitle>
                    <AlertDescription className="text-xs text-amber-800">
                      Booking terms were changed. Resend agreements for signature or upload new
                      signed PDFs so documents match the current contract.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {["tenancy", "guarantor"].map((type) => {
                    const envelope = getActiveEnvelopeForType(
                      application.docusign_envelopes,
                      type,
                    );
                    const isTenancy = type === "tenancy";
                    const downloadKey = envelope?.envelope_id ?? `${application.id}-${type}`;
                    const hasEnvelope = !!envelope;
                    const progressLabel = envelope ? getEnvelopeProgressLabel(envelope) : null;
                    const recipientStatuses = envelope
                      ? getEnvelopeRecipientStatuses(envelope)
                      : [];

                    return (
                      <div
                        key={type}
                        className="rounded-2xl border border-border/60 p-4 space-y-3 h-full flex flex-col"
                      >
                        {/* Title + description (single column) */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <h4 className="font-semibold text-sm md:text-base leading-tight">
                              {isTenancy ? "Tenancy Agreement" : "Guarantor Agreement"}
                            </h4>
                          </div>
                          <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug">
                            {hasEnvelope
                              ? getEnvelopeDescription(
                                  envelope,
                                  isTenancy ? "Tenancy agreement" : "Guarantor agreement",
                                )
                              : isTenancy
                                ? "Tenancy agreement not uploaded or generated yet."
                                : "Guarantor agreement not uploaded or generated yet."}
                          </p>
                          {recipientStatuses.length > 0 && !isEnvelopeCompleted(envelope?.status) && (
                            <ul className="space-y-1 pt-1">
                              {recipientStatuses.map((recipient) => {
                                const done = isRecipientSigningComplete(recipient.status);
                                return (
                                  <li
                                    key={`${recipient.roleName}-${recipient.email}`}
                                    className="flex items-center justify-between gap-2 text-[10px] sm:text-[11px]"
                                  >
                                    <span className="text-muted-foreground truncate">
                                      {recipient.roleName ?? "Signer"}
                                      {recipient.name ? `: ${recipient.name}` : ""}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[10px] shrink-0",
                                        done
                                          ? "border-green-300 text-green-800 bg-green-50"
                                          : "border-border text-muted-foreground",
                                      )}
                                    >
                                      {formatRecipientStatusLabel(recipient.status)}
                                    </Badge>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        {/* Divider */}
                        <div className="border-t border-border/50 my-2" />

                        {/* Buttons block */}
                        <div className="space-y-2">
                          {canDownloadEnvelope(envelope || {}) && (
                            <Button
                              variant="default"
                              size="sm"
                              className="w-full rounded-lg uppercase tracking-wide gap-2 text-[11px] md:text-xs lg:text-sm bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center"
                              onClick={() =>
                                downloadAgreement(
                                  envelope?.envelope_id ?? "",
                                  type as "tenancy" | "guarantor"
                                )
                              }
                              disabled={!!envelope && downloadingAgreementId === downloadKey}
                            >
                              {envelope && downloadingAgreementId === downloadKey ? (
                                <span>Previewing...</span>
                              ) : (
                                <span>Preview / Download</span>
                              )}
                            </Button>
                          )}

                          {/* Staff upload control */}
                          {(() => {
                            const inputId = `staff-upload-${type}-${application.id}`;
                            const isUploading =
                              type === "tenancy" ? uploadingTenancy : uploadingGuarantor;
                            return (
                              <>
                                <input
                                  id={inputId}
                                  type="file"
                                  accept="application/pdf"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      void handleStaffUploadSignedDocument(
                                        type as "tenancy" | "guarantor",
                                        file
                                      );
                                      e.target.value = "";
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="w-full rounded-lg uppercase tracking-wide gap-2 text-[11px] md:text-xs lg:text-sm flex items-center justify-center"
                                  onClick={() => {
                                    const input = document.getElementById(
                                      inputId
                                    ) as HTMLInputElement | null;
                                    input?.click();
                                  }}
                                  disabled={isUploading}
                                >
                                  {isUploading ? (
                                    <span>Uploading...</span>
                                  ) : (
                                    <span>Upload Signed PDF</span>
                                  )}
                                </Button>
                              </>
                            );
                          })()}
                        </div>

                        {/* Second divider */}
                        <div className="border-t border-border/50 my-2" />

                        {/* Last updated + status at bottom */}
                        <div className="mt-auto flex flex-col items-start gap-1.5 text-[11px] sm:text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span>
                              {envelope?.updated_at
                                ? `Updated ${format(new Date(envelope.updated_at), "d MMM yyyy")}`
                                : "Not updated yet"}
                            </span>
                          </div>
                          {hasEnvelope && (
                            <div>
                              {isEnvelopeSuperseded(envelope?.status) ? (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] sm:text-xs border-amber-300 text-amber-800 bg-amber-50"
                                >
                                  Superseded
                                </Badge>
                              ) : isEnvelopeCompleted(envelope?.status) ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1 text-[11px] sm:text-xs font-semibold text-white uppercase tracking-wide">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Completed
                                </span>
                              ) : progressLabel ? (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] sm:text-xs border-amber-300 text-amber-800 bg-amber-50"
                                >
                                  {progressLabel}
                                </Badge>
                              ) : recipientStatuses.length > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] sm:text-xs border-amber-300 text-amber-800 bg-amber-50"
                                >
                                  Awaiting signatures
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[11px] sm:text-xs">
                                  {envelope?.status
                                    ? formatEnvelopeStatus(envelope.status)
                                    : "Not sent"}
                                </Badge>
                              )}
                            </div>
                          )}
                          {!hasEnvelope && (
                            <Badge
                              variant="outline"
                              className="text-[11px] sm:text-xs text-muted-foreground"
                            >
                              Not uploaded
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Divider between agreements and studio */}
              <div className="border-t border-border/60 pt-4 space-y-3">
                <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span>Studio Assignment</span>
                </h3>

                <div className="space-y-4 rounded-2xl bg-muted/40 p-4 sm:p-5">
                  <div>
                    <Label>Assign/Reassign Studio</Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      Available studios for this application&apos;s room grade. Search by studio number.
                    </p>
                    <Popover open={studioDropdownOpen} onOpenChange={setStudioDropdownOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={studioDropdownOpen}
                          className={cn(
                            "w-full justify-between rounded-md font-normal mt-0",
                            !(selectedStudio || application.assigned_studio_id) && "text-muted-foreground"
                          )}
                        >
                          <span className="truncate">
                            {selectedStudio || application.assigned_studio_id
                              ? studios?.find((s) => s.id === (selectedStudio || application.assigned_studio_id))?.studio_number ?? "Select a studio"
                              : "Select a studio"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Search studio by number..."
                            value={studioSearchQuery}
                            onValueChange={setStudioSearchQuery}
                          />
                          <CommandList>
                            <CommandEmpty>No studio found.</CommandEmpty>
                            <CommandGroup>
                              {filteredStudiosForAssignment.map((studio) => (
                                <CommandItem
                                  key={studio.id}
                                  value={studio.studio_number ?? studio.id}
                                  onSelect={() => {
                                    setSelectedStudio(studio.id);
                                    setStudioDropdownOpen(false);
                                    setStudioSearchQuery("");
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      (selectedStudio || application.assigned_studio_id) === studio.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {studio.studio_number} - {studio.status}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {studios?.length === 0 && application?.studio_grade_id && (
                      <p className="text-xs text-muted-foreground mt-2">
                        No available studios for this room grade.
                      </p>
                    )}
                  </div>

                  {application.assigned_studio && (
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">
                        Currently Assigned
                      </p>
                      <p className="font-medium text-sm sm:text-base">
                        {application.assigned_studio.studio_number}
                      </p>
                    </div>
                  )}

                  {selectedStudio && selectedStudio !== application.assigned_studio_id && (
                    <Button
                      onClick={() => reassignStudio.mutate(selectedStudio)}
                      className="w-full rounded-md uppercase tracking-wide"
                      disabled={reassignStudio.isPending}
                    >
                      {reassignStudio.isPending ? "Reassigning..." : "Reassign Studio"}
                    </Button>
                  )}
                </div>

                {/* Application notes (staff-only) */}
                <div className="space-y-2 pt-4 border-t border-border/60 rounded-2xl bg-muted/40 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Application notes
                    </span>
                    {((application as any)?.internal_notes as string | null) && (
                      <Badge variant="outline" className="text-[10px] sm:text-xs">
                        Saved
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    Staff-only notes for this application. Not visible to students.
                  </p>
                  <Textarea
                    value={applicationNotes}
                    onChange={(e) => {
                      setApplicationNotesDirty(true);
                      setApplicationNotes(e.target.value);
                    }}
                    placeholder="Add notes here"
                    className="min-h-[80px] sm:min-h-[100px] rounded-2xl resize-none bg-background"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="rounded-md uppercase tracking-wide text-xs"
                      variant="outline"
                      disabled={updateApplicationNotes.isPending}
                      onClick={() => updateApplicationNotes.mutate(applicationNotes)}
                    >
                      {updateApplicationNotes.isPending ? "Saving..." : "Save notes"}
                    </Button>
                  </div>
                </div>
              </div>
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
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row flex-wrap gap-3">
              <Button
                variant="outline"
                className="rounded-md tracking-wide gap-2 text-xs sm:text-sm w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white hover:text-white border-0"
                onClick={() => handleSendNotification("Deposit Reminder", "Please complete your deposit payment to proceed with your application.")}
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send deposit reminder</span>
                <span className="sm:hidden">Deposit reminder</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-md tracking-wide gap-2 text-xs sm:text-sm w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white hover:text-white border-0"
                disabled={unpaidInstallments.length === 0}
                onClick={() => {
                  if (unpaidInstallments.length > 0) {
                    setSelectedInvoiceInstallmentId(unpaidInstallments[0].installment_id);
                    setInstallmentInvoiceDialogOpen(true);
                  }
                }}
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send installment invoice</span>
                <span className="sm:hidden">Installment invoice</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-md tracking-wide gap-2 text-xs sm:text-sm w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white hover:text-white border-0"
                onClick={() => handleSendNotification("Signature Reminder", "Please complete signing your tenancy agreement.")}
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send signature reminder</span>
                <span className="sm:hidden">Signature reminder</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-md tracking-wide gap-2 text-xs sm:text-sm w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white hover:text-white border-0"
                onClick={() => handleSendNotification("Application Confirmed", "Your application has been confirmed! Welcome to Urban Hub.")}
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send confirmation</span>
                <span className="sm:hidden">Confirmation</span>
              </Button>
              <Button
                variant="outline"
                className="rounded-md tracking-wide gap-2 text-xs sm:text-sm w-full sm:w-auto bg-primary hover:bg-primary/80 text-white font-semibold border-0"
                onClick={handleDownloadApplicationCsv}
              >
                <Download className="h-4 w-4" />
                <span>Download CSV</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {applicationId && (
        <ManualPaymentDialog
          open={manualPaymentOpen}
          onOpenChange={(open) => {
            setManualPaymentOpen(open);
            if (!open) setManualPaymentInitialType("deposit");
          }}
          applicationId={applicationId}
          paymentType={manualPaymentInitialType}
        />
      )}

      {/* Installment Invoice Dialog */}
      <Dialog open={installmentInvoiceDialogOpen} onOpenChange={setInstallmentInvoiceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-display uppercase tracking-wide">
              Send Installment Invoice
            </DialogTitle>
            <DialogDescription>
              Choose which unpaid or partially paid installment to email an invoice for.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {unpaidInstallments.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="installment-select">Select installment</Label>
                <Select
                  value={selectedInvoiceInstallmentId}
                  onValueChange={setSelectedInvoiceInstallmentId}
                >
                  <SelectTrigger id="installment-select">
                    <SelectValue placeholder="Choose installment" />
                  </SelectTrigger>
                  <SelectContent>
                    {unpaidInstallments.map((inst) => (
                      <SelectItem key={inst.installment_id} value={inst.installment_id}>
                        Instalment {inst.sequence} – £
                        {Number(inst.amount_due).toFixed(2)} (Due:{" "}
                        {new Date(inst.due_date).toLocaleDateString("en-GB")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                There are no unpaid or partially paid installments for this application.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInstallmentInvoiceDialogOpen(false)}
              className="rounded-md uppercase tracking-wide"
            >
              Cancel
            </Button>
            <Button
              className="rounded-md uppercase tracking-wide"
              onClick={handleSendInstallmentInvoice}
              disabled={
                sendingInstallmentInvoice ||
                !selectedInvoiceInstallmentId ||
                unpaidInstallments.length === 0
              }
            >
              {sendingInstallmentInvoice ? "Sending..." : "Send Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              className="rounded-md uppercase tracking-wide"
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
              className="rounded-md uppercase tracking-wide"
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
              className="rounded-md uppercase tracking-wide"
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
              className="rounded-md uppercase tracking-wide"
            >
              {applyDiscount.isPending ? "Applying..." : "Apply Discount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partner Referral Dialog */}
      <Dialog
        open={partnerDialogOpen}
        onOpenChange={(open) => {
          setPartnerDialogOpen(open);
          if (!open) {
            setPartnerDropdownOpen(false);
            setPartnerSearchQuery("");
          }
        }}
      >
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
              <Popover open={partnerDropdownOpen} onOpenChange={setPartnerDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={partnerDropdownOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {selectedPartner
                        ? `${partners.find((partner) => partner.id === selectedPartner)?.name ?? "Selected partner"}`
                        : "Select partner"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder="Search partner..."
                      value={partnerSearchQuery}
                      onValueChange={setPartnerSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No partner found.</CommandEmpty>
                      <CommandGroup>
                        {filteredPartners.map((partner) => (
                          <CommandItem
                            key={partner.id}
                            value={`${partner.name} ${partner.commission_percentage}`}
                            onSelect={() => {
                              setSelectedPartner(partner.id);
                              setPartnerDropdownOpen(false);
                              setPartnerSearchQuery("");
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${selectedPartner === partner.id ? "opacity-100" : "opacity-0"}`}
                            />
                            <span className="truncate">{partner.name} ({partner.commission_percentage}%)</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
              className="rounded-md uppercase tracking-wide"
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
              className="rounded-md uppercase tracking-wide"
            >
              {createPartnerReferral.isPending ? "Assigning..." : "Assign Partner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customise payment schedule Dialog */}
      <Dialog open={customScheduleOpen} onOpenChange={setCustomScheduleOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-display uppercase tracking-wide">
              Customise payment schedule
            </DialogTitle>
            <DialogDescription>
              Enter amounts per instalment. Total must equal the contract total. Saving creates a new contract and plan for this student only; the default contract is unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex justify-between items-center text-sm font-semibold">
              <span>Contract total</span>
              <span>{formatCurrency(application?.total_contract_value ?? 0)}</span>
            </div>
            <div className="space-y-3">
              {customInstallments.map((inst, index) => (
                <div key={inst.sequence} className="grid grid-cols-[1fr_100px_1fr] gap-2 items-center">
                  <Label className="text-xs col-span-1 truncate">{inst.label}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="col-span-1"
                    value={inst.amount > 0 ? inst.amount : ""}
                    placeholder="0"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      const next = [...customInstallments];
                      next[index] = { ...next[index], amount: isNaN(v) ? 0 : v };
                      setCustomInstallments(next);
                    }}
                  />
                  <Input
                    type="date"
                    className="col-span-1"
                    value={inst.due_date}
                    onChange={(e) => {
                      const next = [...customInstallments];
                      next[index] = { ...next[index], due_date: e.target.value };
                      setCustomInstallments(next);
                    }}
                  />
                </div>
              ))}
            </div>
            {customInstallments.length > 0 && (() => {
              const sum = customInstallments.reduce((s, i) => s + i.amount, 0);
              const total = Number(application?.total_contract_value ?? 0);
              const remaining = Math.round((total - sum) * 100) / 100;
              const valid = Math.abs(remaining) <= 0.01;
              return (
                <div className="flex flex-wrap justify-between items-center gap-2 text-sm pt-2 border-t">
                  <span className={valid ? "text-muted-foreground" : "text-amber-600 font-medium"}>
                    Allocated: {formatCurrency(sum)} · Remaining: {formatCurrency(remaining)}
                  </span>
                  {!valid && remaining > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        const lastIndex = customInstallments.length - 1;
                        const sumPrev = customInstallments.slice(0, lastIndex).reduce((s, i) => s + i.amount, 0);
                        const total = Number(application?.total_contract_value ?? 0);
                        const lastAmount = Math.round((total - sumPrev) * 100) / 100;
                        const next = [...customInstallments];
                        next[lastIndex] = { ...next[lastIndex], amount: lastAmount };
                        setCustomInstallments(next);
                      }}
                    >
                      Put remaining in last instalment
                    </Button>
                  )}
                </div>
              );
            })()}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCustomScheduleOpen(false)}
              className="rounded-md uppercase tracking-wide"
            >
              Cancel
            </Button>
            <Button
              className="rounded-md uppercase tracking-wide"
              disabled={
                createCustomContract.isPending ||
                customInstallments.length === 0 ||
                customInstallments.some((i) => !i.due_date) ||
                Math.abs(customInstallments.reduce((s, i) => s + i.amount, 0) - Number(application?.total_contract_value ?? 0)) > 0.01
              }
              onClick={async () => {
                const total = Number(application?.total_contract_value ?? 0);
                const sum = customInstallments.reduce((s, i) => s + i.amount, 0);
                if (Math.abs(sum - total) > 0.01) {
                  toast({
                    title: "Invalid amounts",
                    description: `Total of instalments must equal contract total (${formatCurrency(total)}).`,
                    variant: "destructive",
                  });
                  return;
                }
                const studentName =
                  step1Data?.first_name && step1Data?.last_name
                    ? `${step1Data.first_name} ${step1Data.last_name}`.trim()
                    : "Student";
                try {
                  await createCustomContract.mutateAsync({
                    applicationId: applicationId!,
                    studentDisplayName: studentName,
                    installments: customInstallments.map((i) => ({
                      sequence: i.sequence,
                      label: i.label,
                      amount: Math.round(i.amount * 100) / 100,
                      due_date: i.due_date,
                    })),
                  });
                  toast({
                    title: "Schedule customised",
                    description: "A new contract and payment plan have been created for this student.",
                  });
                  setCustomScheduleOpen(false);
                } catch (err: unknown) {
                  toast({
                    title: "Error",
                    description: err instanceof Error ? err.message : "Failed to save custom schedule.",
                    variant: "destructive",
                  });
                }
              }}
            >
              {createCustomContract.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                "Save custom schedule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Extension Sheet */}
      <Sheet open={createExtensionOpen} onOpenChange={setCreateExtensionOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-4 sm:p-6",
            isMobile ? "max-h-[90vh] mb-0 rounded-t-2xl" : "h-full w-full sm:max-w-md",
            "[&>button]:!flex [&>button]:!h-8 [&>button]:!w-8 [&>button]:!items-center [&>button]:!justify-center",
            "[&>button]:!rounded-md [&>button]:!bg-red-500 [&>button]:!text-white [&>button]:!opacity-100",
            "[&>button]:!shadow-md [&>button]:transition-colors [&>button]:hover:!bg-red-600",
            "[&>button]:focus:!ring-2 [&>button]:focus:!ring-white/60 [&>button]:focus:!ring-offset-2 [&>button]:focus:!ring-offset-red-500",
          )}
        >
          <SheetHeader className="flex-shrink-0 text-left space-y-0 pr-10">
            <SheetTitle className="text-xl font-display uppercase tracking-wide">
              Create contract extension
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-4 px-1.5 py-4">
            <div className="space-y-2">
              <Label htmlFor="ext-start">Extension start date</Label>
              <Input
                id="ext-start"
                type="date"
                value={extensionForm.extensionStartDate}
                onChange={(e) => {
                  const extensionStartDate = e.target.value;
                  setExtensionForm((p) => ({
                    ...p,
                    extensionStartDate,
                    extensionEndDate: computeContractEndDate(
                      extensionStartDate,
                      p.extensionWeeks,
                      p.extensionDays,
                    ),
                  }));
                }}
                className="rounded-lg w-full focus-visible:ring-offset-0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ext-end">Extension end date</Label>
              <Input
                id="ext-end"
                type="date"
                value={extensionForm.extensionEndDate}
                min={
                  extensionForm.extensionStartDate
                    ? computeContractEndDate(extensionForm.extensionStartDate, 1, 0)
                    : undefined
                }
                disabled={!extensionForm.extensionStartDate}
                onChange={(e) => {
                  const extensionEndDate = e.target.value;
                  setExtensionForm((p) => {
                    const { weeks, extraDays: days } = datesToWeeksAndExtraDays(
                      p.extensionStartDate,
                      extensionEndDate,
                    );
                    return {
                      ...p,
                      extensionEndDate,
                      extensionWeeks: weeks,
                      extensionDays: days,
                    };
                  });
                }}
                className="rounded-lg w-full focus-visible:ring-offset-0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ext-weeks">Extension weeks</Label>
              <Input
                id="ext-weeks"
                type="number"
                min={1}
                max={52}
                value={extensionForm.extensionWeeks}
                onChange={(e) => {
                  const extensionWeeks = Math.max(1, parseInt(e.target.value, 10) || 1);
                  setExtensionForm((p) => ({
                    ...p,
                    extensionWeeks,
                    extensionEndDate: computeContractEndDate(
                      p.extensionStartDate,
                      extensionWeeks,
                      p.extensionDays,
                    ),
                  }));
                }}
                className="rounded-lg w-full focus-visible:ring-offset-0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ext-days">Extension days</Label>
              <Input
                id="ext-days"
                type="number"
                min={0}
                max={6}
                value={extensionForm.extensionDays}
                onChange={(e) => {
                  const extensionDays = Math.min(
                    6,
                    Math.max(0, parseInt(e.target.value, 10) || 0),
                  );
                  setExtensionForm((p) => ({
                    ...p,
                    extensionDays,
                    extensionEndDate: computeContractEndDate(
                      p.extensionStartDate,
                      p.extensionWeeks,
                      extensionDays,
                    ),
                  }));
                }}
                className="rounded-lg w-full focus-visible:ring-offset-0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ext-instalments">Number of installments</Label>
              <Input
                id="ext-instalments"
                type="number"
                min={1}
                max={12}
                value={extensionForm.numInstallments}
                onChange={(e) =>
                  setExtensionForm((p) => ({
                    ...p,
                    numInstallments: Math.max(1, parseInt(e.target.value, 10) || 1),
                  }))
                }
                className="rounded-lg w-full focus-visible:ring-offset-0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ext-weekly">Weekly price (£)</Label>
              <Input
                id="ext-weekly"
                type="number"
                min={0}
                step={0.01}
                value={extensionForm.weeklyPrice || ""}
                onChange={(e) =>
                  setExtensionForm((p) => ({ ...p, weeklyPrice: parseFloat(e.target.value) || 0 }))
                }
                className="rounded-lg w-full focus-visible:ring-offset-0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ext-deposit">Deposit (£)</Label>
              <Input
                id="ext-deposit"
                type="number"
                min={0}
                step={0.01}
                value={extensionForm.depositAmount || ""}
                onChange={(e) =>
                  setExtensionForm((p) => ({ ...p, depositAmount: parseFloat(e.target.value) || 0 }))
                }
                className="rounded-lg w-full focus-visible:ring-offset-0"
              />
            </div>
            </div>
          </div>
          <SheetFooter className="flex-shrink-0 flex-col gap-2 pt-4 mt-0 border-t border-border/60 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => setCreateExtensionOpen(false)}
              className="w-full sm:w-auto rounded-md uppercase tracking-wide"
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto rounded-md uppercase tracking-wide"
              disabled={
                createExtension.isPending ||
                !extensionForm.extensionStartDate ||
                extensionForm.weeklyPrice <= 0
              }
              onClick={async () => {
                const studentName =
                  step1Data?.first_name && step1Data?.last_name
                    ? `${step1Data.first_name} ${step1Data.last_name}`.trim()
                    : "Student";
                try {
                  const result = await createExtension.mutateAsync({
                    originalApplicationId: applicationId!,
                    extensionWeeks: extensionForm.extensionWeeks,
                    extensionDays: extensionForm.extensionDays,
                    numInstallments: extensionForm.numInstallments,
                    extensionStartDate: extensionForm.extensionStartDate,
                    weeklyPrice: extensionForm.weeklyPrice,
                    depositAmount: extensionForm.depositAmount,
                    studentDisplayName: studentName,
                  });
                  toast({
                    title: "Extension created",
                    description: "A new application has been created for the extension period. You can complete the booking journey from there.",
                  });
                  setCreateExtensionOpen(false);
                  navigate(`/admin/applications/${result.applicationId}`);
                } catch (err: unknown) {
                  toast({
                    title: "Error",
                    description: err instanceof Error ? err.message : "Failed to create extension.",
                    variant: "destructive",
                  });
                }
              }}
            >
              {createExtension.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating…
                </>
              ) : (
                "Create extension"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Upload Document Dialog (replace rejected OR add additional) */}
      <Dialog
        open={uploadDialogOpen}
        onOpenChange={(open) => {
          setUploadDialogOpen(open);
          if (!open) {
            setUploadFile(null);
            setSelectedRejectedDoc(null);
            setAdditionalDocLabel("");
            setUploadDialogMode("rejected");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {uploadDialogMode === "additional" ? "Upload additional document" : "Upload new document"}
            </DialogTitle>
            <DialogDescription>
              {uploadDialogMode === "additional"
                ? "Attach any supporting file to this application (separate from agreements)."
                : "Upload a new document to replace the rejected one. The student will be notified."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {uploadDialogMode === "rejected" && selectedRejectedDoc && (
              <>
                <div>
                  <Label className="text-sm font-medium">Document type</Label>
                  <p className="text-sm text-muted-foreground capitalize mt-1">
                    {formatDocumentTypeTitle(selectedRejectedDoc.documentType)}
                  </p>
                </div>
                {selectedRejectedDoc.notes && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-xs font-medium text-destructive mb-1">Rejection reason:</p>
                    <p className="text-xs text-destructive/90">{selectedRejectedDoc.notes}</p>
                  </div>
                )}
              </>
            )}
            {uploadDialogMode === "additional" && (
              <div>
                <Label htmlFor="additional-doc-label" className="text-sm font-medium">
                  Label (optional)
                </Label>
                <Input
                  id="additional-doc-label"
                  className="mt-1"
                  placeholder="e.g. University offer letter"
                  value={additionalDocLabel}
                  onChange={(e) => setAdditionalDocLabel(e.target.value)}
                />
              </div>
            )}
            <div>
              <Label htmlFor="file-upload" className="text-sm font-medium">
                Select file
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
          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setUploadDialogOpen(false);
                setUploadFile(null);
                setSelectedRejectedDoc(null);
                setAdditionalDocLabel("");
              }}
              disabled={uploadDocument.isPending}
              className="w-full sm:w-auto rounded-md uppercase tracking-wide"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!uploadFile || !applicationId) return;
                if (uploadDialogMode === "rejected" && !selectedRejectedDoc) return;

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
                  const documentType =
                    uploadDialogMode === "additional"
                      ? "additional"
                      : selectedRejectedDoc!.documentType;

                  await uploadDocument.mutateAsync({
                    file: uploadFile,
                    applicationId,
                    documentType,
                    uploadedBy: user.id,
                    notes:
                      uploadDialogMode === "additional"
                        ? additionalDocLabel.trim() || undefined
                        : undefined,
                  });

                  if (uploadDialogMode === "rejected" && application?.student_id && selectedRejectedDoc) {
                    try {
                      await createNotification.mutateAsync({
                        user_id: application.student_id,
                        title: "New Document Uploaded",
                        message: `A new ${formatDocumentTypeTitle(selectedRejectedDoc.documentType)} document has been uploaded for your application. Please review it in your portal.`,
                        type: "info",
                        link: `/portal/documents`,
                      });
                    } catch (notifError) {
                      console.error("Error creating notification:", notifError);
                    }
                  }

                  setUploadDialogOpen(false);
                  setUploadFile(null);
                  setSelectedRejectedDoc(null);
                  setAdditionalDocLabel("");

                  toast({
                    title: "Document uploaded",
                    description:
                      uploadDialogMode === "additional"
                        ? "Additional document uploaded and pending review."
                        : "The new document has been uploaded and the student has been notified.",
                  });
                } catch (error) {
                  console.error("Failed to upload document:", error);
                }
              }}
              disabled={
                !uploadFile ||
                uploadDocument.isPending ||
                (uploadDialogMode === "rejected" && !selectedRejectedDoc)
              }
              className="w-full sm:w-auto rounded-md uppercase tracking-wide"
            >
              {uploadDocument.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CheckInCheckOutDialog
        open={checkInOutDialogOpen}
        onOpenChange={setCheckInOutDialogOpen}
        applicationId={applicationId!}
        studentName={
          step1Data?.first_name && step1Data?.last_name
            ? `${step1Data.first_name} ${step1Data.last_name}`
            : undefined
        }
        contractStart={application?.contract?.contract_start}
        contractEnd={application?.contract?.contract_end}
        actualCheckInDate={(application as { actual_check_in_date?: string | null } | undefined)?.actual_check_in_date}
        actualCheckOutDate={(application as { actual_check_out_date?: string | null } | undefined)?.actual_check_out_date}
        checkInNotes={(application as { check_in_notes?: string | null } | undefined)?.check_in_notes}
        checkOutNotes={(application as { check_out_notes?: string | null } | undefined)?.check_out_notes}
      />

      {/* Early Checkout Sheet */}
      <Sheet open={earlyCheckoutSheetOpen} onOpenChange={setEarlyCheckoutSheetOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 overflow-hidden p-4 sm:p-6",
            isMobile ? "max-h-[90vh] mb-0 rounded-t-2xl" : "h-full w-full sm:max-w-md",
            "[&>button]:!flex [&>button]:!h-8 [&>button]:!w-8 [&>button]:!items-center [&>button]:!justify-center",
            "[&>button]:!rounded-md [&>button]:!bg-red-500 [&>button]:!text-white [&>button]:!opacity-100",
            "[&>button]:!shadow-md [&>button]:transition-colors [&>button]:hover:!bg-red-600",
            "[&>button]:focus:!ring-2 [&>button]:focus:!ring-white/60 [&>button]:focus:!ring-offset-2 [&>button]:focus:!ring-offset-red-500",
          )}
        >
          <SheetHeader className="flex-shrink-0 text-left space-y-1 pr-10">
            <SheetTitle className="text-xl font-display uppercase tracking-wide">
              Early checkout
            </SheetTitle>
            <SheetDescription>
              End this student&apos;s stay before the contract end date. The studio will be released for reallocation immediately.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="space-y-4 px-1.5 py-4">
              <Alert>
                <AlertTitle className="text-sm font-semibold">No refunds</AlertTitle>
                <AlertDescription className="text-sm">
                  This is the student&apos;s choice to leave early. Payment history and instalment schedules are not changed. No refunds will be issued.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label htmlFor="early_checkout_date">Checkout date</Label>
                <Input
                  id="early_checkout_date"
                  type="date"
                  value={earlyCheckoutDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setEarlyCheckoutDate(e.target.value)}
                  className="rounded-md"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="early_checkout_notes">Reason / notes (optional)</Label>
                <Textarea
                  id="early_checkout_notes"
                  value={earlyCheckoutNotes}
                  onChange={(e) => setEarlyCheckoutNotes(e.target.value)}
                  placeholder="e.g. Personal reasons — student requested early departure"
                  rows={3}
                  className="rounded-md"
                />
              </div>
            </div>
          </div>
          <SheetFooter className="flex-shrink-0 flex-col gap-2 pt-4 mt-0 border-t border-border/60 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto rounded-md uppercase tracking-wide"
              onClick={() => setEarlyCheckoutSheetOpen(false)}
              disabled={earlyCheckout.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="w-full sm:w-auto rounded-md uppercase tracking-wide bg-amber-600 hover:bg-amber-700"
              onClick={handleEarlyCheckout}
              disabled={earlyCheckout.isPending || !earlyCheckoutDate}
            >
              {earlyCheckout.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm early checkout"
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Discard Draft Dialog */}
      <Dialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-display uppercase tracking-wide">
              Discard draft application
            </DialogTitle>
            <DialogDescription>
              This will permanently delete this draft application and all related data (steps, documents, and payments, if any). This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 text-sm text-muted-foreground">
            <p>
              Use this only for test or abandoned applications that should not appear in reporting or the student portal.
            </p>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto rounded-md uppercase tracking-wide"
              onClick={() => setDiscardDialogOpen(false)}
              disabled={discardDraftApplication.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto rounded-md uppercase tracking-wide"
              onClick={() => discardDraftApplication.mutate()}
              disabled={discardDraftApplication.isPending}
            >
              {discardDraftApplication.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Discarding…
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Discard draft
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {applicationId && application?.contract && (
        <AmendBookingDialog
          open={amendBookingOpen}
          onOpenChange={setAmendBookingOpen}
          applicationId={applicationId}
          academicYearId={application.contract.academic_year_id}
          contractStart={application.contract.contract_start}
          contractEnd={application.contract.contract_end}
          weeks={application.contract.weeks}
          extraDays={application.contract.extra_days ?? 0}
          studioGradeId={application.studio_grade_id}
          weeklyPrice={application.contract.weekly_price_override ?? undefined}
          requestedStart={requestedFlexibleStart}
          requestedEnd={requestedFlexibleEnd}
          isFlexiblePlaceholder={isFlexiblePlaceholderContract}
          docusignEnvelopes={application.docusign_envelopes}
        />
      )}
    </AdminLayout>
  );
};

export default ApplicationDetail;


