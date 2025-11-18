import { useMemo } from "react";
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
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const Contracts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  const downloadSignedDocument = async (envelopeId: string, envelopeType: string, applicationId: string) => {
    setDownloadingId(envelopeId);
    try {
      const { data, error } = await supabase.functions.invoke("download-signed-document", {
        body: { envelopeId, applicationId },
      });

      if (error) throw error;

      if (data?.url) {
        // Open the signed document in a new tab
        window.open(data.url, "_blank");
        toast({
          title: "Download started",
          description: "The signed document is opening in a new tab.",
        });
      } else {
        toast({
          title: "Download unavailable",
          description: data?.message || "Document download is not yet available. Please download directly from DocuSign.",
        });
      }
    } catch (error) {
      console.error("Error downloading document:", error);
      toast({
        variant: "destructive",
        title: "Download failed",
        description: "Unable to download the signed document. Please try again later.",
      });
    } finally {
      setDownloadingId(null);
    }
  };

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
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-28 rounded-full" />
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
              onDownload={(envelopeId, envelopeType) => downloadSignedDocument(envelopeId, envelopeType, app.id)}
              downloadingId={downloadingId}
              formatEnvelopeStatus={formatEnvelopeStatus}
              isEnvelopeCompleted={isEnvelopeCompleted}
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
  onDownload: (envelopeId: string, envelopeType: string, applicationId: string) => void;
  downloadingId: string | null;
  formatEnvelopeStatus: (status?: string | null) => string;
  isEnvelopeCompleted: (status?: string | null) => boolean;
};

const ContractCard = ({
  applicationId,
  contractName,
  gradeName,
  startDate,
  endDate,
  onDownload,
  downloadingId,
  formatEnvelopeStatus,
  isEnvelopeCompleted,
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
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-28 rounded-full" />
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
                  <span className="inline-flex items-center rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white uppercase tracking-wide">
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
              {isEnvelopeCompleted(tenancyEnvelope.status) && tenancyEnvelope.envelope_id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full uppercase tracking-wide gap-2"
                  onClick={() => onDownload(tenancyEnvelope.envelope_id!, "tenancy", applicationId)}
                  disabled={downloadingId === tenancyEnvelope.envelope_id}
                >
                  {downloadingId === tenancyEnvelope.envelope_id ? (
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
                <span className="inline-flex items-center rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white uppercase tracking-wide">
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
              {isEnvelopeCompleted(guarantorEnvelope.status) && guarantorEnvelope.envelope_id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full uppercase tracking-wide gap-2"
                  onClick={() => onDownload(guarantorEnvelope.envelope_id!, "guarantor", applicationId)}
                  disabled={downloadingId === guarantorEnvelope.envelope_id}
                >
                  {downloadingId === guarantorEnvelope.envelope_id ? (
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

