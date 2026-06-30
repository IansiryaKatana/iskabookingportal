import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const DISCARD_FLAG_KEY = "tab-was-discarded";

/**
 * Shows a one-time toast when the browser discarded and reloaded this tab
 * (Chrome Memory Saver / long background). Form drafts in sessionStorage may
 * have been restored by useFormDraft on the same load.
 */
export function useTabDiscardNotice() {
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const wasDiscarded =
      (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true;

    if (wasDiscarded) {
      sessionStorage.setItem(DISCARD_FLAG_KEY, "1");
    }

    const flagged = sessionStorage.getItem(DISCARD_FLAG_KEY);
    if (!flagged) return;

    sessionStorage.removeItem(DISCARD_FLAG_KEY);

    toast({
      title: "This tab was reloaded",
      description:
        "Your browser refreshed this page after it was inactive. Unsaved drafts may have been restored where supported.",
      duration: 8000,
    });
  }, [toast]);
}
