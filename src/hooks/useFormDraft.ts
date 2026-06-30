import { useCallback, useEffect, useRef } from "react";

type DraftEnvelope<T> = {
  savedAt: number;
  values: T;
};

const readDraft = <T>(key: string): T | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || parsed.values === undefined) {
      return null;
    }
    return parsed.values;
  } catch {
    return null;
  }
};

const writeDraft = <T>(key: string, values: T) => {
  if (typeof window === "undefined") return;
  try {
    const envelope: DraftEnvelope<T> = { savedAt: Date.now(), values };
    window.sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // sessionStorage full or unavailable — ignore
  }
};

export const clearFormDraft = (key: string) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(key);
};

type UseFormDraftOptions = {
  /** When false, skip restore (still persists on tab hide if values change while enabled). */
  enabled?: boolean;
  debounceMs?: number;
};

/**
 * Persists in-progress form values to sessionStorage so staff don't lose work
 * when the browser discards an inactive tab or reloads the page.
 */
export function useFormDraft<T extends Record<string, unknown>>(
  storageKey: string,
  values: T,
  apply: (draft: Partial<T>) => void,
  options: UseFormDraftOptions = {},
) {
  const { enabled = true, debounceMs = 500 } = options;
  const skipNextWriteRef = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // Restore whenever enabled becomes true (e.g. dialog opens or page mounts).
  useEffect(() => {
    if (!enabled) return;
    const draft = readDraft<T>(storageKey);
    if (!draft) return;
    skipNextWriteRef.current = true;
    applyRef.current(draft);
  }, [enabled, storageKey]);

  const persist = useCallback(() => {
    writeDraft(storageKey, values);
  }, [storageKey, values]);

  useEffect(() => {
    if (!enabled) return;
    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }
    const timer = window.setTimeout(persist, debounceMs);
    return () => window.clearTimeout(timer);
  }, [enabled, persist, debounceMs, values]);

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) persist();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [persist]);

  const clearDraft = useCallback(() => {
    clearFormDraft(storageKey);
  }, [storageKey]);

  return { clearDraft };
}
