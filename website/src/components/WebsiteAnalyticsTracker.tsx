import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWebsiteAnalyticsTags } from "@/hooks/useWebsiteAnalyticsTags";

const SESSION_KEY = "website_session_id";

function getSessionId(): string {
  let s = sessionStorage.getItem(SESSION_KEY);
  if (!s) {
    s = crypto.randomUUID?.() ?? `s${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, s);
  }
  return s;
}

function recordPageView(page_path: string) {
  supabase.from("website_analytics_page_views").insert({
    page_path,
    session_id: getSessionId(),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  }).then(({ error }) => {
    if (error) console.warn("[Analytics] Page view insert failed:", error.message);
  });
}

function recordEvent(event_name: string, page_path: string, element_id: string | null, element_text: string | null, metadata?: Record<string, unknown>) {
  supabase.from("website_analytics_events").insert({
    event_name,
    element_id,
    element_text,
    page_path,
    session_id: getSessionId(),
    metadata: metadata ?? null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  }).then(({ error }) => {
    if (error) console.warn("[Analytics] Event insert failed:", error.message);
  });
}

export default function WebsiteAnalyticsTracker() {
  const location = useLocation();
  const { data: tags } = useWebsiteAnalyticsTags();
  const clickHandlerAttached = useRef(false);

  // Record page view on route change
  useEffect(() => {
    recordPageView(location.pathname || "/");
  }, [location.pathname]);

  // Attach delegated click listener for tracked elements
  useEffect(() => {
    if (!tags?.length || clickHandlerAttached.current) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || !document.body.contains(target)) return;

      for (const tag of tags) {
        try {
          if (target.matches?.(tag.element_selector) || target.closest?.(tag.element_selector)) {
            const el = target.matches?.(tag.element_selector) ? target : target.closest(tag.element_selector);
            const element_id = el?.id ?? null;
            const element_text = (el?.textContent ?? "").trim().slice(0, 200) || null;
            recordEvent(
              tag.event_name,
              window.location.pathname || "/",
              element_id,
              element_text,
              { tag_name: tag.tag_name, category: tag.category ?? undefined }
            );
            break;
          }
        } catch {
          // Invalid selector, skip
        }
      }
    };

    document.body.addEventListener("click", handleClick, true);
    clickHandlerAttached.current = true;
    return () => {
      document.body.removeEventListener("click", handleClick, true);
      clickHandlerAttached.current = false;
    };
  }, [tags]);

  return null;
}
