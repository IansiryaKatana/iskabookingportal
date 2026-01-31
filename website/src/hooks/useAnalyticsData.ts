import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format, isAfter } from "date-fns";

const DAYS = 28;
const PREV_DAYS = 28;

type PageViewRow = {
  page_path: string;
  session_id: string | null;
  user_agent: string | null;
  created_at: string;
};

function parseDevice(ua: string | null): "Mobile" | "Desktop" | "Tablet" | "Smart Tv" {
  if (!ua) return "Desktop";
  const u = ua.toLowerCase();
  if (/tablet|ipad|playbook|silk/.test(u)) return "Tablet";
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/.test(u)) return "Mobile";
  if (/smarttv|googletv|appletv|hbbtv|netcast|viera|roku/.test(u)) return "Smart Tv";
  return "Desktop";
}

function formatSessionDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m 0s`;
}

export function useAnalyticsData() {
  return useQuery({
    queryKey: ["analytics-dashboard-data", DAYS],
    queryFn: async () => {
      const from = subDays(new Date(), DAYS + PREV_DAYS);
      const fromStr = from.toISOString();

      const { data: rows, error } = await supabase
        .from("website_analytics_page_views")
        .select("page_path, session_id, user_agent, created_at")
        .gte("created_at", fromStr)
        .order("created_at", { ascending: true });

      if (error) throw error;
      const list = (rows || []) as PageViewRow[];

      const now = new Date();
      const currentStart = subDays(now, DAYS);
      const prevStart = subDays(now, DAYS + PREV_DAYS);

      const currentPeriod = list.filter((r) => isAfter(new Date(r.created_at), currentStart));
      const prevPeriod = list.filter(
        (r) =>
          isAfter(new Date(r.created_at), prevStart) &&
          !isAfter(new Date(r.created_at), currentStart),
      );

      const currentSessions = new Set(currentPeriod.map((r) => r.session_id).filter(Boolean));
      const prevSessions = new Set(prevPeriod.map((r) => r.session_id).filter(Boolean));
      const allVisitors = currentSessions.size;
      const prevVisitors = prevSessions.size;
      const pctChange =
        prevVisitors > 0 ? ((allVisitors - prevVisitors) / prevVisitors) * 100 : 0;

      const dailyMap: Record<string, number> = {};
      for (let i = 0; i < DAYS; i++) {
        const d = format(subDays(now, DAYS - 1 - i), "yyyy-MM-dd");
        dailyMap[d] = 0;
      }
      currentPeriod.forEach((r) => {
        const d = format(new Date(r.created_at), "yyyy-MM-dd");
        if (d in dailyMap) dailyMap[d]++;
      });
      const dailyData = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date: format(new Date(date), "MMM d"), visitors: count }));

      const deviceMap: Record<string, number> = { Mobile: 0, Desktop: 0, Tablet: 0, "Smart Tv": 0 };
      currentPeriod.forEach((r) => {
        const d = parseDevice(r.user_agent);
        deviceMap[d]++;
      });
      const totalDev = Object.values(deviceMap).reduce((a, b) => a + b, 0);
      const deviceData = Object.entries(deviceMap)
        .filter(([, v]) => v > 0)
        .map(([name, count]) => ({
          name,
          value: totalDev > 0 ? Math.round((count / totalDev) * 1000) / 10 : 0,
          count,
        }))
        .sort((a, b) => b.count - a.count);

      const pageMap: Record<
        string,
        { pageviews: number; sessions: Set<string>; timestamps: number[] }
      > = {};
      currentPeriod.forEach((r) => {
        const p = r.page_path || "/";
        if (!pageMap[p]) pageMap[p] = { pageviews: 0, sessions: new Set(), timestamps: [] };
        pageMap[p].pageviews++;
        if (r.session_id) pageMap[p].sessions.add(r.session_id);
        pageMap[p].timestamps.push(new Date(r.created_at).getTime());
      });
      const topContent = Object.entries(pageMap)
        .map(([path, data]) => {
          const sessions = data.sessions.size;
          const durations = data.timestamps.length >= 2
            ? Math.max(...data.timestamps) - Math.min(...data.timestamps)
            : 0;
          const engagementRate =
            allVisitors > 0
              ? Math.round((sessions / allVisitors) * 10000) / 100
              : 0;
          return {
            page_path: path,
            pageviews: data.pageviews,
            sessions,
            engagementRate,
            avgDurationMs: sessions > 0 ? durations / sessions : 0,
          };
        })
        .sort((a, b) => b.pageviews - a.pageviews)
        .slice(0, 10);

      const sessionPages = new Map<string, number[]>();
      currentPeriod.forEach((r) => {
        const sid = r.session_id || `anon-${r.created_at}`;
        if (!sessionPages.has(sid)) sessionPages.set(sid, []);
        sessionPages.get(sid)!.push(new Date(r.created_at).getTime());
      });
      let newVisitors = 0;
      let returningVisitors = 0;
      let newPageviews = 0;
      let returningPageviews = 0;
      sessionPages.forEach((timestamps) => {
        const pages = timestamps.length;
        const isReturning = pages >= 2;
        if (isReturning) {
          returningVisitors++;
          returningPageviews += pages;
        } else {
          newVisitors++;
          newPageviews += pages;
        }
      });
      const totalPv = newPageviews + returningPageviews;

      return {
        allVisitors,
        pctChange,
        dailyData,
        deviceData,
        topContent,
        newVisitors,
        returningVisitors,
        newPageviews,
        returningPageviews,
        totalPageviews: totalPv,
        prevVisitors,
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}

export { formatSessionDuration };
