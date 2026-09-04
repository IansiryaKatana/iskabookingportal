import { useCallback, useRef, useState } from "react";

const yieldToPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

/**
 * Loading state for file exports. Yields a paint frame after setting
 * `isExporting` so the spinner appears before synchronous Blob work.
 */
export function useExporting() {
  const [isExporting, setIsExporting] = useState(false);
  const inFlight = useRef(false);

  const runExport = useCallback(async (fn: () => void | Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsExporting(true);
    await yieldToPaint();
    try {
      await fn();
    } finally {
      inFlight.current = false;
      setIsExporting(false);
    }
  }, []);

  return { isExporting, runExport };
}
