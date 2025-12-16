import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, FileText, CheckCircle2, XCircle, Clock, Download, Upload, RefreshCw } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useStudentApplicationsList } from "@/hooks/useStudentApplications";
import { useStudentDocuments } from "@/hooks/useStudentDocuments";
import { useDocumentUpload } from "@/hooks/useDocumentUpload";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { ApplicationType } from "@/hooks/useStudentApplication";

const Documents = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const {
    data: applications,
    isLoading: applicationsLoading,
  } = useStudentApplicationsList(user?.id);

  // Get all applications (not just confirmed)
  const allApplications = useMemo(
    () => applications ?? [],
    [applications],
  );

  const DocumentsSkeleton = () => (
    <div className="space-y-8">
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
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-28 rounded-full" />
                  <Skeleton className="h-9 w-28 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );

  if (applicationsLoading) {
    return (
      <PortalLayout>
        <DocumentsSkeleton />
      </PortalLayout>
    );
  }

  if (allApplications.length === 0) {
    return (
      <PortalLayout>
        <Card className="rounded-3xl border-dashed">
          <CardHeader>
            <CardTitle className="text-2xl font-display uppercase tracking-wide">
              No Documents Uploaded
            </CardTitle>
            <CardDescription>
              Your uploaded documents will appear here once you complete the documentation step in your booking journey.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="rounded-full uppercase tracking-wide"
              onClick={() => navigate("/portal")}
            >
              View Applications
            </Button>
          </CardContent>
        </Card>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-3xl font-display font-black uppercase tracking-wide">
              Documents
            </h2>
            <p className="text-muted-foreground text-sm mt-2">
              View and manage your uploaded documents for each application.
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-full uppercase tracking-wide gap-2"
            onClick={async () => {
              // First, let's check what's actually in the database
              console.log("Checking existing documents in database...");
              for (const app of allApplications) {
                const { data: existing, error: checkError } = await supabase
                  .from("student_documents")
                  .select("*")
                  .eq("application_id", app.id);
                console.log(`Application ${app.id} - Documents in DB:`, existing, "Error:", checkError);
              }
              // Sync documents from steps payload to table for all applications
              if (!user) return;
              
              toast({
                title: "Syncing documents...",
                description: "Checking for documents in your applications.",
              });

              let syncedCount = 0;
              let foundInSteps = 0;
              
              for (const app of allApplications) {
                try {
                  // Fetch application with steps
                  const { data: application, error: appError } = await supabase
                    .from("student_applications")
                    .select(`
                      id,
                      student_application_steps (
                        step_number,
                        payload
                      )
                    `)
                    .eq("id", app.id)
                    .maybeSingle();

                  if (appError) {
                    console.error(`Error fetching application ${app.id}:`, appError);
                    continue;
                  }
                  
                  if (!application) continue;

                  const steps = (application as any).student_application_steps || [];
                  
                  // Check Step 4 (Documentation)
                  const step4 = steps.find((s: any) => s.step_number === 4);
                  const step5 = steps.find((s: any) => s.step_number === 5);

                  const documentsToSave: Array<{
                    application_id: string;
                    document_type: string;
                    storage_path: string;
                    original_filename?: string;
                    uploaded_by: string;
                  }> = [];

                  if (step4?.payload && typeof step4.payload === "object") {
                    const payload = step4.payload as Record<string, unknown>;
                    console.log("Step 4 payload:", payload);
                    
                    if (payload.passport_document && typeof payload.passport_document === "string" && payload.passport_document.trim()) {
                      foundInSteps++;
                      const fileName = payload.passport_document.split("/").pop() || "passport.pdf";
                      documentsToSave.push({
                        application_id: app.id,
                        document_type: "passport",
                        storage_path: payload.passport_document,
                        original_filename: fileName,
                        uploaded_by: user.id,
                      });
                    }
                    if (payload.visa_document && typeof payload.visa_document === "string" && payload.visa_document.trim() && payload.uk_citizen !== "yes") {
                      foundInSteps++;
                      const fileName = payload.visa_document.split("/").pop() || "visa.pdf";
                      documentsToSave.push({
                        application_id: app.id,
                        document_type: "visa",
                        storage_path: payload.visa_document,
                        original_filename: fileName,
                        uploaded_by: user.id,
                      });
                    }
                    if (payload.passport_photo && typeof payload.passport_photo === "string" && payload.passport_photo.trim()) {
                      foundInSteps++;
                      const fileName = payload.passport_photo.split("/").pop() || "passport_photo";
                      documentsToSave.push({
                        application_id: app.id,
                        document_type: "passport_photo",
                        storage_path: payload.passport_photo,
                        original_filename: fileName,
                        uploaded_by: user.id,
                      });
                    }
                    if (payload.student_proof && typeof payload.student_proof === "string" && payload.student_proof.trim()) {
                      foundInSteps++;
                      const fileName = payload.student_proof.split("/").pop() || "student_proof";
                      documentsToSave.push({
                        application_id: app.id,
                        document_type: "student_proof",
                        storage_path: payload.student_proof,
                        original_filename: fileName,
                        uploaded_by: user.id,
                      });
                    }
                  }

                  if (step5?.payload && typeof step5.payload === "object") {
                    const payload = step5.payload as Record<string, unknown>;
                    console.log("Step 5 payload:", payload);
                    
                    if (payload.utility_bill && typeof payload.utility_bill === "string" && payload.utility_bill.trim()) {
                      foundInSteps++;
                      const fileName = payload.utility_bill.split("/").pop() || "utility_bill.pdf";
                      documentsToSave.push({
                        application_id: app.id,
                        document_type: "utility_bill",
                        storage_path: payload.utility_bill,
                        original_filename: fileName,
                        uploaded_by: user.id,
                      });
                    }
                    if (payload.id_document && typeof payload.id_document === "string" && payload.id_document.trim()) {
                      foundInSteps++;
                      const fileName = payload.id_document.split("/").pop() || "id_document.pdf";
                      documentsToSave.push({
                        application_id: app.id,
                        document_type: "id_document",
                        storage_path: payload.id_document,
                        original_filename: fileName,
                        uploaded_by: user.id,
                      });
                    }
                    if (payload.bank_statement && typeof payload.bank_statement === "string" && payload.bank_statement.trim()) {
                      foundInSteps++;
                      const fileName = payload.bank_statement.split("/").pop() || "bank_statement.pdf";
                      documentsToSave.push({
                        application_id: app.id,
                        document_type: "bank_statement",
                        storage_path: payload.bank_statement,
                        original_filename: fileName,
                        uploaded_by: user.id,
                      });
                    }
                  }

                  if (documentsToSave.length > 0) {
                    // Check existing documents
                    const { data: existingDocs, error: existingError } = await supabase
                      .from("student_documents")
                      .select("storage_path")
                      .eq("application_id", app.id);

                    if (existingError) {
                      console.error(`Error checking existing docs for ${app.id}:`, existingError);
                    }

                    const existingPaths = new Set(existingDocs?.map(d => d.storage_path) || []);
                    const newDocuments = documentsToSave.filter(doc => !existingPaths.has(doc.storage_path));

                    console.log(`Application ${app.id}: Found ${documentsToSave.length} docs in steps, ${existingPaths.size} already in DB, ${newDocuments.length} new to sync`);

                    if (newDocuments.length > 0) {
                      const { error: insertError } = await supabase
                        .from("student_documents")
                        .insert(newDocuments);

                      if (insertError) {
                        console.error(`Error inserting documents for ${app.id}:`, insertError);
                        toast({
                          variant: "destructive",
                          title: "Sync error",
                          description: `Failed to sync documents: ${insertError.message}`,
                        });
                      } else {
                        syncedCount += newDocuments.length;
                      }
                    }
                  }
                } catch (error) {
                  console.error(`Error syncing documents for application ${app.id}:`, error);
                }
              }

              if (syncedCount > 0) {
                toast({
                  title: "Documents synced",
                  description: `Found and synced ${syncedCount} document(s) from your applications.`,
                });
                // Refresh the page to show new documents
                setTimeout(() => window.location.reload(), 1000);
              } else if (foundInSteps > 0) {
                toast({
                  title: "Documents already synced",
                  description: `Found ${foundInSteps} document(s) in your applications, but they're already in the system.`,
                });
              } else {
                toast({
                  title: "No documents found",
                  description: "No documents were found in your application steps. Make sure you've uploaded documents in Step 4 (Documentation) or Step 5 (Payment & Guarantor).",
                });
              }
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Sync Documents
          </Button>
        </div>

        <DocumentsList applications={allApplications} />
      </div>
    </PortalLayout>
  );
};

type ApplicationType = ReturnType<typeof useStudentApplicationsList>["data"] extends (infer T)[] | undefined ? T : never;

const DocumentsList = ({ applications }: { applications: NonNullable<ApplicationType>[] }) => {
  const [allCardsLoaded, setAllCardsLoaded] = useState(false);
  const [hasAnyDocuments, setHasAnyDocuments] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

  const handleCardLoaded = (hasDocs: boolean) => {
    setLoadedCount((prev) => {
      const newCount = prev + 1;
      if (newCount >= applications.length) {
        setAllCardsLoaded(true);
      }
      return newCount;
    });
    if (hasDocs) {
      setHasAnyDocuments(true);
    }
  };

  // Render all cards immediately - they handle their own loading
  const renderedCards = applications.map((application) => (
    <ApplicationDocumentsCard 
      key={application.id} 
      application={application}
      onLoaded={handleCardLoaded}
    />
  ));

  // Filter out null cards (applications with no documents)
  const visibleCards = renderedCards.filter((card) => card !== null);

  // Show "No Documents Found" only after all cards have loaded and none have documents
  if (allCardsLoaded && visibleCards.length === 0 && !hasAnyDocuments) {
    return (
      <Card className="rounded-3xl border-dashed">
        <CardHeader>
          <CardTitle className="text-2xl font-display uppercase tracking-wide">
            No Documents Found
          </CardTitle>
          <CardDescription>
            No documents have been uploaded for any of your applications yet. Complete the documentation step in your booking journey to upload documents, then click "Sync Documents" to display them here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="rounded-full uppercase tracking-wide"
            onClick={() => window.location.href = "/portal"}
          >
            View Applications
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{visibleCards}</>;
};

const ApplicationDocumentsCard = ({ 
  application,
  onLoaded,
}: { 
  application: NonNullable<ApplicationType>;
  onLoaded: (hasDocs: boolean) => void;
}) => {
  const { data: documents, isLoading, error } = useStudentDocuments(application.id);
  const navigate = useNavigate();
  const contract = application.contract;
  const gradeName = contract?.studio_grade?.name ?? "Studio Grade";
  const [hasNotified, setHasNotified] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const uploadDocument = useDocumentUpload();

  useEffect(() => {
    if (!isLoading && !hasNotified) {
      onLoaded((documents?.length ?? 0) > 0);
      setHasNotified(true);
    }
  }, [isLoading, documents, onLoaded, hasNotified]);

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved":
      case "verified":
        return (
          <Badge className="bg-green-600 text-white">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
      case "declined":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge className="bg-orange-300 hover:bg-orange-400 text-orange-900">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const downloadDocument = async (storagePath: string, filename: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .download(storagePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading document:", error);
    }
  };

  const handleReupload = async (docId: string, documentType: string, file: File) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        variant: "destructive",
        title: "Authentication required",
        description: "Please sign in to upload documents.",
      });
      return;
    }

    setUploadingDocId(docId);
    try {
      await uploadDocument.mutateAsync({
        file,
        applicationId: application.id,
        documentType,
        uploadedBy: user.id,
      });
    } finally {
      setUploadingDocId(null);
    }
  };

  if (isLoading) {
    return (
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border/60 p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded" />
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 w-28 rounded-full" />
                  <Skeleton className="h-9 w-28 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    console.error(`Error loading documents for ${application.id}:`, error);
    return null;
  }

  if (!documents || documents.length === 0) {
    return null;
  }

  return (
    <Card className="rounded-3xl border border-border/60 shadow-xl">
      <CardHeader>
        <CardTitle className="text-xl font-display uppercase tracking-wide">
          {contract?.name ?? "Contract"}
        </CardTitle>
        <CardDescription>
          {gradeName} · {documents.length} document{documents.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="rounded-2xl border border-border/60 p-4 space-y-3"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-lg capitalize">
                    {doc.document_type.replace(/_/g, " ")}
                  </h3>
                  {getStatusBadge(doc.status)}
                </div>
                {doc.status.toLowerCase() === "rejected" && doc.notes && (
                  <div className="mb-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-sm font-medium text-destructive mb-1">Rejection Reason:</p>
                    <p className="text-sm text-destructive/90">{doc.notes}</p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <div>
                    Uploaded {format(new Date(doc.uploaded_at), "d MMM yyyy")}
                  </div>
                  {doc.original_filename && (
                    <div className="truncate max-w-xs">
                      {doc.original_filename}
                    </div>
                  )}
                  {doc.verified_by_profile && (
                    <div>
                      Verified by {doc.verified_by_profile.first_name}{" "}
                      {doc.verified_by_profile.last_name}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {doc.status.toLowerCase() === "rejected" && (
                  <>
                    <input
                      ref={(el) => (fileInputRefs.current[doc.id] = el)}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleReupload(doc.id, doc.document_type, file);
                          // Reset input
                          e.target.value = "";
                        }
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full uppercase tracking-wide gap-2"
                      onClick={() => fileInputRefs.current[doc.id]?.click()}
                      disabled={uploadingDocId === doc.id || uploadDocument.isPending}
                    >
                      {uploadingDocId === doc.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Re-upload
                        </>
                      )}
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full uppercase tracking-wide gap-2"
                  onClick={() =>
                    downloadDocument(
                      doc.storage_path,
                      doc.original_filename || `${doc.document_type}.pdf`,
                    )
                  }
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default Documents;
