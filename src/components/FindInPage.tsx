import { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FindInPageProps {
  open: boolean;
  onClose: () => void;
}

/**
 * System-style in-page find bar. Opens with Ctrl+F (Windows/Linux) or Cmd+F (Mac).
 * Searches and highlights text in the current page; Previous/Next navigate matches.
 */
export function FindInPage({ open, onClose }: FindInPageProps) {
  const [query, setQuery] = useState("");
  const [totalMatches, setTotalMatches] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const searchForward = useCallback(() => {
    if (!query.trim()) return false;
    return window.find(query, false, false, true, false, false, false);
  }, [query]);

  const searchBackward = useCallback(() => {
    if (!query.trim()) return false;
    return window.find(query, true, false, true, false, false, false);
  }, [query]);

  const countMatches = useCallback(() => {
    if (!query.trim()) {
      setTotalMatches(0);
      return;
    }
    let count = 0;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent || "";
      let idx = 0;
      const lower = query.toLowerCase();
      const lowerText = text.toLowerCase();
      while ((idx = lowerText.indexOf(lower, idx)) !== -1) {
        count++;
        idx += query.length;
      }
    }

    setTotalMatches(count);
  }, [query]);

  const goNext = useCallback(() => {
    searchForward();
  }, [searchForward]);

  const goPrev = useCallback(() => {
    searchBackward();
  }, [searchBackward]);

  // Focus input when opened; run search once if there's already a query (does not run on every keystroke)
  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      if (query.trim()) {
        countMatches();
        searchForward();
      } else {
        setTotalMatches(0);
      }
    }
  }, [open]); // intentionally omit query/searchForward/countMatches so we don't run search on every keystroke

  // Update match count when query changes (do NOT run window.find here — it steals focus)
  useEffect(() => {
    if (!open) return;
    countMatches();
    // Keep typing smooth: counting can disturb selection in some browsers; ensure input stays focused.
    if (document.activeElement !== inputRef.current) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [query, open, countMatches]);

  // Keyboard: Escape close, Enter next, Shift+Enter previous
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Enter" && (e.target as HTMLElement)?.getAttribute?.("data-find-input") === "true") {
        e.preventDefault();
        if (e.shiftKey) goPrev();
        else goNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, goNext, goPrev]);

  if (!open) return null;

  return (
    <div
      role="search"
      className={cn(
        "fixed left-0 right-0 top-0 z-[100] flex items-center gap-2 border-b border-border bg-background px-3 py-2 shadow-md",
        "flex-wrap"
      )}
    >
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <Input
          ref={inputRef}
          data-find-input="true"
          type="text"
          placeholder="Find on this page..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 max-w-[280px] flex-shrink-0"
          autoComplete="off"
          aria-label="Find in page"
        />
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={goPrev}
            disabled={!query.trim()}
            aria-label="Previous match"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={goNext}
            disabled={!query.trim()}
            aria-label="Next match"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
        {query.trim() && (
          <span className="text-xs text-muted-foreground whitespace-nowrap" aria-live="polite">
            {totalMatches === 0 ? "No matches" : `${totalMatches} match${totalMatches !== 1 ? "es" : ""}`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={onClose}>
          Close
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 bg-yellow-300 text-black hover:bg-black hover:text-white"
          onClick={onClose}
          aria-label="Close find"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default FindInPage;
