import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, FileText, Download, CheckCircle2, Clock, User } from "lucide-react";
import PortalLayout from "@/components/portal/PortalLayout";
import { useStudentApplicationsList } from "@/hooks/useStudentApplications";
import { useStudentApplication } from "@/hooks/useStudentApplication";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Contracts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [signingApplicationId, setSigningApplicationId] = useState<string | null>(null);

  const {
    data: applications,
    isLoading: applicationsLoading,
  } = useStudentApplicationsList(user?.id);

  // Get applications with signed agreements (confirmed or awaiting_verification)
  const applicationsWithAgreements = useMemo(
    () =>
      applications?.filter(
        (app) =>
          app.status === "confirmed" ||
          app.status === "awaiting_verification" ||
          app.status === "awaiting_signature",
      ) ?? [],
    [applications],
  );

  const downloadSignedDocument = async (envelopeIdOrKey: string, envelopeType: string, applicationId: string) => {
    const downloadKey = envelopeIdOrKey || `${applicationId}-${envelopeType}`;
    setDownloadingId(downloadKey);
    try {
      const body = envelopeIdOrKey
        ? { envelopeId: envelopeIdOrKey, applicationId }
        : { applicationId, envelopeType };
      const { data, error } = await supabase.functions.invoke("download-signed-document", {
        body,
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
        toast({
          title: "Download started",
          description: "The signed document is opening in a new tab.",
        });
      } else if (data?.pdf_base64) {
        const dataUrl = `data:application/pdf;base64,${data.pdf_base64}`;
        window.open(dataUrl, "_blank");
        toast({
          title: "Download started",
          description: "The signed document is opening in a new tab.",
        });
      } else {
        toast({
          title: "Download unavailable",
          description: (data as { message?: string })?.message || "Document download is not yet available. Please try again after signing is complete.",
        });
      }
    } catch (err: unknown) {
      console.error("Error downloading document:", err);
      const msg =
        (err as { context?: { body?: { error?: string } }; message?: string })?.context?.body?.error ??
        (err as Error)?.message ??
        "Unable to download the signed document. Please try again later.";
      toast({
        variant: "destructive",
        title: "Download failed",
        description: msg,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const canDownloadEnvelope = (envelope: { envelope_id?: string | null; signed_document_path?: string | null; status?: string | null }) =>
    (envelope?.status ?? "").toLowerCase() === "completed" &&
    (Boolean(envelope.envelope_id) || Boolean(envelope.signed_document_path));

  const formatEnvelopeStatus = (status?: string | null) => {
    if (!status) return "Not sent";
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

  const startSigningTenancy = async (applicationId: string) => {
    if (!applicationId) return;

    let placeholderWindow: Window | null = null;

    if (typeof window !== "undefined") {
      try {
        placeholderWindow = window.open("", "_blank", "noopener");
        if (placeholderWindow && !placeholderWindow.closed) {
          placeholderWindow.document.write(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Launching DocuSign</title>
    <style>
      body {
        margin: 0;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle at top, #0f172a, #020617);
        color: white;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .loader {
        text-align: center;
      }
      .spinner {
        width: 40px;
        height: 40px;
        border-radius: 999px;
        border: 3px solid rgba(148, 163, 184, 0.5);
        border-top-color: #facc15;
        margin: 0 auto 1rem;
        animation: spin 0.7s linear infinite;
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
        }
      } catch (error) {
        console.warn("Unable to render signing placeholder", error);
      }
    }

    let fallbackTimer: ReturnType<typeof window.setTimeout> | null = null;
    setSigningApplicationId(applicationId);

    try {
      const { data, error } = await supabase.functions.invoke<{
        url?: string;
        error?: string;
      }>("docusign-recipient-view", {
        body: {
          applicationId,
          envelopeType: "tenancy",
          returnUrl:
            typeof window !== "undefined"
              ? `${window.location.origin}/portal/contracts?event=signing_complete`
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

      if (typeof window !== "undefined") {
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
      }

      toast({
        title: "Signing launched",
        description: "DocuSign opened in a new tab. Complete it to finish signing.",
      });
    } catch (err) {
      console.error(err);
      if (placeholderWindow && !placeholderWindow.closed) {
        placeholderWindow.close();
      }
      toast({
        variant: "destructive",
        title: "Unable to open signing session",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      if (fallbackTimer && typeof window !== "undefined") {
        window.clearTimeout(fallbackTimer);
      }
      setSigningApplicationId(null);
    }
  };

  const ContractsSkeleton = () => (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-96" />
      </div>
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border/60 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                </div>
                <Skeleton className="h-6 w-24 rounded-md" />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-28 rounded-md" />
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
        <ContractsSkeleton />
      </PortalLayout>
    );
  }

  if (applicationsWithAgreements.length === 0) {
    return (
      <PortalLayout>
        <Card className="rounded-3xl border-dashed">
          <CardHeader>
            <CardTitle className="text-2xl font-display uppercase tracking-wide">
              No Contracts Available
            </CardTitle>
            <CardDescription>
              Your signed agreements will appear here once your application is confirmed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="rounded-md uppercase tracking-wide"
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
        <div>
          <h2 className="text-3xl font-display font-black uppercase tracking-wide">
            Contracts
          </h2>
          <p className="text-muted-foreground text-sm mt-2">
            View and download your signed tenancy and guarantor agreements.
          </p>
        </div>

        {applicationsWithAgreements.map((app) => {
          const contract = app.contract;
          const gradeName = contract?.studio_grade?.name ?? "Studio Grade";
          const startDate = contract
            ? format(new Date(contract.contract_start), "d MMM yyyy")
            : "";
          const endDate = contract
            ? format(new Date(contract.contract_end), "d MMM yyyy")
            : "";

          return (
            <ContractCard
              key={app.id}
              applicationId={app.id}
              contractName={contract?.name ?? "Contract"}
              gradeName={gradeName}
              startDate={startDate}
              endDate={endDate}
              onDownload={(envelopeIdOrKey, envelopeType) => downloadSignedDocument(envelopeIdOrKey, envelopeType, app.id)}
              downloadingId={downloadingId}
              canDownloadEnvelope={canDownloadEnvelope}
              formatEnvelopeStatus={formatEnvelopeStatus}
              isEnvelopeCompleted={isEnvelopeCompleted}
              onSignTenancy={() => startSigningTenancy(app.id)}
              isSigningTenancy={signingApplicationId === app.id}
            />
          );
        })}
      </div>
    </PortalLayout>
  );
};

type ContractCardProps = {
  applicationId: string;
  contractName: string;
  gradeName: string;
  startDate: string;
  endDate: string;
  onDownload: (envelopeIdOrKey: string, envelopeType: string) => void;
  downloadingId: string | null;
  canDownloadEnvelope: (envelope: { envelope_id?: string | null; signed_document_path?: string | null; status?: string | null }) => boolean;
  formatEnvelopeStatus: (status?: string | null) => string;
  isEnvelopeCompleted: (status?: string | null) => boolean;
  onSignTenancy: () => void;
  isSigningTenancy: boolean;
};

const ContractCard = ({
  applicationId,
  contractName,
  gradeName,
  startDate,
  endDate,
  onDownload,
  downloadingId,
  canDownloadEnvelope,
  formatEnvelopeStatus,
  isEnvelopeCompleted,
  onSignTenancy,
  isSigningTenancy,
}: ContractCardProps) => {
  const { data: application, isLoading } = useStudentApplication(applicationId);

  if (isLoading) {
    return (
      <Card className="rounded-3xl border border-border/60 shadow-xl">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-border/60 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                </div>
                <Skeleton className="h-6 w-24 rounded-md" />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-28 rounded-md" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const envelopes = application?.docusign_envelopes ?? [];
  const tenancyEnvelope = envelopes.find((e) => e.envelope_type === "tenancy");
  const guarantorEnvelope = envelopes.find((e) => e.envelope_type === "guarantor");

  return (
    <Card className="rounded-3xl border border-border/60 shadow-xl">
      <CardHeader>
        <CardTitle className="text-xl font-display uppercase tracking-wide">
          {contractName}
        </CardTitle>
        <CardDescription>
          {gradeName} · {startDate} – {endDate}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tenancy Agreement */}
        <div className="rounded-2xl border border-border/60 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold text-lg">Tenancy Agreement</h3>
                <p className="text-sm text-muted-foreground">
                  Signed by you and your witness
                </p>
              </div>
            </div>
            {tenancyEnvelope && (
              <div className="flex items-center gap-3">
                {isEnvelopeCompleted(tenancyEnvelope.status) ? (
                  <span className="inline-flex items-center rounded-md bg-green-600 px-3 py-1 text-sm font-semibold text-white uppercase tracking-wide">
                    {formatEnvelopeStatus(tenancyEnvelope.status)}
                  </span>
                ) : (
                  <Badge variant="secondary">
                    {formatEnvelopeStatus(tenancyEnvelope.status)}
                  </Badge>
                )}
              </div>
            )}
          </div>
          {tenancyEnvelope && (
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Last updated {format(new Date(tenancyEnvelope.updated_at), "d MMM yyyy")}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!isEnvelopeCompleted(tenancyEnvelope.status) && (
                  <Button
                    variant="default"
                    size="sm"
                    className="rounded-md uppercase tracking-wide gap-2"
                    onClick={onSignTenancy}
                    disabled={isSigningTenancy}
                  >
                    {isSigningTenancy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Opening DocuSign...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Sign online
                      </>
                    )}
                  </Button>
                )}
                {canDownloadEnvelope(tenancyEnvelope) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-md uppercase tracking-wide gap-2"
                    onClick={() => onDownload(tenancyEnvelope.envelope_id ?? "", "tenancy")}
                    disabled={downloadingId === (tenancyEnvelope.envelope_id ?? `${applicationId}-tenancy`)}
                  >
                    {downloadingId === (tenancyEnvelope.envelope_id ?? `${applicationId}-tenancy`) ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Download
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Guarantor Agreement */}
        {guarantorEnvelope && (
          <div className="rounded-2xl border border-border/60 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <User className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-semibold text-lg">Guarantor Agreement</h3>
                  <p className="text-sm text-muted-foreground">
                    Signed by your guarantor
                  </p>
                </div>
              </div>
              {isEnvelopeCompleted(guarantorEnvelope.status) ? (
                <span className="inline-flex items-center rounded-md bg-green-600 px-3 py-1 text-sm font-semibold text-white uppercase tracking-wide">
                  {formatEnvelopeStatus(guarantorEnvelope.status)}
                </span>
              ) : (
                <Badge variant="secondary">
                  {formatEnvelopeStatus(guarantorEnvelope.status)}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Last updated {format(new Date(guarantorEnvelope.updated_at), "d MMM yyyy")}
              </div>
              {canDownloadEnvelope(guarantorEnvelope) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-md uppercase tracking-wide gap-2"
                  onClick={() => onDownload(guarantorEnvelope.envelope_id ?? "", "guarantor")}
                  disabled={downloadingId === (guarantorEnvelope.envelope_id ?? `${applicationId}-guarantor`)}
                >
                  {downloadingId === (guarantorEnvelope.envelope_id ?? `${applicationId}-guarantor`) ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Download
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {!tenancyEnvelope && !guarantorEnvelope && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Agreements will appear here once they are sent for signature.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default Contracts;

