import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Dispatch, SetStateAction } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { differenceInYears, format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import {
  useSaveApplicationStep,
  useStudentApplication,
} from "@/hooks/useStudentApplication";
import { useRebookingData } from "@/hooks/useRebooking";
import { useValidateReferralCode } from "@/hooks/useReferralCode";
import { useVerifyPayment } from "@/hooks/useVerifyPayment";
import { useLinkPaymentToApplication } from "@/hooks/useManualPayment";
import PortalLayout from "@/components/portal/PortalLayout";
import { getAllCountries } from "@/utils/countries";
import {
  Loader2,
  CheckCircle2,
  Upload,
  ChevronsUpDown,
  Check,
  FileText,
  RotateCcw,
  Info,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useBrandingSettings } from "@/hooks/useBranding";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import StripePaymentForm from "@/components/StripePaymentForm";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";


const steps = [
  { number: 1, title: "Personal Information" },
  { number: 2, title: "Contact Information" },
  { number: 3, title: "Academic & Additional Details" },
  { number: 4, title: "Documentation" },
  { number: 5, title: "Payment & Guarantor" },
  { number: 6, title: "Agreements & Signing" },
];

const MIN_STEP_NUMBER = steps[0].number;
const MAX_STEP_NUMBER = steps[steps.length - 1].number;

const clampStepNumber = (value: number) =>
  Math.min(Math.max(value, MIN_STEP_NUMBER), MAX_STEP_NUMBER);

const readStoredStep = (applicationId?: string) => {
  if (typeof window === "undefined" || !applicationId) return MIN_STEP_NUMBER;
  const raw = window.sessionStorage.getItem(`wizard-step-${applicationId}`);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? clampStepNumber(parsed) : MIN_STEP_NUMBER;
};

const writeStoredStep = (applicationId: string, step: number) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    `wizard-step-${applicationId}`,
    String(clampStepNumber(step)),
  );
};

// Get all countries from the country-list library
const countries = getAllCountries();

const ethnicityOptions = [
  "White",
  "Black / African / Caribbean / Black British",
  "Asian / Asian British",
  "Mixed / Multiple ethnic groups",
  "Other",
];

const genders = ["Female", "Male", "Non-binary", "Prefer not to say"];

const yearOfStudyOptions = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Postgraduate"];

const entryOptions = [
  "UK Citizen",
  "EU/EEA Citizen",
  "International Student - Visa Pending",
  "International Student - Visa Granted",
];

type PaymentPlanInstallment =
  Database["public"]["Tables"]["payment_plan_installments"]["Row"];

