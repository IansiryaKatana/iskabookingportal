import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { isEnvelopeCompleted, isEnvelopeSuperseded } from "@/utils/envelopeStatus";

type CheckStatusUpdate = {
  envelopeId: string;
  status: string;
  updated: boolean;
};

type CheckStatusResponse = {
  success?: boolean;
  updates?: CheckStatusUpdate[];
  message?: string;
  error?: string;
};

/** Build a DocuSign return URL that triggers a status sync when the student lands back in the portal. */
export function buildSigningReturnUrl(path: string, applicationId: string): string {
  if (typeof window === "undefined") return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("event", "signing_complete");
  url.searchParams.set("applicationId", applicationId);
  return `${url.pathname}${url.search}`;
}

/** Poll DocuSign and refresh envelope + application status for one application. */
export async function syncDocusignApplicationStatus(
  applicationId: string,
): Promise<{ updated: boolean }> {
  const { data, error } = await supabase.functions.invoke<CheckStatusResponse>(
    "docusign-check-status",
    { body: { applicationId } },
  );

  if (error) {
    throw new Error(error.message ?? "Unable to refresh agreement status");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  const updated = (data?.updates ?? []).some((entry) => entry.updated);
  return { updated };
}

export function invalidateApplicationAgreementQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  applicationId: string,
) {
  void queryClient.invalidateQueries({ queryKey: ["student-application", applicationId] });
  void queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
  void queryClient.invalidateQueries({ queryKey: ["student-applications"] });
}

export async function refetchApplicationAgreementQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  applicationId: string,
) {
  await queryClient.refetchQueries({ queryKey: ["student-application", applicationId] });
}

/**
 * After DocuSign redirect (?event=signing_complete), sync envelope status once and clean the URL.
 */
export function useSigningCompleteSync(applicationIds: string[] = []) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    if (searchParams.get("event") !== "signing_complete") return;

    handledRef.current = true;

    const targetId = searchParams.get("applicationId");
    const idsToSync = targetId
      ? [targetId]
      : applicationIds.filter(Boolean);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("event");
    nextParams.delete("applicationId");
    setSearchParams(nextParams, { replace: true });

    if (idsToSync.length === 0) return;

    void (async () => {
      try {
        let anyUpdated = false;
        for (const id of idsToSync) {
          const { updated } = await syncDocusignApplicationStatus(id);
          if (updated) anyUpdated = true;
          invalidateApplicationAgreementQueries(queryClient, id);
        }

        toast({
          title: anyUpdated ? "Agreement status updated" : "Signing recorded",
          description: anyUpdated
            ? "Your agreement status has been refreshed."
            : "We checked DocuSign for the latest signing status.",
        });
      } catch (err) {
        console.error("Signing complete sync failed:", err);
        toast({
          variant: "destructive",
          title: "Could not refresh agreement status",
          description:
            err instanceof Error ? err.message : "Please try again in a moment.",
        });
      }
    })();
  }, [applicationIds, queryClient, searchParams, setSearchParams, toast]);
}

/**
 * On page load, sync applications that still have DocuSign envelopes awaiting completion.
 */
export function usePendingEnvelopeStatusSync(
  applications:
    | Array<{
        id: string;
        status?: string | null;
        docusign_envelopes?: Array<{ status?: string | null; envelope_id?: string | null }> | null;
      }>
    | undefined,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const syncedRef = useRef<string>("");

  useEffect(() => {
    if (!enabled || !applications?.length) return;

    const pendingIds = applications
      .filter((app) => {
        if (app.status !== "awaiting_signature" && app.status !== "awaiting_verification") {
          return false;
        }
        const envelopes = app.docusign_envelopes ?? [];
        return envelopes.some((env) => {
          if (isEnvelopeSuperseded(env.status)) return false;
          if (!env.envelope_id) return false;
          return !isEnvelopeCompleted(env.status);
        });
      })
      .map((app) => app.id);

    if (pendingIds.length === 0) return;

    const syncKey = pendingIds.slice().sort().join(",");
    if (syncedRef.current === syncKey) return;
    syncedRef.current = syncKey;

    void (async () => {
      for (const id of pendingIds) {
        try {
          await syncDocusignApplicationStatus(id);
          invalidateApplicationAgreementQueries(queryClient, id);
        } catch (err) {
          console.warn(`Pending envelope sync failed for ${id}:`, err);
        }
      }
    })();
  }, [applications, enabled, queryClient]);
}

/** Sync listed applications once on mount (e.g. Contracts / Dashboard load). */
export function useInitialAgreementStatusSync(applicationIds: string[], enabled = true) {
  const queryClient = useQueryClient();
  const syncedRef = useRef("");

  useEffect(() => {
    if (!enabled || applicationIds.length === 0) return;

    const syncKey = applicationIds.slice().sort().join(",");
    if (syncedRef.current === syncKey) return;
    syncedRef.current = syncKey;

    void (async () => {
      for (const id of applicationIds) {
        try {
          await syncDocusignApplicationStatus(id);
          invalidateApplicationAgreementQueries(queryClient, id);
        } catch (err) {
          console.warn(`Initial agreement sync failed for ${id}:`, err);
        }
      }
    })();
  }, [applicationIds, enabled, queryClient]);
}

/** Manual refresh (staff Application Detail, etc.). */
export function useRefreshAgreementStatus(applicationId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (!applicationId) return;
    setIsRefreshing(true);
    try {
      const { updated } = await syncDocusignApplicationStatus(applicationId);
      invalidateApplicationAgreementQueries(queryClient, applicationId);
      await refetchApplicationAgreementQueries(queryClient, applicationId);
      toast({
        title: updated ? "Agreement status updated" : "Status checked",
        description: updated
          ? "DocuSign signing progress has been refreshed."
          : "No new DocuSign updates were found.",
      });
    } catch (err) {
      console.error("Agreement status refresh failed:", err);
      toast({
        variant: "destructive",
        title: "Could not refresh agreement status",
        description:
          err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [applicationId, queryClient, toast]);

  return { refresh, isRefreshing };
}
