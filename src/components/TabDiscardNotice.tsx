import { useTabDiscardNotice } from "@/hooks/useTabDiscardNotice";

/** Renders nothing; shows a toast when the browser discarded and reloaded this tab. */
export function TabDiscardNotice() {
  useTabDiscardNotice();
  return null;
}