const uploadDocument = async (
  file: File,
  userId: string,
  applicationId: string,
  key: string,
) => {
  const path = `${userId}/${applicationId}/${key}-${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage
    .from("documents")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;
  return path;
};

const optionalText = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""));

const optionalEmail = (message = "Enter a valid email address") =>
  z
    .string()
    .trim()
    .email(message)
    .optional()
    .or(z.literal(""));

const yesNoSchema = z.enum(["yes", "no"]);

const calculateAgeFromDob = (dob: string): string => {
  if (!dob) return "";
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return "";
  const age = differenceInYears(new Date(), parsed);
  return age > 0 ? String(age) : "";
};

type UploadState = {
  status: "idle" | "uploading" | "uploaded" | "error";
  progress: number;
  previewUrl?: string;
  fileName?: string;
  error?: string;
  isImage?: boolean;
  remoteUrl?: string;
};

type EnvelopePreview = {
  envelope_type: "tenancy" | "guarantor";
  envelope_id?: string | null;
  status?: string | null;
  updated_at?: string | null;
};

const hasMeaningfulValue = (value: unknown) => {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return value !== null && value !== undefined;
};

const formatEnvelopeStatus = (status?: string | null) => {
  if (!status) return "Not sent yet";
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "completed":
      return "Completed";
    case "sent":
    case "delivered":
      return "Awaiting signature";
    case "created":
      return "Scheduled";
    case "declined":
      return "Declined";
    default:
      return normalized.replace(/_/g, " ");
  }
};

const isEnvelopeCompleted = (status?: string | null) =>
  (status ?? "").toLowerCase() === "completed";

const isImagePath = (value: string) =>
  /\.(png|jpe?g|gif|webp|svg)$/i.test(value);

const extractFileName = (value: string) => value.split("/").pop() ?? value;

const personalSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().trim().min(1, "Last name is required"),
  date_of_birth: z.string().trim().min(1, "Date of birth is required"),
  age: z
    .string()
    .trim()
    .min(1, "Age is required")
    .refine((value) => /^\d{1,3}$/.test(value), {
      message: "Enter a valid age",
    })
    .refine((value) => Number(value) >= 16, {
      message: "You must be at least 16 years old",
    }),
  ethnicity: z.string().trim().min(1, "Select your ethnicity"),
  gender: z.string().trim().min(1, "Select your gender"),
  ucas_id: z
    .string()
    .trim()
    .min(1, "UCAS ID is required")
    .max(32, "UCAS ID must be at most 32 characters"),
  country: z.string().trim().min(1, "Select your country"),
  referral_code: optionalText(50), // Optional partner referral code
});

const contactSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  mobile: z.string().trim().min(5, "Mobile number is required"),
  address_line_1: z.string().trim().min(1, "Address line 1 is required"),
  address_line_2: optionalText(),
  postcode: z.string().trim().min(1, "Postcode is required"),
  town: z.string().trim().min(1, "Town / City is required"),
});

const academicSchema = z.object({
  year_of_study: z.string().trim().min(1, "Select your year of study"),
  field_of_study: z.string().trim().min(1, "Enter your field of study"),
  disabled: yesNoSchema,
  smoker: yesNoSchema,
  medical_requirements: optionalText(500),
  entry_into_uk: z.string().trim().min(1, "Select your entry status"),
});

const documentationSchema = z.object({
  uk_citizen: yesNoSchema,
  passport_document: optionalText(512),
  visa_document: optionalText(512),
  passport_photo: z
    .string()
    .trim()
    .min(1, "Student passport photo is required"),
  student_proof: z
    .string()
    .trim()
    .min(1, "Student proof document is required"),
});

const paymentSchema = z.object({
  selected_plan_id: z.string().trim().optional().or(z.literal("")),
  deposit_paid: z.boolean().optional(),
  already_paid_deposit: z.boolean().optional(),
  receipt_number: optionalText(100),
  guarantor_name: optionalText(),
  guarantor_email: optionalEmail(),
  guarantor_phone: optionalText(),
  guarantor_relationship: optionalText(),
  guarantor_dob: optionalText(),
  witness_name: optionalText(),
  witness_email: optionalEmail(),
  witness_phone: optionalText(),
  utility_bill: optionalText(512),
  id_document: optionalText(512),
  bank_statement: optionalText(512),
  consent: z
    .boolean()
    .refine((value) => value, "Consent is required to continue"),
});

type PersonalValues = z.infer<typeof personalSchema>;
type ContactValues = z.infer<typeof contactSchema>;
type AcademicForm = z.infer<typeof academicSchema>;
type DocumentationForm = z.infer<typeof documentationSchema>;
type PaymentForm = z.infer<typeof paymentSchema>;

type FieldErrorMap<T extends Record<string, unknown>> = Partial<
  Record<keyof T, string>
>;

const toFieldErrorMap = <T extends Record<string, unknown>>(
  fieldErrors: Record<string, string[] | undefined>,
): FieldErrorMap<T> => {
  const result: FieldErrorMap<T> = {};
  Object.entries(fieldErrors).forEach(([key, messages]) => {
    if (messages && messages.length) {
      result[key as keyof T] = messages[0];
    }
  });
  return result;
};

const StudentApplicationWizard = () => {
  const { data: brandingSettings } = useBrandingSettings();
  const companyName = brandingSettings?.company_name || "StudentStaySolutions";
  const successColorHex = brandingSettings?.color_success || "#10B981";
  
  // Convert hex to rgba for opacity support
  const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };
  
  const successColorBg = hexToRgba(successColorHex, 0.95); // 95% opacity - same vibrant green as completed button
  const successColorBorder = successColorHex; // Full color for border
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const isStaff = profile?.role === "staff" || profile?.role === "superadmin";
  const isStaffOrSubRole =
    isStaff ||
    profile?.role === "admin" ||
    profile?.role === "operations_manager" ||
    profile?.role === "reservationist" ||
    profile?.role === "accountant" ||
    profile?.role === "front_desk" ||
    profile?.role === "maintenance_officer" ||
    profile?.role === "housekeeper";

  const {
    data: application,
    isLoading,
    isError,
    refetch: refetchApplication,
  } = useStudentApplication(applicationId);
  const { mutateAsync: saveStep } = useSaveApplicationStep(
    applicationId ?? "",
  );

  // Fetch rebooking data if this is a rebooking
  const { data: rebookingData, isLoading: loadingRebookingData } = useRebookingData(
    application?.is_rebooking && application?.previous_application_id 
      ? application.previous_application_id 
      : null
  );

  const [currentStep, setCurrentStep] = useState(() =>
    readStoredStep(applicationId),
  );
  const initialStepSyncedRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sendingAgreements, setSendingAgreements] = useState(false);
  const [stripePromise, setStripePromise] =
    useState<ReturnType<typeof loadStripe> | null>(null);
  const [paymentClientSecret, setPaymentClientSecret] = useState<string | null>(
    null,
  );
  const [paymentAmount, setPaymentAmount] = useState<number | null>(null);
  const [paymentCurrency, setPaymentCurrency] = useState<string>("GBP");
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [signingLoading, setSigningLoading] = useState(false);
  const [latestSigningUrl, setLatestSigningUrl] = useState<string | null>(null);
  const [pendingEnvelopes, setPendingEnvelopes] = useState<{
    tenancy: EnvelopePreview | null;
    guarantor: EnvelopePreview | null;
  }>({
    tenancy: null,
    guarantor: null,
  });
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [uploadingTenancy, setUploadingTenancy] = useState(false);
  const [uploadingGuarantor, setUploadingGuarantor] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>(
    {},
  );
  const previewUrlsRef = useRef<Record<string, string>>({});
  const loadedPathsRef = useRef<Record<string, string>>({});

  // When staff are completing a journey on behalf of a student, we want to
  // prefill step 1/2 with the student's name/email rather than the staff profile.
  const [applicationStudentProfile, setApplicationStudentProfile] = useState<{
    first_name: string | null;
    last_name: string | null;
  } | null>(null);
  const [applicationStudentEmail, setApplicationStudentEmail] = useState<string>("");

  useEffect(() => {
    const loadStudentProfileForApplication = async () => {
      if (!application?.student_id || !isStaffOrSubRole) {
        setApplicationStudentProfile(null);
        setApplicationStudentEmail("");
        return;
      }

      try {
        const [profileResult, emailsResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", application.student_id)
            .maybeSingle(),
          supabase.functions.invoke("get-user-emails", {
            body: { userIds: [application.student_id] },
          }),
        ]);

        if (profileResult.data) {
          setApplicationStudentProfile({
            first_name: profileResult.data.first_name ?? null,
            last_name: profileResult.data.last_name ?? null,
          });
        } else {
          setApplicationStudentProfile(null);
        }

        const emailsMap = (emailsResult.data as any)?.emails as
          | Record<string, string>
          | undefined;
        const email = emailsMap?.[application.student_id] ?? "";
        setApplicationStudentEmail(email);
      } catch (error) {
        console.warn(
          "Could not load student profile/email for application:",
          error,
        );
      }
    };

    loadStudentProfileForApplication();
  }, [application?.student_id, isStaffOrSubRole]);

  useEffect(
    () => () => {
      Object.values(previewUrlsRef.current).forEach((url) => {
        URL.revokeObjectURL(url);
      });
      previewUrlsRef.current = {};
      loadedPathsRef.current = {};
    },
    [],
  );

  useEffect(() => {
    if (!application) return;
    const saved = application.student_application_steps ?? [];
    const firstIncomplete = steps.find((step) => {
      const record = saved.find((item) => item.step_number === step.number);
      return !record?.is_complete;
    });
    const targetStep =
      firstIncomplete?.number ?? steps[steps.length - 1].number;
    const storedStep = applicationId ? readStoredStep(applicationId) : MIN_STEP_NUMBER;
    setCurrentStep((prev) => {
      if (!initialStepSyncedRef.current) {
        initialStepSyncedRef.current = true;
        const next = Math.max(targetStep, storedStep, prev);
        if (applicationId) {
          writeStoredStep(applicationId, next);
        }
        return next;
      }
      const next = targetStep > prev ? targetStep : prev;
      if (applicationId) {
        writeStoredStep(applicationId, next);
      }
      return next;
    });
  }, [application?.student_application_steps, applicationId]);

  useEffect(() => {
    if (!applicationId) return;
    const stored = readStoredStep(applicationId);
    setCurrentStep(stored);
    initialStepSyncedRef.current = false;
  }, [applicationId]);

  useEffect(() => {
    if (!applicationId) return;
    writeStoredStep(applicationId, currentStep);
  }, [applicationId, currentStep]);

  // populated later once upload field state exists

  const personalDefaults = useMemo<PersonalValues>(() => {
    // Use rebooking data if available, otherwise use current application data
    const rebookingStep1 = rebookingData?.step1_data as Record<string, any> | undefined;
    const payload =
      application?.student_application_steps.find(
        (step) => step.step_number === 1,
      )?.payload ?? rebookingStep1 ?? {};
    const dob = (payload.date_of_birth as string) || "";
    const derivedAge =
      calculateAgeFromDob(dob) ||
      (typeof payload.age === "number"
        ? String(payload.age)
        : typeof payload.age === "string"
          ? payload.age
          : "");
    // Prefer the actual student's profile when staff are filling the journey;
    // fall back to the logged-in profile for student self-service.
    const studentProfileForDefaults =
      applicationStudentProfile ??
      (profile?.role === "student"
        ? {
            first_name: profile.first_name ?? null,
            last_name: profile.last_name ?? null,
          }
        : null);

    return {
      first_name:
        (payload.first_name as string) ||
        studentProfileForDefaults?.first_name ||
        "",
      last_name:
        (payload.last_name as string) ||
        studentProfileForDefaults?.last_name ||
        "",
      date_of_birth: dob,
      age: derivedAge,
      ethnicity: (payload.ethnicity as string) || "",
      gender: (payload.gender as string) || "",
      ucas_id: (payload.ucas_id as string) || "",
      country: (payload.country as string) || "",
      referral_code: (payload.referral_code as string) || "",
    };
  }, [application, profile, rebookingData, applicationStudentProfile]);

  const [personalValues, setPersonalValues] = useState<PersonalValues>(
    () => personalDefaults,
  );
  const [personalErrors, setPersonalErrors] = useState<
    FieldErrorMap<PersonalValues>
  >({});
  const personalDefaultsRef = useRef(JSON.stringify(personalDefaults));

  useEffect(() => {
    const serialized = JSON.stringify(personalDefaults);
    if (serialized !== personalDefaultsRef.current) {
      setPersonalValues(personalDefaults);
      setPersonalErrors({});
      personalDefaultsRef.current = serialized;
    }
  }, [personalDefaults]);

  const handlePersonalChange = useCallback(
    (field: keyof PersonalValues, value: string) => {
      setPersonalValues((prev) => ({
        ...prev,
        [field]: value,
      }));
      setPersonalErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    setPersonalValues((prev) => {
      const computed = calculateAgeFromDob(prev.date_of_birth);
      if (computed === prev.age) return prev;
      return { ...prev, age: computed };
    });
  }, [personalValues.date_of_birth]);

  const personalComparisonValues = useMemo(() => {
    const values = [
      personalDefaults.first_name,
      personalDefaults.last_name,
      personalDefaults.date_of_birth,
      personalDefaults.gender,
      personalDefaults.ethnicity,
      personalDefaults.country,
      profile?.first_name ?? "",
      profile?.last_name ?? "",
    ];
    values.push(personalDefaults.age);
    return new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    );
  }, [personalDefaults, profile]);

  const contactDefaults = useMemo<ContactValues>(() => {
    // Use rebooking data if available, otherwise use current application data
    const rebookingStep2 = rebookingData?.step2_data as Record<string, any> | undefined;
    const stepPayload =
      application?.student_application_steps.find(
        (step) => step.step_number === 2,
      )?.payload ?? rebookingStep2 ?? {};
    const payload =
      typeof stepPayload === "object" && stepPayload !== null
        ? Object(stepPayload)
        : {};

    const sanitize = (
      value: unknown,
      field: keyof ContactValues,
      fallback?: string,
    ): string => {
      if (typeof value !== "string") return fallback ?? "";
      const trimmed = value.trim();
      if (!trimmed || personalComparisonValues.has(trimmed)) {
        return fallback ?? "";
      }
      if (field === "email" && !trimmed.includes("@")) {
        return fallback ?? "";
      }
      return trimmed;
    };

    const emailFallback =
      // When staff are filling the journey, prefer the student's email if available
      isStaffOrSubRole && applicationStudentEmail
        ? applicationStudentEmail
        : user?.email ?? "";

    return {
      email: sanitize(payload.email, "email", emailFallback),
      mobile: sanitize(payload.mobile, "mobile"),
      address_line_1: sanitize(payload.address_line_1, "address_line_1"),
      address_line_2: sanitize(payload.address_line_2, "address_line_2"),
      postcode: sanitize(payload.postcode, "postcode"),
      town: sanitize(payload.town, "town"),
    };
  }, [application, user, personalComparisonValues, isStaffOrSubRole, applicationStudentEmail]);

  const [contactValues, setContactValues] = useState<ContactValues>(
    () => contactDefaults,
  );
  const [contactErrors, setContactErrors] = useState<
    FieldErrorMap<ContactValues>
  >({});
  const contactDefaultsRef = useRef(JSON.stringify(contactDefaults));

  useEffect(() => {
    const serialized = JSON.stringify(contactDefaults);
    if (serialized !== contactDefaultsRef.current) {
      setContactValues((prev) => {
        const next = { ...prev };
        (Object.keys(contactDefaults) as Array<keyof ContactValues>).forEach(
          (key) => {
            const value = contactDefaults[key];
            if (hasMeaningfulValue(value)) {
              next[key] = value;
            }
          },
        );
        return next;
      });
      setContactErrors((prev) => {
        if (!Object.keys(prev).length) return prev;
        const next = { ...prev };
        (Object.keys(contactDefaults) as Array<keyof ContactValues>).forEach(
          (key) => {
            if (hasMeaningfulValue(contactDefaults[key])) {
              delete next[key];
            }
          },
        );
        return next;
      });
      contactDefaultsRef.current = serialized;
    }
  }, [contactDefaults]);

  const handleContactChange = useCallback(
    (field: keyof ContactValues, value: string) => {
      setContactValues((prev) => ({
        ...prev,
        [field]: value,
      }));
      setContactErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  // Removed auto-sanitise effect to avoid overwriting valid contact details after refetches.

  const academicDefaults = useMemo<AcademicForm>(() => {
    // Use rebooking data if available, otherwise use current application data
    const rebookingStep3 = rebookingData?.step3_data as Record<string, any> | undefined;
    const payload =
      application?.student_application_steps.find(
        (step) => step.step_number === 3,
      )?.payload ?? rebookingStep3 ?? {};
    return {
      year_of_study: (payload.year_of_study as string) || "",
      field_of_study: (payload.field_of_study as string) || "",
      disabled: (payload.disabled as "yes" | "no") || "no",
      smoker: (payload.smoker as "yes" | "no") || "no",
      medical_requirements: (payload.medical_requirements as string) || "",
      entry_into_uk: (payload.entry_into_uk as string) || "",
    };
  }, [application, rebookingData]);

  const [academicValues, setAcademicValues] = useState<AcademicForm>(
    () => academicDefaults,
  );
  const [academicErrors, setAcademicErrors] = useState<
    FieldErrorMap<AcademicForm>
  >({});
  const academicDefaultsRef = useRef(JSON.stringify(academicDefaults));

  useEffect(() => {
    const serialized = JSON.stringify(academicDefaults);
    if (serialized !== academicDefaultsRef.current) {
      setAcademicValues(academicDefaults);
      setAcademicErrors({});
      academicDefaultsRef.current = serialized;
    }
  }, [academicDefaults]);

  const handleAcademicChange = useCallback(
    (field: keyof AcademicForm, value: string) => {
      setAcademicValues((prev) => ({
        ...prev,
        [field]: value,
      }));
      setAcademicErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  const documentationDefaults = useMemo<DocumentationForm>(() => {
    // Use rebooking data if available, otherwise use current application data
    const rebookingStep4 =
      rebookingData?.step4_data as Record<string, any> | undefined;
    const payload =
      application?.student_application_steps.find(
        (step) => step.step_number === 4,
      )?.payload ?? rebookingStep4 ?? {};
    return {
      uk_citizen: (payload.uk_citizen as "yes" | "no") || "yes",
      passport_document: (payload.passport_document as string) || "",
      visa_document: (payload.visa_document as string) || "",
      passport_photo: (payload.passport_photo as string) || "",
      student_proof: (payload.student_proof as string) || "",
    };
  }, [application, rebookingData]);

  const [documentationValues, setDocumentationValues] =
    useState<DocumentationForm>(() => documentationDefaults);
  const [documentationErrors, setDocumentationErrors] = useState<
    FieldErrorMap<DocumentationForm>
  >({});
  const documentationDefaultsRef = useRef(
    JSON.stringify(documentationDefaults),
  );

  useEffect(() => {
    const serialized = JSON.stringify(documentationDefaults);
    if (serialized !== documentationDefaultsRef.current) {
      setDocumentationValues(documentationDefaults);
      setDocumentationErrors({});
      documentationDefaultsRef.current = serialized;
    }
  }, [documentationDefaults]);

  const handleDocumentationChange = useCallback(
    (field: keyof DocumentationForm, value: string) => {
      setDocumentationValues((prev) => {
        const next = {
          ...prev,
          [field]: value,
        };
        if (field === "uk_citizen" && value === "yes" && prev.visa_document) {
          next.visa_document = "";
        }
        return next;
      });
      setDocumentationErrors((prev) => {
        const next = { ...prev };
        if (next[field]) {
          delete next[field];
        }
        if (field === "uk_citizen") {
          delete next.visa_document;
        }
        return next;
      });
      if (field === "uk_citizen" && value === "yes") {
        setUploadStates((prev) => {
          if (!prev.visa_document) return prev;
          const nextStates = { ...prev };
          const current = nextStates.visa_document;
          if (
            current?.previewUrl &&
            current.previewUrl.startsWith("blob:") &&
            previewUrlsRef.current.visa_document === current.previewUrl
          ) {
            URL.revokeObjectURL(current.previewUrl);
            delete previewUrlsRef.current.visa_document;
          }
          delete nextStates.visa_document;
          delete loadedPathsRef.current.visa_document;
          return nextStates;
        });
      }
    },
    [],
  );

  type NormalizedPlan = {
    linkId: string;
    planId: string;
    displayOrder: number;
    plan: {
      id: string;
      name: string;
      description: string | null;
      deposit_amount: number | null;
      payment_plan_installments: PaymentPlanInstallment[];
    };
  };

  const normalizePlans = useCallback(
    (rows: Array<{
      id?: string;
      payment_plan_id: string;
      display_order: number | null;
      payment_plan: {
        id: string;
        name: string;
        description: string | null;
        deposit_amount: number | null;
        payment_plan_installments?: PaymentPlanInstallment[];
      } | null;
    }>): NormalizedPlan[] =>
      rows
        .filter((row) => row.payment_plan && row.payment_plan_id)
        .map((row) => ({
          linkId: row.id ?? row.payment_plan_id,
          planId: row.payment_plan_id,
          displayOrder: row.display_order ?? 0,
          plan: {
            ...row.payment_plan!,
            payment_plan_installments:
              row.payment_plan?.payment_plan_installments ?? [],
          },
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [],
  );

  const contractPlans = useMemo(
    () =>
      (application?.contract?.contract_payment_plans ?? [])
        .filter((link) => link.payment_plan && link.payment_plan_id)
        .map((link) => ({
          linkId: link.id,
          planId: link.payment_plan_id as string,
          displayOrder: link.display_order ?? 0,
          plan: {
            ...link.payment_plan!,
            payment_plan_installments:
              link.payment_plan?.payment_plan_installments ?? [],
          },
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [application],
  );

  const [resolvedPlans, setResolvedPlans] = useState<NormalizedPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  useEffect(() => {
    if (!application?.contract?.id) {
      setResolvedPlans([]);
      return;
    }

    if (contractPlans.length) {
      setResolvedPlans(contractPlans);
      return;
    }

    let cancelled = false;

    const loadFallbackPlans = async () => {
      setLoadingPlans(true);
      try {
        const { data, error } = await supabase
          .from("contract_payment_plans")
          .select(
            `
              id,
              payment_plan_id,
              display_order,
              payment_plan:payment_plans (
                id,
                name,
                description,
                deposit_amount,
                payment_plan_installments:payment_plan_installments (*)
              )
            `,
          )
          .eq("contract_id", application.contract!.id)
          .order("display_order");

        let rows = data ?? [];

        if (!rows.length && application.contract?.payment_plan_id) {
          const { data: legacyPlan, error: legacyError } = await supabase
            .from("payment_plans")
            .select(
              `
                id,
                name,
                description,
                deposit_amount,
                payment_plan_installments:payment_plan_installments (*)
              `,
            )
            .eq("id", application.contract.payment_plan_id)
            .maybeSingle();

          if (!legacyError && legacyPlan) {
            rows = [
              {
                id: `${application.contract.id}-${legacyPlan.id}`,
                payment_plan_id: legacyPlan.id,
                display_order: 0,
                payment_plan: legacyPlan,
              },
            ];
          }
        }

        if (!cancelled) {
          setResolvedPlans(normalizePlans(rows));
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Unable to load instalment plans:", error);
          setResolvedPlans([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingPlans(false);
        }
      }
    };

    loadFallbackPlans();

    return () => {
      cancelled = true;
    };
  }, [
    application?.contract?.id,
    application?.contract?.payment_plan_id,
    contractPlans,
    normalizePlans,
  ]);

  const paymentDefaults = useMemo<PaymentForm>(() => {
    // Use rebooking data if available, otherwise use current application data
    const rebookingStep5 = rebookingData?.step5_data as Record<string, any> | undefined;
    const payload =
      application?.student_application_steps.find(
        (step) => step.step_number === 5,
      )?.payload ?? rebookingStep5 ?? {};
    const initialPlanId =
      (payload.selected_plan_id as string | undefined) ??
      application?.selected_payment_plan_id ??
      resolvedPlans[0]?.planId ??
      "";
    return {
      selected_plan_id: initialPlanId,
      deposit_paid: Boolean(payload.deposit_paid),
      already_paid_deposit: Boolean(payload.already_paid_deposit),
      receipt_number: (payload.receipt_number as string) || "",
      guarantor_name: (payload.guarantor_name as string) || "",
      guarantor_email: (payload.guarantor_email as string) || "",
      guarantor_phone: (payload.guarantor_phone as string) || "",
      guarantor_relationship:
        (payload.guarantor_relationship as string) || "",
      guarantor_dob: (payload.guarantor_dob as string) || "",
      witness_name: (payload.witness_name as string) || "",
      witness_email: (payload.witness_email as string) || "",
      witness_phone: (payload.witness_phone as string) || "",
      utility_bill: (payload.utility_bill as string) || "",
      id_document: (payload.id_document as string) || "",
      bank_statement: (payload.bank_statement as string) || "",
      consent: Boolean(payload.consent),
    };
  }, [application, resolvedPlans, rebookingData]);

  const [paymentValues, setPaymentValues] = useState<PaymentForm>(
    () => paymentDefaults,
  );
  const [paymentErrors, setPaymentErrors] =
    useState<FieldErrorMap<PaymentForm>>({});
  const paymentDefaultsRef = useRef(JSON.stringify(paymentDefaults));

useEffect(() => {
  const serialized = JSON.stringify(paymentDefaults);
  if (serialized !== paymentDefaultsRef.current) {
    setPaymentValues((prev) => {
      const next = { ...prev };
      (Object.keys(paymentDefaults) as Array<keyof PaymentForm>).forEach((key) => {
        const defaultValue = paymentDefaults[key];
        if (key === "selected_plan_id" || hasMeaningfulValue(defaultValue)) {
          next[key] = defaultValue;
        }
      });
      return next;
    });
    setPaymentErrors((prev) => {
      if (!Object.keys(prev).length) return prev;
      const next = { ...prev };
      (Object.keys(paymentDefaults) as Array<keyof PaymentForm>).forEach((key) => {
        if (hasMeaningfulValue(paymentDefaults[key])) {
          delete next[key];
        }
      });
      return next;
    });
    paymentDefaultsRef.current = serialized;
  }
}, [paymentDefaults]);

  useEffect(() => {
    const fields: Array<{ key: string; path: string | null | undefined }> = [
      {
        key: "passport_document",
        path: documentationValues.passport_document,
      },
      {
        key: "visa_document",
        path: documentationValues.visa_document,
      },
      { key: "utility_bill", path: paymentValues.utility_bill },
      { key: "id_document", path: paymentValues.id_document },
      { key: "bank_statement", path: paymentValues.bank_statement },
    ];

    fields.forEach(({ key, path }) => {
      if (!path) {
        if (previewUrlsRef.current[key]) {
          URL.revokeObjectURL(previewUrlsRef.current[key]);
          delete previewUrlsRef.current[key];
        }
        delete loadedPathsRef.current[key];
        setUploadStates((prev) => {
          if (!prev[key]) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        return;
      }

      if (loadedPathsRef.current[key] === path) {
        return;
      }
      const isImage = isImagePath(path);
      const fileName = extractFileName(path);

      setUploadStates((prev) => ({
        ...prev,
        [key]: {
          status: "uploaded",
          progress: 100,
          fileName,
          isImage,
          previewUrl: prev[key]?.previewUrl,
          remoteUrl: prev[key]?.remoteUrl,
          error: undefined,
        },
      }));

      const attemptSignedUrl = (attempt = 0) => {
        void (async () => {
          const { data, error } = await supabase.storage
            .from("documents")
            .createSignedUrl(path, 60);
          if (error) {
            if (attempt < 2) {
              setTimeout(() => attemptSignedUrl(attempt + 1), 1200);
              return;
            }
            console.warn("Unable to create signed URL for document", {
              key,
              path,
              error,
            });
            delete loadedPathsRef.current[key];
            setUploadStates((prev) => {
              const current = prev[key];
              if (!current) return prev;
              const message =
                typeof error === "object" && error !== null && "message" in error
                  ? String((error as { message?: string }).message)
                  : "Preview unavailable. Please upload again.";
              return {
                ...prev,
                [key]: {
                  ...current,
                  status: "uploaded",
                  progress: current.progress ?? 100,
                  error: message.includes("not found")
                    ? "We couldn’t find this document. Please upload it again."
                    : message,
                },
              };
            });
            return;
          }
          const signedUrl = data?.signedUrl ?? null;
          if (!signedUrl) return;
          loadedPathsRef.current[key] = path;
          setUploadStates((prev) => {
            const current = prev[key];
            if (!current) return prev;
            if (
              current.previewUrl &&
              current.previewUrl.startsWith("blob:") &&
              previewUrlsRef.current[key] === current.previewUrl
            ) {
              URL.revokeObjectURL(current.previewUrl);
              delete previewUrlsRef.current[key];
            }
            return {
              ...prev,
              [key]: {
                ...current,
                status: "uploaded",
                progress: 100,
                remoteUrl: signedUrl,
                previewUrl:
                  current.previewUrl ??
                  (isImage ? signedUrl : current.previewUrl),
                error: undefined,
              },
            };
          });
        })();
      };

      attemptSignedUrl();
    });
  }, [
    documentationValues.passport_document,
    documentationValues.visa_document,
    paymentValues.utility_bill,
    paymentValues.id_document,
    paymentValues.bank_statement,
  ]);

  const handlePaymentChange = useCallback(
    <K extends keyof PaymentForm>(field: K, value: PaymentForm[K]) => {
      setPaymentValues((prev) => ({
        ...prev,
        [field]: value,
      }));
      setPaymentErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  const selectedPlanId = paymentValues.selected_plan_id;

  const persistSelectedPlan = useCallback(
    async (
      planId: string,
      previousPlanId?: string,
      skipRefetch = false,
    ): Promise<boolean> => {
      if (!application?.id || !planId) return false;
      if (application.selected_payment_plan_id === planId) return true;

      try {
        const { error } = await supabase.rpc("set_selected_payment_plan", {
          p_application_id: application.id,
          p_plan_id: planId,
        });
        if (error) throw error;

        if (!skipRefetch) {
          await refetchApplication();
        }
        return true;
      } catch (error) {
        console.error("Failed to save plan selection:", error);
        if (
          error &&
          typeof error === "object" &&
          "details" in error &&
          typeof (error as { details?: unknown }).details === "string"
        ) {
          console.error("Plan RPC details:", (error as { details?: string }).details);
        }
        if (
          error &&
          typeof error === "object" &&
          "hint" in error &&
          typeof (error as { hint?: unknown }).hint === "string"
        ) {
          console.error("Plan RPC hint:", (error as { hint?: string }).hint);
        }
        let message = [
          typeof (error as { message?: string }).message === "string"
            ? (error as { message?: string }).message
            : null,
          typeof (error as { details?: string }).details === "string"
            ? (error as { details?: string }).details
            : null,
          typeof (error as { hint?: string }).hint === "string"
            ? (error as { hint?: string }).hint
            : null,
          typeof (error as { code?: string }).code === "string"
            ? `(${(error as { code?: string }).code})`
            : null,
        ]
          .filter(Boolean)
          .join(" • ");
        if (message.includes("42703")) {
          message =
            "The booking form is updating. Please refresh the page in a few seconds and try again.";
        }
        if (!message) {
          message = "Please try again.";
        }
        toast({
          variant: "destructive",
          title: "Unable to save instalment plan",
          description: message,
        });
        if (previousPlanId) {
          setPaymentValues((prev) => ({
            ...prev,
            selected_plan_id: previousPlanId,
          }));
        }
        return false;
      }
    },
    [application?.id, application?.selected_payment_plan_id, refetchApplication, toast],
  );

  useEffect(() => {
    if (!resolvedPlans.length) return;
    const currentValue = paymentValues.selected_plan_id;
    const storedValue = application?.selected_payment_plan_id ?? "";
    const fallback = currentValue || storedValue || resolvedPlans[0].planId;

    if (!currentValue && fallback) {
      setPaymentValues((prev) => ({
        ...prev,
        selected_plan_id: fallback,
      }));
      setPaymentErrors((prev) => {
        if (!prev.selected_plan_id) return prev;
        const next = { ...prev };
        delete next.selected_plan_id;
        return next;
      });
    }
  }, [
    application?.selected_payment_plan_id,
    resolvedPlans,
    paymentValues.selected_plan_id,
  ]);

  const selectedPlan = useMemo(() => {
    if (!resolvedPlans.length) return null;
    const effectiveId =
      selectedPlanId ||
      application?.selected_payment_plan_id ||
      resolvedPlans[0].planId;

    return (
      resolvedPlans.find((plan) => plan.planId === effectiveId) ??
      resolvedPlans[0] ??
      null
    );
  }, [resolvedPlans, selectedPlanId, application?.selected_payment_plan_id]);

  const hasPlanOptions =
    resolvedPlans.length > 0 || Boolean(application?.selected_payment_plan_id);
  
  // Check if selected plan is "Pay in Full" (1 installment with 100% percentage)
  const isPayInFullPlan = useMemo(() => {
    // Check currently selected plan in UI
    const planIdToCheck = selectedPlanId || application?.selected_payment_plan_id;
    if (!planIdToCheck || !resolvedPlans.length) return false;
    
    const selectedPlan = resolvedPlans.find(p => p.planId === planIdToCheck);
    if (!selectedPlan?.plan?.payment_plan_installments) return false;
    
    const installments = selectedPlan.plan.payment_plan_installments
      .slice()
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    
    // Pay in Full = exactly 1 installment with 100% percentage
    return installments.length === 1 && 
           installments[0].amount_type === 'percentage' && 
           installments[0].amount_value === 100;
  }, [selectedPlanId, application?.selected_payment_plan_id, resolvedPlans]);
  
  // Require guarantor only if there are payment plan options AND it's not a "Pay in Full" plan
  const requiresGuarantor = hasPlanOptions && !isPayInFullPlan;
  // Witness is now optional for all cases, not just when paying in full
  // const requiresWitness = !requiresGuarantor; // Removed - witness is always optional

  useEffect(() => {
    let mounted = true;
    const loadPublishableKey = async () => {
      const { data, error } = await supabase.functions.invoke<{
        publishableKey?: string;
        error?: string;
      }>("get-publishable-key");

      if (!mounted) return;

      if (error || data?.error) {
        console.error("Unable to load Stripe publishable key:", error ?? data?.error);
        return;
      }

      if (data?.publishableKey) {
        setStripePromise(loadStripe(data.publishableKey));
      }
    };

    loadPublishableKey();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoading && application && !application.assigned_studio_id) {
      navigate(
        `/portal/applications/${application.id}/select-studio`,
        { replace: true },
      );
    }
  }, [application, isLoading, navigate]);

  const handleStepSubmit = async (
    stepNumber: number,
    data: Record<string, unknown>,
  ) => {
    setIsSaving(true);
    try {
      await saveStep({
        stepNumber,
        data,
        isComplete: true,
      });
      setCurrentStep((prev) => Math.min(prev + 1, steps.length));
    } catch (error) {
      console.error("Error saving step:", error);
      toast({
        variant: "destructive",
        title: "Save failed",
        description: "Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Validate referral code
  const referralCodeToValidate = personalValues.referral_code?.trim() || null;
  const { data: referralValidation, isLoading: isValidatingReferral } = useValidateReferralCode(
    referralCodeToValidate || undefined
  );

  const handlePersonalSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    
    // Validate referral code if provided
    if (personalValues.referral_code?.trim()) {
      if (isValidatingReferral) {
        toast({
          variant: "destructive",
          title: "Validating referral code",
          description: "Please wait while we validate your referral code.",
        });
        return;
      }
      
      if (referralValidation && !referralValidation.is_valid) {
        setPersonalErrors((prev) => ({
          ...prev,
          referral_code: "Invalid referral code. Please check and try again.",
        }));
        toast({
          variant: "destructive",
          title: "Invalid referral code",
          description: "The referral code you entered is not valid. Please check and try again.",
        });
        return;
      }
    }
    
    const candidate: PersonalValues = {
      ...personalValues,
      age: calculateAgeFromDob(personalValues.date_of_birth),
    };
    const parsed = personalSchema.safeParse(candidate);
    if (!parsed.success) {
      setPersonalErrors(
        toFieldErrorMap<PersonalValues>(parsed.error.flatten().fieldErrors),
      );
      toast({
        variant: "destructive",
        title: "Please review your personal details",
        description: "Check the highlighted fields before continuing.",
      });
      return;
    }

    const sanitized: PersonalValues = {
      ...parsed.data,
      age: calculateAgeFromDob(parsed.data.date_of_birth),
    };
    setPersonalValues(sanitized);
    setPersonalErrors({});
    
    // Save validated referral code to application if valid
    if (referralValidation?.is_valid && referralValidation.partner_id && applicationId) {
      const validatedCode = personalValues.referral_code?.trim().toUpperCase() || null;
      await supabase
        .from("student_applications")
        .update({
          validated_referral_code: validatedCode,
          referred_by_partner_id: referralValidation.partner_id,
        })
        .eq("id", applicationId);
    }
    
    // Save to application steps (existing workflow)
    await handleStepSubmit(1, sanitized);

    // Sync first_name and last_name to profiles only when the applicant is the logged-in user.
    // When staff create an application on behalf of a student, do NOT update the staff's profile with the student's name.
    if (
      application?.student_id === user?.id &&
      (sanitized.first_name || sanitized.last_name)
    ) {
      try {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            first_name: sanitized.first_name || null,
            last_name: sanitized.last_name || null,
          })
          .eq("id", user.id);

        if (profileError) {
          console.error("Failed to sync profile names from application step:", profileError);
          // Don't fail step submission, just log the error - step still saves successfully
        } else {
          if (refreshProfile) {
            await refreshProfile();
          }
        }
      } catch (err) {
        console.error("Error updating profile from application step:", err);
      }
    }
  };

  const handleContactSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const parsed = contactSchema.safeParse(contactValues);
    if (!parsed.success) {
      setContactErrors(
        toFieldErrorMap<ContactValues>(parsed.error.flatten().fieldErrors),
      );
      toast({
        variant: "destructive",
        title: "Please review your contact details",
        description: "Fix the highlighted fields before continuing.",
      });
      return;
    }

    const sanitized = parsed.data;
    setContactValues(sanitized);
    setContactErrors({});
    
    // Save to application steps (existing workflow)
    await handleStepSubmit(2, sanitized);
    
    // Sync email to auth user if changed and user is the student
    if (sanitized.email && user?.email && sanitized.email !== user.email && application?.student_id === user.id) {
      try {
        const { error: emailError } = await supabase.auth.updateUser({
          email: sanitized.email,
        });

        if (emailError) {
          console.error("Failed to sync email to auth user:", emailError);
          // Don't fail step submission, just log the error - step still saves successfully
          toast({
            variant: "destructive",
            title: "Email update warning",
            description: "Contact information saved, but email update failed. Please update your email in profile settings.",
          });
        } else {
          // Refresh profile to update UI if available
          if (refreshProfile) {
            await refreshProfile();
          }
          toast({
            title: "Email updated",
            description: "Your contact information and email have been updated successfully.",
          });
        }
      } catch (err) {
        console.error("Error updating email from application step:", err);
        // Don't fail step submission, just log the error
        toast({
          variant: "destructive",
          title: "Email update warning",
          description: "Contact information saved, but email update failed. Please update your email in profile settings.",
        });
      }
    }
  };

  const handleAcademicSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const parsed = academicSchema.safeParse(academicValues);
    if (!parsed.success) {
      setAcademicErrors(
        toFieldErrorMap<AcademicForm>(parsed.error.flatten().fieldErrors),
      );
      toast({
        variant: "destructive",
        title: "Please review academic details",
        description: "Fix the highlighted fields before continuing.",
      });
      return;
    }

    const sanitized = parsed.data;
    setAcademicValues(sanitized);
    setAcademicErrors({});
    await handleStepSubmit(3, sanitized);
  };

  const handleDocumentationSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const parsed = documentationSchema.safeParse(documentationValues);
    if (!parsed.success) {
      setDocumentationErrors(
        toFieldErrorMap<DocumentationForm>(
          parsed.error.flatten().fieldErrors,
        ),
      );
      toast({
        variant: "destructive",
        title: "Please review your documentation",
        description: "Fix the highlighted fields before continuing.",
      });
      return;
    }

    const sanitized: DocumentationForm = {
      ...parsed.data,
      visa_document:
        parsed.data.uk_citizen === "yes" ? "" : parsed.data.visa_document,
    };
    setDocumentationValues(sanitized);
    setDocumentationErrors({});
    
    // Save documents to student_documents table
    if (applicationId && user) {
      try {
        const documentsToSave: Array<{
          application_id: string;
          document_type: string;
          storage_path: string;
          original_filename?: string;
          mime_type?: string;
          uploaded_by: string;
        }> = [];

        // Passport document (scan)
        if (sanitized.passport_document) {
          const fileName = sanitized.passport_document.split("/").pop() || "passport.pdf";
          documentsToSave.push({
            application_id: applicationId,
            document_type: "passport",
            storage_path: sanitized.passport_document,
            original_filename: fileName,
            uploaded_by: user.id,
          });
        }

        // Passport photo / profile photo
        if (sanitized.passport_photo) {
          const fileName =
            sanitized.passport_photo.split("/").pop() || "passport_photo";
          documentsToSave.push({
            application_id: applicationId,
            document_type: "passport_photo",
            storage_path: sanitized.passport_photo,
            original_filename: fileName,
            uploaded_by: user.id,
          });
        }

        // Student proof document
        if (sanitized.student_proof) {
          const fileName =
            sanitized.student_proof.split("/").pop() || "student_proof";
          documentsToSave.push({
            application_id: applicationId,
            document_type: "student_proof",
            storage_path: sanitized.student_proof,
            original_filename: fileName,
            uploaded_by: user.id,
          });
        }

        // Visa document (only if not UK citizen)
        if (sanitized.visa_document && sanitized.uk_citizen !== "yes") {
          const fileName = sanitized.visa_document.split("/").pop() || "visa.pdf";
          documentsToSave.push({
            application_id: applicationId,
            document_type: "visa",
            storage_path: sanitized.visa_document,
            original_filename: fileName,
            uploaded_by: user.id,
          });
        }

        // Insert documents if any
        if (documentsToSave.length > 0) {
          // Check if documents already exist for this application to avoid duplicates
          const { data: existingDocs } = await supabase
            .from("student_documents")
            .select("id, document_type, storage_path")
            .eq("application_id", applicationId);

          const existingPaths = new Set(existingDocs?.map(d => d.storage_path) || []);
          const newDocuments = documentsToSave.filter(doc => !existingPaths.has(doc.storage_path));

          if (newDocuments.length > 0) {
            const { error: docError } = await supabase
              .from("student_documents")
              .insert(newDocuments);

            if (docError) {
              console.error("Error saving documents to database:", docError);
              // Don't block submission if document save fails
            }
          }
        }
      } catch (error) {
        console.error("Error processing documents:", error);
        // Don't block submission if document processing fails
      }
    }

    await handleStepSubmit(4, sanitized);
  };

  const linkPayment = useLinkPaymentToApplication();

  const handlePaymentSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!application) return;
    
    // Check if deposit is paid OR payment is verified (but not yet linked)
    const depositIsPaidOrVerified = depositPaid || 
      (paymentValues.already_paid_deposit && paymentVerification && !paymentVerification.is_linked);
    
    if (!depositIsPaidOrVerified) {
      toast({
        variant: "destructive",
        title: "Pay deposit to continue",
        description:
          "Once your deposit is confirmed you can submit and sign your agreements.",
      });
      return;
    }
    if (resolvedPlans.length > 0 && !paymentValues.selected_plan_id) {
      toast({
        variant: "destructive",
        title: "Select an instalment plan",
        description:
          "Choose one of the available instalment plans to continue.",
      });
      setPaymentErrors((prev) => ({
        ...prev,
        selected_plan_id: "Select an instalment plan",
      }));
      return;
    }

    const parsed = paymentSchema.safeParse(paymentValues);
    if (!parsed.success) {
      setPaymentErrors(
        toFieldErrorMap<PaymentForm>(parsed.error.flatten().fieldErrors),
      );
      toast({
        variant: "destructive",
        title: "Please review payment & guarantor details",
        description: "Fix the highlighted fields before submitting.",
      });
      return;
    }

    const sanitized = parsed.data;
    const conditionalErrors: FieldErrorMap<PaymentForm> = {};
    if (resolvedPlans.length > 0 && !sanitized.selected_plan_id) {
      conditionalErrors.selected_plan_id = "Select an instalment plan";
    }
    if (requiresGuarantor) {
      const guarantorFields: Array<[keyof PaymentForm, string]> = [
        ["guarantor_name", "Guarantor name is required"],
        ["guarantor_email", "Guarantor email is required"],
        ["guarantor_phone", "Guarantor phone is required"],
        ["guarantor_relationship", "Relationship to the student is required"],
        ["guarantor_dob", "Guarantor date of birth is required"],
        ["utility_bill", "Upload a recent utility bill"],
        ["id_document", "Upload the guarantor's ID"],
        ["bank_statement", "Upload the latest bank statement"],
      ];
      guarantorFields.forEach(([field, message]) => {
        if (!hasMeaningfulValue(sanitized[field])) {
          conditionalErrors[field] = message;
        }
      });
    } else {
      // Witness is now optional - no validation required
      // If witness details are provided, they will be used; if not, tenancy will go directly to guarantor
    }

    if (Object.keys(conditionalErrors).length) {
      setPaymentErrors((prev) => ({ ...prev, ...conditionalErrors }));
      toast({
        variant: "destructive",
        title: requiresGuarantor
          ? "Add guarantor details"
          : "Add witness details",
        description: requiresGuarantor
          ? "We need full guarantor information and documents before we can send agreements."
          : "Provide the witness who will sign your tenancy agreement.",
      });
      return;
    }

    setPaymentValues(sanitized);
    setPaymentErrors({});
    
    // Link payment if "Already Paid Deposit" is checked and receipt number is verified
    if (sanitized.already_paid_deposit && sanitized.receipt_number?.trim() && paymentVerification) {
      if (paymentVerification.is_linked) {
        toast({
          variant: "destructive",
          title: "Payment already linked",
          description: "This payment has already been linked to another application.",
        });
        return;
      }
      
      if (paymentVerification.payment_type !== "deposit") {
        toast({
          variant: "destructive",
          title: "Invalid payment type",
          description: "This receipt number is for an instalment payment, not a deposit.",
        });
        return;
      }

      try {
        await linkPayment.mutateAsync({
          receiptNumber: sanitized.receipt_number.trim(),
          applicationId: application.id,
        });
        
        // Update local state and sanitized data to mark deposit as paid
        setPaymentValues((prev) => ({
          ...prev,
          deposit_paid: true,
        }));
        sanitized.deposit_paid = true;
        
        toast({
          title: "Payment verified",
          description: `Deposit payment of £${paymentVerification.amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })} verified and linked successfully.`,
        });
      } catch (error: any) {
        console.error("Failed to link payment:", error);
        toast({
          variant: "destructive",
          title: "Failed to link payment",
          description: error?.message || "Please try again or contact support.",
        });
        return;
      }
    }
    
    let planPersisted = true;
    if (sanitized.selected_plan_id) {
      planPersisted = await persistSelectedPlan(
        sanitized.selected_plan_id,
        application?.selected_payment_plan_id ?? undefined,
      );
    }
    if (!planPersisted) {
      return;
    }

    // Save guarantor documents to student_documents table
    if (applicationId && user && requiresGuarantor) {
      try {
        const documentsToSave: Array<{
          application_id: string;
          document_type: string;
          storage_path: string;
          original_filename?: string;
          mime_type?: string;
          uploaded_by: string;
        }> = [];

        // Guarantor documents
        if (sanitized.utility_bill) {
          const fileName = sanitized.utility_bill.split("/").pop() || "utility_bill.pdf";
          documentsToSave.push({
            application_id: applicationId,
            document_type: "utility_bill",
            storage_path: sanitized.utility_bill,
            original_filename: fileName,
            uploaded_by: user.id,
          });
        }

        if (sanitized.id_document) {
          const fileName = sanitized.id_document.split("/").pop() || "id_document.pdf";
          documentsToSave.push({
            application_id: applicationId,
            document_type: "id_document",
            storage_path: sanitized.id_document,
            original_filename: fileName,
            uploaded_by: user.id,
          });
        }

        if (sanitized.bank_statement) {
          const fileName = sanitized.bank_statement.split("/").pop() || "bank_statement.pdf";
          documentsToSave.push({
            application_id: applicationId,
            document_type: "bank_statement",
            storage_path: sanitized.bank_statement,
            original_filename: fileName,
            uploaded_by: user.id,
          });
        }

        // Insert documents if any
        if (documentsToSave.length > 0) {
          // Check if documents already exist for this application to avoid duplicates
          const { data: existingDocs } = await supabase
            .from("student_documents")
            .select("id, document_type, storage_path")
            .eq("application_id", applicationId);

          const existingPaths = new Set(existingDocs?.map(d => d.storage_path) || []);
          const newDocuments = documentsToSave.filter(doc => !existingPaths.has(doc.storage_path));

          if (newDocuments.length > 0) {
            const { error: docError } = await supabase
              .from("student_documents")
              .insert(newDocuments);

            if (docError) {
              console.error("Error saving guarantor documents to database:", docError);
              // Don't block submission if document save fails
            }
          }
        }
      } catch (error) {
        console.error("Error processing guarantor documents:", error);
        // Don't block submission if document processing fails
      }
    }

    await handleStepSubmit(5, sanitized);

    if (!application.id) {
      toast({
        variant: "destructive",
        title: "Application not found",
        description: "Please reload the page and try submitting again.",
      });
      return;
    }

    // Staff complete applications by uploading signed documents in Step 6 (no DocuSign)
    if (isStaff) {
      setCurrentStep(MAX_STEP_NUMBER);
      writeStoredStep(application.id, MAX_STEP_NUMBER);
      await refetchApplication();
      toast({
        title: "Step 5 saved",
        description: "Upload the signed tenancy and guarantor agreements in Step 6.",
      });
      return;
    }

    try {
      setSendingAgreements(true);
      const { data, error } = await supabase.functions.invoke<{
        tenancyEnvelopeId?: string;
        guarantorEnvelopeId?: string;
        message?: string;
        error?: string;
        error_code?: string;
        hint?: string;
      }>("docusign-envelopes", {
        body: { applicationId: application.id },
      });

      if (error || data?.error) {
        console.error("DocuSign invoke failed", {
          applicationId: application.id,
          functionError: error,
          functionData: data,
        });
        throw new Error(data?.error ?? error?.message ?? "Unknown error");
      }

      toast({
        title: "Agreements sent",
        description:
          data?.message ??
          "Check your inbox for the tenancy agreement. Your guarantor will receive their agreement separately.",
      });

      const nowIso = new Date().toISOString();
      setPendingEnvelopes((prev) => ({
        tenancy: data?.tenancyEnvelopeId
          ? {
            envelope_type: "tenancy",
            envelope_id: data.tenancyEnvelopeId,
            status: "sent",
            updated_at: nowIso,
          }
          : prev.tenancy,
        guarantor:
          requiresGuarantor && data?.guarantorEnvelopeId
            ? {
              envelope_type: "guarantor",
              envelope_id: data.guarantorEnvelopeId,
              status: "sent",
              updated_at: nowIso,
            }
            : prev.guarantor,
      }));

      // Move to Step 6 first so user can see the success
      if (application.id) {
        setCurrentStep(MAX_STEP_NUMBER);
        writeStoredStep(application.id, MAX_STEP_NUMBER);
      }

      // Wait a moment for the database to save the envelope records, then refetch
      // The pendingEnvelopes state will be used as fallback until real data arrives
      await new Promise((resolve) => setTimeout(resolve, 500));
      await refetchApplication();
      
      // Refetch again after a short delay to ensure envelope data is available
      // This handles cases where database replication might have a slight delay
      setTimeout(async () => {
        await refetchApplication();
      }, 1000);
    } catch (error) {
      console.error("Unable to trigger DocuSign:", error);
      toast({
        variant: "destructive",
        title: "Unable to send agreements",
        description:
          error instanceof Error ? error.message : "Please try again later.",
      });
    } finally {
      setSendingAgreements(false);
    }
  };

  const handleUploadClick = <T extends Record<string, unknown>>(
    field: keyof T,
    setter: Dispatch<SetStateAction<T>>,
    setErrors: Dispatch<SetStateAction<FieldErrorMap<T>>>,
  ) => {
    if (!user || !applicationId) {
      toast({
        variant: "destructive",
        title: "Upload unavailable",
        description: "Please sign in again to upload documents.",
      });
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    // Restrict to PNG, JPG/JPEG, WEBP, PDF, DOCX
    input.accept =
      "image/png,image/jpeg,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0] ?? null;
      if (!file) return;

      const fieldKey = String(field);
      const extension = file.name.toLowerCase().split(".").pop() ?? "";
      const allowedExtensions = [
        "png",
        "jpg",
        "jpeg",
        "webp",
        "pdf",
        "docx",
      ];
      const allowedMimeTypes = [
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];

      const isAllowedExtension = allowedExtensions.includes(extension);
      const isAllowedMimeType = allowedMimeTypes.includes(file.type);

      if (!isAllowedExtension && !isAllowedMimeType) {
        toast({
          variant: "destructive",
          title: "Unsupported file type",
          description:
            "Please upload a PNG, JPG, WEBP, PDF, or DOCX file.",
        });
        return;
      }

      const isImage = file.type.startsWith("image/");
      const previewUrl = URL.createObjectURL(file);
      if (previewUrlsRef.current[fieldKey]) {
        URL.revokeObjectURL(previewUrlsRef.current[fieldKey]);
      }
      previewUrlsRef.current[fieldKey] = previewUrl;

      setUploadStates((prev) => ({
        ...prev,
        [fieldKey]: {
          status: "uploading",
          progress: 10,
          previewUrl,
          fileName: file.name,
          isImage,
        },
      }));

      let progress = 10;
      const interval = window.setInterval(() => {
        progress = Math.min(progress + 10, 90);
        setUploadStates((prev) => {
          const current = prev[fieldKey];
          if (!current || current.status !== "uploading") return prev;
          return {
            ...prev,
            [fieldKey]: {
              ...current,
              progress,
            },
          };
        });
      }, 200);

      try {
        const path = await uploadDocument(
          file,
          user.id,
          applicationId,
          fieldKey,
        );
        window.clearInterval(interval);
        setter((prev) => ({
          ...prev,
          [field]: path,
        }));
        setErrors((prev) => {
          if (!prev[field]) return prev;
          const next = { ...prev };
          delete next[field];
          return next;
        });
        setUploadStates((prev) => ({
          ...prev,
          [fieldKey]: {
            status: "uploaded",
            progress: 100,
            previewUrl,
            fileName: file.name,
            isImage,
          },
        }));
        toast({
          title: "Upload successful",
          description: "File uploaded successfully.",
        });
      } catch (error) {
        window.clearInterval(interval);
        console.error(error);
        URL.revokeObjectURL(previewUrl);
        delete previewUrlsRef.current[fieldKey];
        setUploadStates((prev) => ({
          ...prev,
          [fieldKey]: {
            status: "error",
            progress: 0,
            error:
              error && typeof error === "object" && "message" in error
                ? String((error as Error).message)
                : "Upload failed",
          },
        }));
        toast({
          variant: "destructive",
          title: "Upload failed",
          description:
            error && typeof error === "object" && "message" in error
              ? String((error as Error).message)
              : "Please try another file or try again.",
        });
      }
    };
    input.click();
  };

  const getStoredPathForField = useCallback(
    (fieldKey: string): string | undefined => {
      if (Object.prototype.hasOwnProperty.call(documentationValues, fieldKey)) {
        const value =
          documentationValues[fieldKey as keyof DocumentationForm];
        return value || undefined;
      }
      if (Object.prototype.hasOwnProperty.call(paymentValues, fieldKey)) {
        const value = paymentValues[fieldKey as keyof PaymentForm];
        return typeof value === "string" ? value : undefined;
      }
      return undefined;
    },
    [documentationValues, paymentValues],
  );

  const renderUploadCard = useCallback(
    <T extends Record<string, unknown>>(config: {
      field: keyof T;
      label: string;
      placeholderTitle: string;
      placeholderSubtitle?: string;
      helperText?: string;
      form: {
        values: T;
        errors: FieldErrorMap<T>;
        setter: Dispatch<SetStateAction<T>>;
        setErrors: Dispatch<SetStateAction<FieldErrorMap<T>>>;
      };
    }) => {
      const {
        field,
        label,
        placeholderTitle,
        placeholderSubtitle,
        helperText,
        form,
      } =
        config;
      const fieldKey = field as string;
      const state = uploadStates[fieldKey];
      const storedPath = form.values[field] as string | undefined;
      const fileName =
        state?.fileName ?? (storedPath ? extractFileName(storedPath) : undefined);
      const previewImage =
        state?.isImage && (state.previewUrl || state.remoteUrl)
          ? state.previewUrl ?? state.remoteUrl
          : undefined;
      const linkTarget = state?.remoteUrl;
      const isUploading = state?.status === "uploading";
      const uploadError = state?.error;
      const validationError = form.errors[field];
      const hasFile = Boolean(fileName || previewImage || linkTarget || storedPath);
      const statusLabel = isUploading
        ? `${Math.round(state.progress ?? 0)}%`
        : hasFile
          ? "1/1 uploaded"
          : "0/1 uploaded";
      const subtitleText =
        placeholderSubtitle ?? "Max 10MB • JPG, PNG, or PDF";

      const openPicker = () =>
        handleUploadClick<T>(field, form.setter, form.setErrors);

      return (
        <div className="space-y-2">
          <Label>{label}</Label>
          <div
            className={cn(
              "relative overflow-hidden rounded-3xl border border-dashed transition-colors",
              hasFile
                ? "border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10"
                : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/30",
            )}
          >
            <div className="absolute right-4 top-3 text-xs font-medium text-muted-foreground">
              {statusLabel}
            </div>
            <button
              type="button"
              onClick={openPicker}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-3 px-6 py-10 text-center transition-colors",
                hasFile ? "md:flex-row md:items-stretch md:justify-between md:text-left md:py-6" : "cursor-pointer",
              )}
            >
              {hasFile ? (
                <>
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-background/90">
                      {previewImage ? (
                        <img
                          src={previewImage}
                          alt={fileName ?? "Uploaded document"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <p className="max-w-[200px] truncate text-sm font-semibold text-foreground md:max-w-none">
                        {fileName ?? "Document uploaded"}
                      </p>
                      {linkTarget && (
                        <a
                          href={linkTarget}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-primary underline"
                        >
                          Open in new tab
                        </a>
                      )}
                      {uploadError && (
                        <p className="text-xs text-destructive">{uploadError}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary md:self-center">
                    Replace
                  </span>
                </>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-border/60 text-muted-foreground">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {placeholderTitle}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {subtitleText}
                    </p>
                  </div>
                </>
              )}
            </button>
            {isUploading && (
              <div className="absolute inset-x-0 bottom-0">
                <Progress value={state.progress ?? 0} className="h-1 rounded-none" />
              </div>
            )}
          </div>
          {helperText && (
            <p className="text-xs text-muted-foreground">{helperText}</p>
          )}
          {validationError && (
            <p className="text-xs text-destructive">{validationError}</p>
          )}
        </div>
      );
    },
    [handleUploadClick, uploadStates],
  );

  const createDepositPaymentIntent = async () => {
    if (!application?.id) return;
    if (depositPaid) {
      toast({
        title: "Deposit already received",
        description:
          "Thanks! We’ve already recorded your deposit. Continue with the submission instead of paying again.",
      });
      return;
    }
    setCreatingIntent(true);

    const { data, error } = await supabase.functions.invoke<{
      clientSecret?: string;
      amount?: number;
      currency?: string;
      error?: string;
    }>("create-payment", {
      body: { applicationId: application.id },
    });

    setCreatingIntent(false);

    if (error || data?.error || !data?.clientSecret || !data.amount) {
      toast({
        variant: "destructive",
        title: "Unable to start payment",
        description:
          data?.error ??
          error?.message ??
          "Please ensure a studio is reserved and try again.",
      });
      return;
    }

    setPaymentClientSecret(data.clientSecret);
    setPaymentAmount(data.amount);
    setPaymentCurrency((data.currency ?? "GBP").toUpperCase());
  };

  const depositValue = useMemo(() => {
    if (!application?.contract) return 99;
    const planDeposit = selectedPlan?.plan.deposit_amount ?? null;
    const fallbackPlanDeposit =
      resolvedPlans[0]?.plan.deposit_amount ?? null;

    return (
      application.contract.deposit_override ??
      (typeof planDeposit === "number" ? planDeposit : null) ??
      (typeof fallbackPlanDeposit === "number" ? fallbackPlanDeposit : null) ??
      99
    );
  }, [application, resolvedPlans, selectedPlan]);

  // All hooks that depend on application must be called before early returns
  // Make them safe to call even when application is null/undefined
  const docusignEnvelopes = application?.docusign_envelopes ?? [];
  const tenancyEnvelope = useMemo(
    () => docusignEnvelopes.find((item) => item.envelope_type === "tenancy"),
    [docusignEnvelopes],
  );
  const guarantorEnvelope = useMemo(
    () => docusignEnvelopes.find((item) => item.envelope_type === "guarantor"),
    [docusignEnvelopes],
  );
  const effectiveTenancyEnvelope = tenancyEnvelope ?? pendingEnvelopes.tenancy;
  const effectiveGuarantorEnvelope =
    guarantorEnvelope ?? pendingEnvelopes.guarantor;

  useEffect(() => {
    if (tenancyEnvelope && pendingEnvelopes.tenancy) {
      setPendingEnvelopes((prev) =>
        prev.tenancy ? { ...prev, tenancy: null } : prev,
      );
    }
  }, [tenancyEnvelope, pendingEnvelopes.tenancy]);

  useEffect(() => {
    if (guarantorEnvelope && pendingEnvelopes.guarantor) {
      setPendingEnvelopes((prev) =>
        prev.guarantor ? { ...prev, guarantor: null } : prev,
      );
    }
  }, [guarantorEnvelope, pendingEnvelopes.guarantor]);

  // Calculate completed steps - safe even if application is null
  const completedSteps = useMemo(() => {
    if (!application?.student_application_steps) return 0;
    return application.student_application_steps.filter(
      (step) => step.is_complete,
    ).length;
  }, [application?.student_application_steps]);

  // Check if all required signatures are completed - safe even if application is null
  const allSignaturesCompleted = useMemo(() => {
    if (!docusignEnvelopes || docusignEnvelopes.length === 0) return false;
    
    // Check if tenancy envelope is completed
    const tenancyCompleted = effectiveTenancyEnvelope && 
      isEnvelopeCompleted(effectiveTenancyEnvelope.status);
    
    // If guarantor is required, check if guarantor envelope is also completed
    if (requiresGuarantor) {
      const guarantorCompleted = effectiveGuarantorEnvelope && 
        isEnvelopeCompleted(effectiveGuarantorEnvelope.status);
      return tenancyCompleted && guarantorCompleted;
    }
    
    return tenancyCompleted;
  }, [docusignEnvelopes, effectiveTenancyEnvelope, effectiveGuarantorEnvelope, requiresGuarantor]);

  const depositAmountFormatted = useMemo(() => {
    const formatter = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    });
    return formatter.format(depositValue);
  }, [depositValue]);

  // Payment verification hook
  const receiptNumberToVerify = paymentValues.already_paid_deposit && paymentValues.receipt_number?.trim()
    ? paymentValues.receipt_number.trim()
    : null;
  const { data: paymentVerification, isLoading: isValidatingPayment } = useVerifyPayment(
    receiptNumberToVerify || undefined
  );

  const depositPaid = useMemo(() => {
    // Check local state first (for immediate updates)
    if (paymentValues.deposit_paid === true) {
      return true;
    }
    
    // Check if payment was verified via receipt number
    if (paymentValues.already_paid_deposit && paymentVerification && !paymentVerification.is_linked) {
      return true; // Payment verified but not yet linked (will be linked on submit)
    }
    
    if (!application) return false;
    if (
      application.status === "awaiting_signature" ||
      application.status === "awaiting_verification" ||
      application.status === "confirmed"
    ) {
      return true;
    }
    const stepFive = application.student_application_steps.find(
      (step) => step.step_number === 5,
    );
    const depositFlag =
      stepFive?.payload &&
      typeof stepFive.payload === "object" &&
      (stepFive.payload as Record<string, unknown>).deposit_paid === true;
    return Boolean(depositFlag);
  }, [application, paymentValues.deposit_paid, paymentValues.already_paid_deposit, paymentVerification]);

  const checkEnvelopeStatus = async () => {
    if (!application?.id || checkingStatus) return;
    
    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "docusign-check-status",
        {
          body: { applicationId: application.id },
        },
      );

      if (error) {
        console.error("Error checking envelope status:", error);
        toast({
          variant: "destructive",
          title: "Status check failed",
          description: "Unable to check envelope status. Please try again.",
        });
        return;
      }

      // Refetch application to get updated envelope status
      await refetchApplication();
      
      if (data?.updates?.some((u: { updated: boolean }) => u.updated)) {
        toast({
          title: "Status updated",
          description: "Envelope status has been refreshed.",
        });
      }
    } catch (error) {
      console.error("Error checking envelope status:", error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleStaffUploadSignedDocument = async (envelopeType: "tenancy" | "guarantor", file: File) => {
    if (!application?.id || !user) return;
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
      await refetchApplication();
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

  // Auto-poll envelope status when on Step 6
  useEffect(() => {
    if (currentStep !== 6 || !application?.id) return;
    
    let mounted = true;
    
    const performCheck = async () => {
      if (!mounted || checkingStatus) return;
      
      setCheckingStatus(true);
      try {
        const { error } = await supabase.functions.invoke(
          "docusign-check-status",
          {
            body: { applicationId: application.id },
          },
        );

        if (error) {
          console.error("Error checking envelope status:", error);
          return;
        }

        // Refetch application to get updated envelope status
        await refetchApplication();
      } catch (error) {
        console.error("Error checking envelope status:", error);
      } finally {
        if (mounted) {
          setCheckingStatus(false);
        }
      }
    };
    
    // Check immediately
    performCheck();
    
    // Then poll every 5 minutes as backup (webhooks handle real-time updates)
    // Reduced from 30 seconds to 5 minutes since webhooks provide instant updates
    const interval = setInterval(() => {
      performCheck();
    }, 300000); // 5 minutes = 300,000 milliseconds

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [currentStep, application?.id, refetchApplication]);

  const handleDepositSuccess = async () => {
    const applicationId = application?.id ?? null;
    if (!applicationId) {
      console.warn("No application ID when deposit succeeded");
      return;
    }

    // Save Step 5 data with deposit flag using the proper saveStep mutation
    try {
      await saveStep({
        stepNumber: 5,
        data: {
          ...paymentValues,
          deposit_paid: true,
        },
        isComplete: false, // Don't mark as complete yet - user still needs to submit
      });
    } catch (error) {
      console.error("Error saving Step 5 after deposit:", error);
      toast({
        variant: "destructive",
        title: "Error saving payment details",
        description: "Your deposit was received, but we couldn't save your payment details. Please refresh and try again.",
      });
      return;
    }

    // Update local state to reflect deposit is paid
    setPaymentValues((prev) => ({
      ...prev,
      deposit_paid: true,
    }));

    setPaymentClientSecret(null);
    
    // Refetch to get updated application state
    await refetchApplication();

    // Show success message
    toast({
      title: "Deposit received",
      description: "Your deposit has been confirmed. Please review your details and click 'Submit Application' to proceed.",
    });

    // Stay on Step 5 - don't auto-advance to Step 6
    // User needs to review and click "Submit Application" to create envelopes
  };

  if (isLoading) {
    return (
      <PortalLayout title="Booking Journey" subtitle="Loading your application">
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </PortalLayout>
    );
  }

  if (isError || !application) {
    return (
      <PortalLayout
        title="Booking Journey"
        subtitle="We could not find this application."
      >
        <Card className="rounded-3xl border-dashed">
          <CardHeader>
            <CardTitle className="text-xl font-display uppercase tracking-wide">
              Application Not Found
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              We couldn’t locate this application. Please return to your portal
              dashboard and start again.
            </p>
            <Button
              className="mt-6 rounded-full uppercase tracking-wide"
              onClick={() => navigate("/studios")}
            >
              Back to studios
            </Button>
          </CardContent>
        </Card>
      </PortalLayout>
    );
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <form className="space-y-6" onSubmit={handlePersonalSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  autoComplete="given-name"
                  value={personalValues.first_name}
                  onChange={(event) =>
                    handlePersonalChange("first_name", event.target.value)
                  }
                />
                {personalErrors.first_name && (
                  <p className="mt-1 text-xs text-destructive">
                    {personalErrors.first_name}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  autoComplete="family-name"
                  value={personalValues.last_name}
                  onChange={(event) =>
                    handlePersonalChange("last_name", event.target.value)
                  }
                />
                {personalErrors.last_name && (
                  <p className="mt-1 text-xs text-destructive">
                    {personalErrors.last_name}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="date_of_birth">Date of Birth</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  autoComplete="bday"
                  value={personalValues.date_of_birth}
                  onChange={(event) =>
                    handlePersonalChange("date_of_birth", event.target.value)
                  }
                />
                {personalErrors.date_of_birth && (
                  <p className="mt-1 text-xs text-destructive">
                    {personalErrors.date_of_birth}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  inputMode="numeric"
                  min={16}
                  value={personalValues.age}
                  readOnly
                  aria-readonly="true"
                  className="bg-muted/40"
                />
                {personalErrors.age && (
                  <p className="mt-1 text-xs text-destructive">
                    {personalErrors.age}
                  </p>
                )}
              </div>
              <div>
                <Label id="ethnicity-label">Ethnicity</Label>
                <Select
                  value={personalValues.ethnicity}
                  onValueChange={(value) => handlePersonalChange("ethnicity", value)}
                >
                  <SelectTrigger
                    id="ethnicity"
                    aria-labelledby="ethnicity-label"
                    aria-invalid={Boolean(personalErrors.ethnicity)}
                  >
                    {personalValues.ethnicity ? (
                      <SelectValue />
                    ) : (
                      <span className="text-muted-foreground">Select</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {ethnicityOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {personalErrors.ethnicity && (
                  <p className="mt-1 text-xs text-destructive">
                    {personalErrors.ethnicity}
                  </p>
                )}
              </div>
              <div>
                <Label id="gender-label">Gender</Label>
                <Select
                  value={personalValues.gender}
                  onValueChange={(value) => handlePersonalChange("gender", value)}
                >
                  <SelectTrigger
                    id="gender"
                    aria-labelledby="gender-label"
                    aria-invalid={Boolean(personalErrors.gender)}
                  >
                    {personalValues.gender ? (
                      <SelectValue />
                    ) : (
                      <span className="text-muted-foreground">Select</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {genders.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {personalErrors.gender && (
                  <p className="mt-1 text-xs text-destructive">
                    {personalErrors.gender}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="referral_code">Partner Referral Code (optional)</Label>
                <div className="relative">
                  <Input
                    id="referral_code"
                    autoComplete="off"
                    placeholder="Enter referral code if you were referred by a partner"
                    value={personalValues.referral_code || ""}
                    onChange={(event) =>
                      handlePersonalChange("referral_code", event.target.value)
                    }
                    className={cn(
                      personalValues.referral_code?.trim() &&
                        (referralValidation?.is_valid
                          ? "border-green-500 focus-visible:ring-green-500"
                          : referralValidation?.is_valid === false
                            ? "border-red-500 focus-visible:ring-red-500"
                            : ""),
                    )}
                  />
                  {personalValues.referral_code?.trim() && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isValidatingReferral ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : referralValidation?.is_valid ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : referralValidation?.is_valid === false ? (
                        <Info className="h-4 w-4 text-red-500" />
                      ) : null}
                    </div>
                  )}
                </div>
                {personalValues.referral_code?.trim() && referralValidation && (
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      referralValidation.is_valid
                        ? "text-green-600"
                        : "text-destructive",
                    )}
                  >
                    {referralValidation.is_valid
                      ? `✓ Valid code - Referred by ${referralValidation.partner_name}`
                      : "Invalid referral code. Please check and try again."}
                  </p>
                )}
                {!personalValues.referral_code?.trim() && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    If you were referred by a partner, enter their referral code here
                  </p>
                )}
                {personalErrors.referral_code && (
                  <p className="mt-1 text-xs text-destructive">
                    {personalErrors.referral_code}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="ucas_id">UCAS ID</Label>
                <Input
                  id="ucas_id"
                  autoComplete="off"
                  value={personalValues.ucas_id}
                  onChange={(event) =>
                    handlePersonalChange("ucas_id", event.target.value)
                  }
                />
                {personalErrors.ucas_id && (
                  <p className="mt-1 text-xs text-destructive">
                    {personalErrors.ucas_id}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="country">Country</Label>
                <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="country"
                      variant="outline"
                      role="combobox"
                      aria-expanded={countryOpen}
                      aria-invalid={Boolean(personalErrors.country)}
                      className={cn(
                        "w-full justify-between",
                        !personalValues.country && "text-muted-foreground",
                      )}
                    >
                      {personalValues.country || "Select country"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search country..." />
                      <CommandList>
                        <CommandEmpty>No country found.</CommandEmpty>
                        <CommandGroup heading="Countries">
                          {countries.map((option) => (
                            <CommandItem
                              key={option}
                              value={option}
                              onSelect={() => {
                                handlePersonalChange("country", option);
                                setCountryOpen(false);
                              }}
                              className="flex items-center gap-2"
                            >
                              <Check
                                className={cn(
                                  "h-4 w-4",
                                  personalValues.country === option
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              <span>{option}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {personalErrors.country && (
                  <p className="mt-1 text-xs text-destructive">
                    {personalErrors.country}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="submit"
                className="rounded-full uppercase tracking-wide"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save & Continue"
                )}
              </Button>
            </div>
          </form>
        );
      case 2:
        return (
          <form className="space-y-6" onSubmit={handleContactSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="contact_email">Email</Label>
                <Input
                  id="contact_email"
                  type="email"
                  autoComplete="email"
                  value={contactValues.email}
                  onChange={(event) =>
                    handleContactChange("email", event.target.value)
                  }
                />
                {contactErrors.email && (
                  <p className="mt-1 text-xs text-destructive">
                    {contactErrors.email}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="contact_mobile">Mobile Number</Label>
                <Input
                  id="contact_mobile"
                  type="tel"
                  autoComplete="tel"
                  value={contactValues.mobile}
                  onChange={(event) =>
                    handleContactChange("mobile", event.target.value)
                  }
                />
                {contactErrors.mobile && (
                  <p className="mt-1 text-xs text-destructive">
                    {contactErrors.mobile}
                  </p>
                )}
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="address_line_1">Address Line 1</Label>
                <Input
                  id="address_line_1"
                  autoComplete="address-line1"
                  value={contactValues.address_line_1}
                  onChange={(event) =>
                    handleContactChange("address_line_1", event.target.value)
                  }
                />
                {contactErrors.address_line_1 && (
                  <p className="mt-1 text-xs text-destructive">
                    {contactErrors.address_line_1}
                  </p>
                )}
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="address_line_2">Address Line 2</Label>
                <Input
                  id="address_line_2"
                  autoComplete="address-line2"
                  value={contactValues.address_line_2}
                  onChange={(event) =>
                    handleContactChange("address_line_2", event.target.value)
                  }
                />
                {contactErrors.address_line_2 && (
                  <p className="mt-1 text-xs text-destructive">
                    {contactErrors.address_line_2}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="postcode">Postcode</Label>
                <Input
                  id="postcode"
                  autoComplete="postal-code"
                  value={contactValues.postcode}
                  onChange={(event) =>
                    handleContactChange("postcode", event.target.value)
                  }
                />
                {contactErrors.postcode && (
                  <p className="mt-1 text-xs text-destructive">
                    {contactErrors.postcode}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="town">Town / City</Label>
                <Input
                  id="town"
                  autoComplete="address-level2"
                  value={contactValues.town}
                  onChange={(event) =>
                    handleContactChange("town", event.target.value)
                  }
                />
                {contactErrors.town && (
                  <p className="mt-1 text-xs text-destructive">
                    {contactErrors.town}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-full uppercase tracking-wide"
                onClick={() => setCurrentStep(1)}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="rounded-full uppercase tracking-wide"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save & Continue"
                )}
              </Button>
            </div>
          </form>
        );
      case 3:
        return (
          <form className="space-y-6" onSubmit={handleAcademicSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label id="year_of_study-label">Year of Study</Label>
                <Select
                  value={academicValues.year_of_study}
                  onValueChange={(value) =>
                    handleAcademicChange("year_of_study", value)
                  }
                >
                  <SelectTrigger
                    id="year_of_study"
                    aria-labelledby="year_of_study-label"
                    aria-invalid={Boolean(academicErrors.year_of_study)}
                  >
                    {academicValues.year_of_study ? (
                      <SelectValue />
                    ) : (
                      <span className="text-muted-foreground">Select</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {yearOfStudyOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {academicErrors.year_of_study && (
                  <p className="mt-1 text-xs text-destructive">
                    {academicErrors.year_of_study}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="field_of_study">
                  Course / Field of Study
                </Label>
                <Input
                  id="field_of_study"
                  value={academicValues.field_of_study}
                  onChange={(event) =>
                    handleAcademicChange("field_of_study", event.target.value)
                  }
                />
                {academicErrors.field_of_study && (
                  <p className="mt-1 text-xs text-destructive">
                    {academicErrors.field_of_study}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <Label>Do you have a disability?</Label>
                <RadioGroup
                  value={academicValues.disabled}
                  onValueChange={(value) =>
                    handleAcademicChange("disabled", value)
                  }
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="disabled-yes" />
                    <Label htmlFor="disabled-yes">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="disabled-no" />
                    <Label htmlFor="disabled-no">No</Label>
                  </div>
                </RadioGroup>
                {academicErrors.disabled && (
                  <p className="mt-1 text-xs text-destructive">
                    {academicErrors.disabled}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <Label>Are you a smoker?</Label>
                <RadioGroup
                  value={academicValues.smoker}
                  onValueChange={(value) =>
                    handleAcademicChange("smoker", value)
                  }
                  className="flex flex-col gap-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id="smoker-yes" />
                    <Label htmlFor="smoker-yes">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id="smoker-no" />
                    <Label htmlFor="smoker-no">No</Label>
                  </div>
                </RadioGroup>
                {academicErrors.smoker && (
                  <p className="mt-1 text-xs text-destructive">
                    {academicErrors.smoker}
                  </p>
                )}
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="medical_requirements">
                  Medical Requirements (if any)
                </Label>
                <Textarea
                  id="medical_requirements"
                  value={academicValues.medical_requirements}
                  onChange={(event) =>
                    handleAcademicChange(
                      "medical_requirements",
                      event.target.value,
                    )
                  }
                  placeholder="Tell us about any medical details we should know."
                />
                {academicErrors.medical_requirements && (
                  <p className="mt-1 text-xs text-destructive">
                    {academicErrors.medical_requirements}
                  </p>
                )}
              </div>
              <div className="md:col-span-2">
                <Label id="entry-uk-label">Entry into UK</Label>
                <Select
                  value={academicValues.entry_into_uk}
                  onValueChange={(value) =>
                    handleAcademicChange("entry_into_uk", value)
                  }
                >
                  <SelectTrigger
                    id="entry_into_uk"
                    aria-labelledby="entry-uk-label"
                    aria-invalid={Boolean(academicErrors.entry_into_uk)}
                  >
                    {academicValues.entry_into_uk ? (
                      <SelectValue />
                    ) : (
                      <span className="text-muted-foreground">Select</span>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {entryOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {academicErrors.entry_into_uk && (
                  <p className="mt-1 text-xs text-destructive">
                    {academicErrors.entry_into_uk}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-full uppercase tracking-wide"
                onClick={() => setCurrentStep(2)}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="rounded-full uppercase tracking-wide"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save & Continue"
                )}
              </Button>
            </div>
          </form>
        );
      case 4:
        return (
          <form className="space-y-6" onSubmit={handleDocumentationSubmit}>
            <div className="space-y-3">
              <Label>Are you a UK citizen?</Label>
              <RadioGroup
                value={documentationValues.uk_citizen}
                onValueChange={(value) =>
                  handleDocumentationChange("uk_citizen", value)
                }
                className="flex flex-col gap-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yes" id="uk-yes" />
                  <Label htmlFor="uk-yes">Yes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="no" id="uk-no" />
                  <Label htmlFor="uk-no">No</Label>
                </div>
              </RadioGroup>
              {documentationErrors.uk_citizen && (
                <p className="mt-1 text-xs text-destructive">
                  {documentationErrors.uk_citizen}
                </p>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {renderUploadCard<DocumentationForm>({
                field: "passport_photo",
                label: "Student Passport Photo",
                placeholderTitle: "Upload passport-style photo",
                placeholderSubtitle:
                  "Max 10MB • PNG, JPG, WEBP, PDF, DOCX",
                helperText:
                  "Required for check-in identification. Image recommended.",
                form: {
                  values: documentationValues,
                  errors: documentationErrors,
                  setter: setDocumentationValues,
                  setErrors: setDocumentationErrors,
                },
              })}
              {renderUploadCard<DocumentationForm>({
                field: "student_proof",
                label: "Student Proof Document",
                placeholderTitle: "Upload proof of student status",
                placeholderSubtitle:
                  "Max 10MB • PNG, JPG, WEBP, PDF, DOCX",
                helperText:
                  "Upload UCAS confirmation, university letter, or similar proof.",
                form: {
                  values: documentationValues,
                  errors: documentationErrors,
                  setter: setDocumentationValues,
                  setErrors: setDocumentationErrors,
                },
              })}
              {renderUploadCard<DocumentationForm>({
                field: "passport_document",
                label: "Passport (Scan)",
                placeholderTitle: "Upload passport scan",
                placeholderSubtitle:
                  "Max 10MB • PNG, JPG, WEBP, PDF, DOCX",
                helperText: "Upload a clear scan or photo of your passport.",
                form: {
                  values: documentationValues,
                  errors: documentationErrors,
                  setter: setDocumentationValues,
                  setErrors: setDocumentationErrors,
                },
              })}
              {documentationValues.uk_citizen === "no" &&
                renderUploadCard<DocumentationForm>({
                  field: "visa_document",
                  label: "Visa",
                  placeholderTitle: "Upload visa document",
                  placeholderSubtitle:
                    "Required if you are not a UK citizen",
                  helperText:
                    "Accepted formats: PNG, JPG, WEBP, PDF, DOCX up to 10MB.",
                  form: {
                    values: documentationValues,
                    errors: documentationErrors,
                    setter: setDocumentationValues,
                    setErrors: setDocumentationErrors,
                  },
                })}
            </div>
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-full uppercase tracking-wide"
                onClick={() => setCurrentStep(3)}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="rounded-full uppercase tracking-wide"
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  "Save & Continue"
                )}
              </Button>
            </div>
          </form>
        );
      case 5:
        return (
          <form className="space-y-6" onSubmit={handlePaymentSubmit}>
            <div className="space-y-3">
              <Label>
                {resolvedPlans.length
                  ? "Select your instalment plan"
                  : "Payment preference"}
              </Label>
              {loadingPlans ? (
                <div className="rounded-2xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                  Loading instalment plans…
                </div>
              ) : resolvedPlans.length ? (
                <Tabs
                  value={
                    paymentValues.selected_plan_id ||
                    resolvedPlans[0]?.planId ||
                    ""
                  }
                  onValueChange={(value) => {
                    if (!value) return;
                    const previousValue = paymentValues.selected_plan_id;
                    handlePaymentChange("selected_plan_id", value);
                    void persistSelectedPlan(value, previousValue ?? undefined);
                  }}
                  className="w-full"
                >
                  <div className="overflow-x-auto scroll-smooth -mx-1 px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <TabsList className="bg-muted/60 rounded-full p-1 flex gap-1 w-max min-w-full">
                    {resolvedPlans.map((plan) => (
                      <TabsTrigger
                        key={plan.planId}
                        value={plan.planId}
                        className="rounded-full px-4 py-1 text-xs uppercase tracking-wide data-[state=active]:bg-background whitespace-nowrap flex-shrink-0 snap-start"
                      >
                        {plan.plan.name}
                      </TabsTrigger>
                    ))}
                    </TabsList>
                  </div>
                  {resolvedPlans.map((plan) => {
                    const schedule =
                      plan.plan.payment_plan_installments
                        ?.slice()
                        .sort(
                          (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
                        ) ?? [];
                    return (
                      <TabsContent
                        key={plan.planId}
                        value={plan.planId}
                        className="mt-4"
                      >
                        <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/30 p-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                Deposit
                              </p>
                              <p className="text-lg font-semibold">
                                £
                                {(plan.plan.deposit_amount ?? depositValue).toLocaleString(
                                  "en-GB",
                                  {
                                    minimumFractionDigits: 2,
                                  },
                                )}
                              </p>
                            </div>
                            {plan.plan.description && (
                              <p className="text-sm text-muted-foreground max-w-xl">
                                {plan.plan.description}
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            {schedule.length ? (
                              schedule.map((installment, index) => {
                                const amountLabel =
                                  installment.amount_type === "percentage"
                                    ? `${installment.amount_value}% of remaining balance`
                                    : `£${installment.amount_value.toLocaleString(
                                        "en-GB",
                                        {
                                          minimumFractionDigits: 2,
                                        },
                                      )}`;
                                const dueLabel = installment.due_date
                                  ? `Due ${format(
                                      new Date(installment.due_date),
                                      "d MMM yyyy",
                                    )}`
                                  : installment.due_date_offset_days !== null
                                  ? installment.due_date_offset_days < 0
                                    ? `Due ${Math.abs(
                                        installment.due_date_offset_days,
                                      )} days before contract start`
                                    : installment.due_date_offset_days === 0
                                    ? "Due on contract start date"
                                    : `Due ${installment.due_date_offset_days} days after contract start`
                                  : "Schedule to be confirmed";
                                const dueDateFormatted =
                                  !installment.due_date &&
                                  installment.due_date_offset_days != null &&
                                  application?.contract?.contract_start
                                    ? (() => {
                                        const start = new Date(application.contract!.contract_start);
                                        if (Number.isNaN(start.getTime())) return null;
                                        const d = new Date(start);
                                        d.setDate(d.getDate() + Number(installment.due_date_offset_days));
                                        return format(d, "d MMM yyyy");
                                      })()
                                    : null;
                                const fallbackLabel = `Instalment ${
                                  installment.sequence ?? ""
                                }`.trim();
                                return (
                                  <div
                                    key={installment.id ?? index}
                                    className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between"
                                  >
                                    <span className="text-sm font-medium tracking-wide uppercase">
                                      {installment.label ?? fallbackLabel}
                                    </span>
                                    <div className="text-right">
                                      <p className="text-sm font-semibold">
                                        {amountLabel}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {dueLabel}
                                      </p>
                                      {dueDateFormatted && (
                                        <p className="text-xs font-medium text-foreground/90 mt-0.5">
                                          {dueDateFormatted}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Instalment schedule will be confirmed by {companyName}.
                              </p>
                            )}
                          </div>
                        </div>
                      </TabsContent>
                    );
                  })}
                </Tabs>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground">
                  You've selected to pay in full. We'll send your tenancy agreement once the deposit is confirmed.
                  {paymentValues.witness_name && paymentValues.witness_email && " Your witness will also receive a copy to view."}
                </div>
              )}
              {paymentErrors.selected_plan_id && (
                <p className="text-xs text-destructive">
                  {paymentErrors.selected_plan_id}
                </p>
              )}
            </div>

            {requiresGuarantor && (
              <Card className="rounded-3xl border-dashed">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Guarantor Details
                  </CardTitle>
                  <CardDescription>
                    Your guarantor must be over 21 and resident in the UK or
                    Ireland.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="guarantor_name">Full Name</Label>
                    <Input
                      id="guarantor_name"
                      value={paymentValues.guarantor_name}
                      onChange={(event) =>
                        handlePaymentChange("guarantor_name", event.target.value)
                      }
                    />
                    {paymentErrors.guarantor_name && (
                      <p className="mt-1 text-xs text-destructive">
                        {paymentErrors.guarantor_name}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="guarantor_email">Email Address</Label>
                    <Input
                      id="guarantor_email"
                      type="email"
                      autoComplete="email"
                      value={paymentValues.guarantor_email}
                      onChange={(event) =>
                        handlePaymentChange(
                          "guarantor_email",
                          event.target.value,
                        )
                      }
                    />
                    {paymentErrors.guarantor_email && (
                      <p className="mt-1 text-xs text-destructive">
                        {paymentErrors.guarantor_email}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="guarantor_phone">Phone Number</Label>
                    <Input
                      id="guarantor_phone"
                      value={paymentValues.guarantor_phone}
                      onChange={(event) =>
                        handlePaymentChange(
                          "guarantor_phone",
                          event.target.value,
                        )
                      }
                    />
                    {paymentErrors.guarantor_phone && (
                      <p className="mt-1 text-xs text-destructive">
                        {paymentErrors.guarantor_phone}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="guarantor_relationship">
                      Relationship to Student
                    </Label>
                    <Input
                      id="guarantor_relationship"
                      value={paymentValues.guarantor_relationship}
                      onChange={(event) =>
                        handlePaymentChange(
                          "guarantor_relationship",
                          event.target.value,
                        )
                      }
                    />
                    {paymentErrors.guarantor_relationship && (
                      <p className="mt-1 text-xs text-destructive">
                        {paymentErrors.guarantor_relationship}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="guarantor_dob">Date of Birth</Label>
                    <Input
                      id="guarantor_dob"
                      type="date"
                      value={paymentValues.guarantor_dob}
                      onChange={(event) =>
                        handlePaymentChange("guarantor_dob", event.target.value)
                      }
                    />
                    {paymentErrors.guarantor_dob && (
                      <p className="mt-1 text-xs text-destructive">
                        {paymentErrors.guarantor_dob}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Witness fields - optional for all payment plans */}
            <Card className="rounded-3xl border-dashed">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  Witness Details (Optional)
                </CardTitle>
                <CardDescription>
                  Optionally provide an independent adult witness who will view your tenancy agreement. 
                  {requiresGuarantor 
                    ? " If provided, the witness will view the agreement before the guarantor signs."
                    : " If provided, the witness will view the agreement after you sign."}
                </CardDescription>
              </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label htmlFor="witness_name">Full Name (Optional)</Label>
                    <Input
                      id="witness_name"
                      value={paymentValues.witness_name}
                      onChange={(event) =>
                        handlePaymentChange("witness_name", event.target.value)
                      }
                      placeholder="Leave blank if not providing a witness"
                    />
                    {paymentErrors.witness_name && (
                      <p className="mt-1 text-xs text-destructive">
                        {paymentErrors.witness_name}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="witness_email">Email Address (Optional)</Label>
                    <Input
                      id="witness_email"
                      type="email"
                      value={paymentValues.witness_email}
                      onChange={(event) =>
                        handlePaymentChange("witness_email", event.target.value)
                      }
                      placeholder="Leave blank if not providing a witness"
                    />
                    {paymentErrors.witness_email && (
                      <p className="mt-1 text-xs text-destructive">
                        {paymentErrors.witness_email}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="witness_phone">Phone Number (Optional)</Label>
                    <Input
                      id="witness_phone"
                      value={paymentValues.witness_phone}
                      onChange={(event) =>
                        handlePaymentChange("witness_phone", event.target.value)
                      }
                      placeholder="Leave blank if not providing a witness"
                    />
                    {paymentErrors.witness_phone && (
                      <p className="mt-1 text-xs text-destructive">
                        {paymentErrors.witness_phone}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

            {requiresGuarantor && (
              <div className="grid gap-4 md:grid-cols-3">
                {renderUploadCard<PaymentForm>({
                  field: "utility_bill",
                  label: "Utility Bill",
                  placeholderTitle: "Upload recent utility bill",
                  placeholderSubtitle: "Less than 3 months old • JPG, PNG, or PDF",
                  helperText: "Ensure the address matches the guarantor.",
                  form: {
                    values: paymentValues,
                    errors: paymentErrors,
                    setter: setPaymentValues,
                    setErrors: setPaymentErrors,
                  },
                })}
                {renderUploadCard<PaymentForm>({
                  field: "id_document",
                  label: "Guarantor ID",
                  placeholderTitle: "Upload ID document",
                  placeholderSubtitle:
                    "Driving licence, passport, or birth certificate",
                  helperText: "Upload a clear image or PDF of the guarantor’s ID.",
                  form: {
                    values: paymentValues,
                    errors: paymentErrors,
                    setter: setPaymentValues,
                    setErrors: setPaymentErrors,
                  },
                })}
                {renderUploadCard<PaymentForm>({
                  field: "bank_statement",
                  label: "Bank Statement",
                  placeholderTitle: "Upload latest bank statement",
                  placeholderSubtitle: "PDF or image up to 10MB",
                  helperText: "Statement should clearly show the guarantor’s name.",
                  form: {
                    values: paymentValues,
                    errors: paymentErrors,
                    setter: setPaymentValues,
                    setErrors: setPaymentErrors,
                  },
                })}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="consent"
                  checked={paymentValues.consent}
                  onChange={(event) =>
                    handlePaymentChange("consent", event.target.checked)
                  }
                  className="size-4 rounded border-border"
                />
                <span className="text-xs md:text-sm text-muted-foreground leading-snug">
                  I consent to the collection and processing of the information and documents supplied for the purposes of confirming my booking with {companyName} Student Accommodation.
                </span>
              </div>
              {paymentErrors.consent && (
                <p className="pl-7 text-xs text-destructive">
                  {paymentErrors.consent}
                </p>
              )}
            </div>

            <Card className="rounded-3xl border border-primary/40 bg-primary/5">
              <CardHeader className="space-y-1">
                <CardTitle className="text-lg font-semibold uppercase tracking-wide">
                  Pay your deposit
                </CardTitle>
                <CardDescription>
                  The deposit is paid separately from your rent. Completing the {depositAmountFormatted} deposit secures your reserved studio and unlocks the tenancy agreement.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap md:flex-nowrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Deposit amount
                    </p>
                    <p className="text-2xl font-display font-black text-primary tracking-wide">
                      {depositAmountFormatted}
                    </p>
                    {selectedPlan && (
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground/80">
                        Instalment plan: {selectedPlan.plan.name}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground max-w-md">
                    Once the transaction is successful we will notify the {companyName} team to prepare your tenancy agreement. Deposits are fully protected in line with our policy.
                  </div>
                </div>

                {/* Already Paid Deposit Option */}
                {!depositPaid && (
                  <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="already_paid_deposit"
                        checked={paymentValues.already_paid_deposit || false}
                        onChange={(event) =>
                          handlePaymentChange("already_paid_deposit", event.target.checked)
                        }
                        className="size-4 rounded border-border"
                      />
                      <Label htmlFor="already_paid_deposit" className="text-sm font-medium cursor-pointer">
                        I've already paid the deposit
                      </Label>
                    </div>
                    
                    {paymentValues.already_paid_deposit && (
                      <div className="space-y-2 pl-7">
                        <div>
                          <Label htmlFor="receipt_number" className="text-xs">
                            Receipt/Cheque Number *
                          </Label>
                          <div className="relative mt-1">
                            <Input
                              id="receipt_number"
                              value={paymentValues.receipt_number || ""}
                              onChange={(event) =>
                                handlePaymentChange("receipt_number", event.target.value)
                              }
                              placeholder="Enter your receipt or cheque number"
                              className={cn(
                                paymentValues.receipt_number?.trim() &&
                                  (paymentVerification
                                    ? paymentVerification.is_linked
                                      ? "border-red-500 focus-visible:ring-red-500"
                                      : "border-green-500 focus-visible:ring-green-500"
                                    : paymentVerification === null && paymentValues.receipt_number?.trim()
                                    ? "border-red-500 focus-visible:ring-red-500"
                                    : ""),
                              )}
                            />
                            {paymentValues.receipt_number?.trim() && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                {isValidatingPayment ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : paymentVerification ? (
                                  paymentVerification.is_linked ? (
                                    <Info className="h-4 w-4 text-red-500" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                  )
                                ) : paymentVerification === null && paymentValues.receipt_number?.trim() ? (
                                  <Info className="h-4 w-4 text-red-500" />
                                ) : null}
                              </div>
                            )}
                          </div>
                          {paymentValues.receipt_number?.trim() && paymentVerification && (
                            <p
                              className={cn(
                                "mt-1 text-xs",
                                paymentVerification.is_linked
                                  ? "text-red-600"
                                  : "text-green-600",
                              )}
                            >
                              {paymentVerification.is_linked ? (
                                "⚠ This payment has already been linked to another application."
                              ) : (
                                `✓ Payment verified: £${paymentVerification.amount.toLocaleString("en-GB", { minimumFractionDigits: 2 })} paid on ${format(new Date(paymentVerification.payment_date), "dd MMM yyyy")} via ${paymentVerification.payment_method}`
                              )}
                            </p>
                          )}
                          {paymentValues.receipt_number?.trim() && paymentVerification === null && !isValidatingPayment && (
                            <p className="mt-1 text-xs text-destructive">
                              Payment not found. Please check your receipt number and try again.
                            </p>
                          )}
                        </div>
                        {!paymentValues.receipt_number?.trim() && (
                          <p className="text-xs text-muted-foreground pl-7">
                            Enter the receipt or cheque number provided when you made your payment.
                          </p>
                        )}
                        {paymentErrors.receipt_number && (
                          <p className="mt-1 text-xs text-destructive pl-7">
                            {paymentErrors.receipt_number}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {depositPaid ? (
                  <div className="rounded-2xl border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-700">
                    <p className="font-semibold uppercase tracking-wide">
                      Deposit received
                    </p>
                    <p>
                      Thank you. You can proceed to review and sign your tenancy agreement when it becomes available.
                    </p>
                    <p className="text-xs text-green-800 mt-1">
                      Payment reference stored securely. If you need to download the receipt, check your Stripe email confirmation.
                    </p>
                  </div>
                ) : paymentClientSecret && stripePromise ? (
                  <Elements
                    stripe={stripePromise}
                    options={{
                      clientSecret: paymentClientSecret,
                      appearance: { theme: "flat" },
                    }}
                  >
                    <StripePaymentForm
                      amountPence={
                        paymentAmount ?? Math.round(depositValue * 100)
                      }
                      currency={paymentCurrency}
                      onSuccess={handleDepositSuccess}
                    />
                  </Elements>
                ) : (
                  <Button
                    type="button"
                    className="rounded-full uppercase tracking-wide"
                    onClick={createDepositPaymentIntent}
                    disabled={creatingIntent || !stripePromise}
                  >
                    {creatingIntent ? "Preparing…" : "Pay deposit online"}
                  </Button>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-full uppercase tracking-wide"
                onClick={() => setCurrentStep(4)}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="rounded-full uppercase tracking-wide"
                disabled={
                  isSaving || 
                  sendingAgreements || 
                  (!depositPaid && !(paymentValues.already_paid_deposit && paymentVerification && !paymentVerification.is_linked))
                }
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving
                  </>
                ) : sendingAgreements ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending agreements
                  </>
                ) : depositPaid ? (
                  "Submit Application"
                ) : (
                  "Pay deposit to submit"
                )}
              </Button>
            </div>
          </form>
        );
      case 6: {
        if (isStaff) {
          const tenancyDone = effectiveTenancyEnvelope && isEnvelopeCompleted(effectiveTenancyEnvelope.status);
          const guarantorDone = !requiresGuarantor || (effectiveGuarantorEnvelope && isEnvelopeCompleted(effectiveGuarantorEnvelope.status));
          return (
            <div className="space-y-6">
              <Card className="rounded-3xl border border-border/60 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg font-display uppercase tracking-wide">
                    Upload Signed Agreements (Staff)
                  </CardTitle>
                  <CardDescription>
                    Upload the signed tenancy and guarantor agreements on behalf of the student.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Tenancy Agreement (PDF)</Label>
                    <div className="flex items-center gap-4">
                      <Input
                        type="file"
                        accept="application/pdf"
                        className="max-w-xs"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleStaffUploadSignedDocument("tenancy", f);
                          e.target.value = "";
                        }}
                        disabled={uploadingTenancy || tenancyDone}
                      />
                      {tenancyDone ? (
                        <span className="inline-flex items-center gap-2 rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white uppercase">
                          <CheckCircle2 className="h-4 w-4" /> Completed
                        </span>
                      ) : uploadingTenancy ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : null}
                    </div>
                  </div>
                  {requiresGuarantor && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Guarantor Agreement (PDF)</Label>
                      <div className="flex items-center gap-4">
                        <Input
                          type="file"
                          accept="application/pdf"
                          className="max-w-xs"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleStaffUploadSignedDocument("guarantor", f);
                            e.target.value = "";
                          }}
                          disabled={uploadingGuarantor || guarantorDone}
                        />
                        {guarantorDone ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white uppercase">
                            <CheckCircle2 className="h-4 w-4" /> Completed
                          </span>
                        ) : uploadingGuarantor ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                    </div>
                  )}
                  {tenancyDone && guarantorDone && (
                    <Alert className="border-green-500/40 bg-green-500/10">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertTitle className="font-semibold">All agreements uploaded</AlertTitle>
                      <AlertDescription className="text-sm mt-1">
                        The application has been moved to awaiting verification. Staff can confirm it in the admin dashboard.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </div>
          );
        }
        const statusDescription = effectiveTenancyEnvelope
          ? `Status updated ${format(
            new Date(effectiveTenancyEnvelope.updated_at ?? new Date().toISOString()),
            "PPpp",
          )}`
          : "We’ll create your agreement as soon as Step 5 is submitted.";
        // Check if we can launch signing - use pendingEnvelopes as immediate fallback
        const canLaunchSigning =
          depositPaid &&
          effectiveTenancyEnvelope &&
          effectiveTenancyEnvelope.envelope_id &&
          !isEnvelopeCompleted(effectiveTenancyEnvelope.status) &&
          !signingLoading;
        return (
          <div className="space-y-6">
            <Card className="rounded-3xl border border-border/60 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg font-display uppercase tracking-wide">
                  Tenancy Agreement
                </CardTitle>
                <CardDescription>
                  {effectiveTenancyEnvelope
                    ? `Sign digitally to secure your ${companyName} studio.`
                    : "Complete Step 5 to generate your tenancy agreement."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Loading indicator when sending DocuSign agreements */}
                {sendingAgreements && (
                  <Alert className="border-blue-500/40 bg-blue-500/10">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <AlertTitle className="font-semibold">Sending Agreements</AlertTitle>
                    <AlertDescription className="text-sm mt-1">
                      We're preparing and sending your tenancy agreement via DocuSign. This may take a few moments. You'll receive an email when it's ready to sign.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Status message when waiting for documents/agreement */}
                {!sendingAgreements && !canLaunchSigning && !effectiveTenancyEnvelope && depositPaid && (
                  <Alert className="border-blue-500/40 bg-blue-500/10">
                    <Info className="h-4 w-4" />
                    <AlertTitle className="font-semibold">Preparing Your Agreement</AlertTitle>
                    <AlertDescription className="text-sm mt-1">
                      Your documents are being reviewed. We'll prepare your tenancy agreement once verification is complete. You'll receive an email when it's ready to sign.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Progress checklist when waiting */}
                {!sendingAgreements && !canLaunchSigning && !effectiveTenancyEnvelope && depositPaid && (
                  <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Application Progress
                    </p>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <span className="text-muted-foreground">Deposit paid</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <span className="text-muted-foreground">Documents uploaded</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600 flex-shrink-0" />
                        <span className="text-muted-foreground">Documents verified (in progress)</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600 flex-shrink-0" />
                        <span className="text-muted-foreground">Agreement prepared (waiting)</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                      Status
                    </p>
                    {isEnvelopeCompleted(effectiveTenancyEnvelope?.status) ? (
                      <span className="inline-flex items-center rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white uppercase tracking-wide">
                        {formatEnvelopeStatus(effectiveTenancyEnvelope?.status)}
                      </span>
                    ) : (
                      <p className="text-lg font-semibold">
                        {formatEnvelopeStatus(effectiveTenancyEnvelope?.status)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{statusDescription}</p>
                  </div>
                  <div className="ml-auto flex flex-col items-end gap-2">
                      <Button
                        type="button"
                        className="rounded-full uppercase tracking-wide"
                        onClick={handleLaunchSigning}
                        disabled={!canLaunchSigning || sendingAgreements}
                      >
                        {sendingAgreements ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending agreements...
                          </>
                        ) : signingLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Launching…
                          </>
                        ) : !canLaunchSigning && !effectiveTenancyEnvelope && depositPaid ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Preparing agreement...
                          </>
                        ) : isEnvelopeCompleted(effectiveTenancyEnvelope?.status) ? (
                          "Completed"
                        ) : (
                          "Sign tenancy agreement"
                        )}
                      </Button>
                      {latestSigningUrl &&
                        !signingLoading &&
                      !isEnvelopeCompleted(effectiveTenancyEnvelope?.status) && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-full text-xs uppercase tracking-wide"
                            onClick={() => {
                              const retried = window.open(
                                latestSigningUrl,
                                "_blank",
                                "noopener",
                              );
                              if (!retried) {
                                window.location.href = latestSigningUrl;
                              }
                            }}
                          >
                            Open DocuSign again
                          </Button>
                        )}
                  </div>
                </div>
                {!depositPaid && (
                  <p className="text-sm text-muted-foreground">
                    Pay your deposit first to unlock the signing session.
                  </p>
                )}
                {paymentValues.witness_name && paymentValues.witness_email && (
                  <p className="text-sm text-muted-foreground">
                    We've emailed your witness ({paymentValues.witness_email}) to
                    view your tenancy agreement after you finish your portion.
                  </p>
                )}
              </CardContent>
            </Card>

            {requiresGuarantor && (
              <Card className="rounded-3xl border border-border/60 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg font-display uppercase tracking-wide">
                    Guarantor Agreement
                  </CardTitle>
                  <CardDescription>
                    Your guarantor ({paymentValues.guarantor_email || "—"}) signs this
                    agreement once you’ve completed yours.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm">
                    Status:{" "}
                    {isEnvelopeCompleted(effectiveGuarantorEnvelope?.status) ? (
                      <span className="inline-flex items-center rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white uppercase tracking-wide">
                        {formatEnvelopeStatus(effectiveGuarantorEnvelope?.status)}
                      </span>
                    ) : (
                      <span className="font-semibold">
                        {formatEnvelopeStatus(effectiveGuarantorEnvelope?.status) || "Not sent"}
                      </span>
                    )}
                  </p>
                  {effectiveGuarantorEnvelope && (
                    <p className="text-xs text-muted-foreground">
                      Last update: {format(
                        new Date(
                          effectiveGuarantorEnvelope.updated_at ??
                            new Date().toISOString(),
                        ),
                        "PPpp",
                      )}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    We’ve emailed your guarantor with their own secure signing link. Let
                    them know to check their inbox (and spam folder) for "{companyName}
                    guarantor agreement".
                  </p>
                </CardContent>
              </Card>
            )}

            <Card className="rounded-3xl border border-border/60 bg-muted/30">
              <CardHeader>
                <CardTitle className="text-base font-display uppercase tracking-wide">
                  What happens next?
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  1) Complete your tenancy agreement using the button above. You can open
                  it multiple times if you need to pause.
                </p>
                <p>
                  2) {paymentValues.witness_name && paymentValues.witness_email 
                    ? "Your witness views, then " 
                    : ""}{requiresGuarantor ? "Your guarantor signs" : "Once you've signed"} via the emails we sent. If they
                  can't find it, use the Refresh button below after we resend.
                </p>
                <p>
                  3) Once all parties sign, your application automatically moves to
                  verification and you’ll receive a confirmation email.
                </p>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                className="rounded-full uppercase tracking-wide"
                onClick={() => setCurrentStep(5)}
              >
                Back
              </Button>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full uppercase tracking-wide"
                  onClick={checkEnvelopeStatus}
                  disabled={checkingStatus}
                >
                  {checkingStatus ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    "Refresh status"
                  )}
                </Button>
                <Button
                  type="button"
                  className="rounded-full uppercase tracking-wide"
                  onClick={() => {
                    // Navigate based on user role
                    if (profile?.role === "staff" || profile?.role === "superadmin") {
                      navigate("/admin");
                    } else {
                      navigate("/portal");
                    }
                  }}
                >
                  Return to dashboard
                </Button>
              </div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const handleLaunchSigning = async () => {
    if (!application?.id) return;
    const placeholderWindow = window.open("", "_blank");
    if (placeholderWindow && placeholderWindow.document) {
      try {
        placeholderWindow.document.write(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Launching DocuSign…</title>
    <style>
      html, body {
        height: 100%;
        margin: 0;
        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif;
        background: radial-gradient(circle at top, #111 0%, #000 60%);
        color: #f4f4f5;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .loader {
        text-align: center;
        padding: 2rem 3rem;
        border-radius: 1.5rem;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
      }
      .spinner {
        width: 48px;
        height: 48px;
        margin: 0 auto 1rem;
        border-radius: 50%;
        border: 4px solid rgba(255, 255, 255, 0.15);
        border-top-color: #f97316;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      p {
        margin: 0.2rem 0;
        font-size: 0.95rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      small {
        display: block;
        margin-top: 0.75rem;
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.6);
      }
    </style>
  </head>
  <body>
    <div class="loader">
      <div class="spinner"></div>
      <p>Launching DocuSign</p>
      <small>Please keep this tab open</small>
    </div>
  </body>
</html>`);
        placeholderWindow.document.close();
      } catch (error) {
        console.warn("Unable to render signing placeholder", error);
      }
    }
    let fallbackTimer: ReturnType<typeof window.setTimeout> | null = null;
    setSigningLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        url?: string;
        error?: string;
      }>("docusign-recipient-view", {
        body: {
          applicationId: application.id,
          envelopeType: "tenancy",
          returnUrl:
            typeof window !== "undefined"
              ? `${window.location.origin}/portal?event=signing_complete`
              : undefined,
        },
      });

      if (error || data?.error || !data?.url) {
        throw new Error(
          data?.error ??
            error?.message ??
            "Unable to start the signing session. Please try again.",
        );
      }

      const signingUrl = data.url;
      setLatestSigningUrl(signingUrl);

      const openSigningTarget = () => {
        if (placeholderWindow && !placeholderWindow.closed) {
          try {
            placeholderWindow.location.replace(signingUrl);
            placeholderWindow.focus();
            return;
          } catch (placeholderError) {
            console.warn(
              "Unable to reuse signing placeholder window",
              placeholderError,
            );
            placeholderWindow.close();
          }
        }
        const newTab = window.open(signingUrl, "_blank", "noopener");
        if (newTab) {
          newTab.focus();
        } else {
          window.location.href = signingUrl;
        }
      };

      openSigningTarget();

      fallbackTimer = window.setTimeout(() => {
        if (!signingUrl || !placeholderWindow || placeholderWindow.closed) {
          return;
        }
        try {
          const currentHref = placeholderWindow.location.href;
          if (
            currentHref === "about:blank" ||
            currentHref === "about:blank/"
          ) {
            placeholderWindow.close();
            const reopened = window.open(signingUrl, "_blank", "noopener");
            if (!reopened) {
              window.location.href = signingUrl;
            }
          }
        } catch {
          // accessing location threw → the window navigated to DocuSign, so do nothing
        }
      }, 2000);

      toast({
        title: "Signing launched",
        description: "DocuSign opened in a new tab. Complete it to continue.",
      });
    } catch (err) {
      console.error(err);
      placeholderWindow?.close();
      toast({
        variant: "destructive",
        title: "Unable to open signing session",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      if (fallbackTimer) {
        window.clearTimeout(fallbackTimer);
      }
      setSigningLoading(false);
    }
  };

  // If all signatures are completed, show 100% progress
  const progress = allSignaturesCompleted 
    ? 100 
    : (completedSteps / steps.length) * 100;

  const handleBackToDashboard = () => {
    if (isStaffOrSubRole) {
      navigate("/admin");
    } else {
      navigate("/portal");
    }
  };

  return (
    <PortalLayout
      title="Booking Journey"
      subtitle=""
      backLabel="Back to dashboard"
      onBack={handleBackToDashboard}
      hideNav={true}
    >
      <section className="space-y-8">
        {/* Rebooking Notice */}
        {application?.is_rebooking && rebookingData && (
          <Alert className="border-primary/50 bg-primary/5">
            <RotateCcw className="h-4 w-4" />
            <AlertTitle className="font-semibold">Rebooking Application</AlertTitle>
            <AlertDescription className="text-sm mt-1">
              We've pre-filled your information from your previous application. Please review and update any details that may have changed.
            </AlertDescription>
          </Alert>
        )}

        <div 
          className={`rounded-3xl border-2 p-4 md:p-6 lg:p-8 shadow-xl transition-all ${
            allSignaturesCompleted 
              ? 'text-primary-foreground' 
              : 'border-primary/20 bg-primary text-primary-foreground shadow-primary/20'
          }`}
          style={allSignaturesCompleted ? {
            backgroundColor: successColorBg,
            borderColor: successColorBorder,
          } : undefined}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1 md:space-y-2 flex-1 min-w-0">
              {application.contract_id && (
                <h1 className="text-xl md:text-2xl lg:text-3xl font-display font-black uppercase tracking-wide text-primary-foreground break-words">
                  {steps[currentStep - 1]?.title || "Personal Information"}
                </h1>
              )}
              <h2 className="text-base md:text-xl lg:text-2xl font-display font-bold uppercase tracking-wide text-primary-foreground/90">
                {application.contract_id
                  ? `Step ${currentStep} of ${steps.length}`
                  : "Complete the journey"}
              </h2>
            </div>
            <div className="flex flex-col items-start md:items-end gap-2 flex-shrink-0">
              <div className="w-full md:w-48">
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-white">
                  <div 
                    className="h-full transition-all bg-black"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <span className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black uppercase tracking-wide leading-none text-primary-foreground">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 md:gap-3 lg:gap-4 mt-4 md:mt-6">
            {steps.map((step) => {
              const isActive = step.number === currentStep;
              const isComplete = application.student_application_steps.some(
                (saved) =>
                  saved.step_number === step.number && saved.is_complete,
              );
              return (
                <button
                  key={step.number}
                  type="button"
                  onClick={() => setCurrentStep(step.number)}
                  className={`px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-semibold uppercase tracking-wide transition-all hover:opacity-80 ${
                    isActive
                      ? "bg-primary-foreground text-primary shadow-lg scale-105"
                      : isComplete
                      ? "bg-primary-foreground/20 text-primary-foreground border-2 border-primary-foreground/40"
                      : "bg-primary-foreground/10 text-primary-foreground/70 border-2 border-primary-foreground/30"
                  }`}
                >
                  Step {String(step.number).padStart(2, '0')}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border-2 border-primary/10 bg-background/95 backdrop-blur p-6 md:p-8 shadow-2xl shadow-primary/5">
          {renderStep()}
        </div>
      </section>
    </PortalLayout>
  );
};

export default StudentApplicationWizard;

