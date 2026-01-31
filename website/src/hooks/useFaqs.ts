import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WebsiteFaq = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  display_order: number;
  helpful_count: number;
};

export type FaqCategory = {
  id: string;
  name: string;
  items: { question: string; answer: string }[];
};

export function useFaqs() {
  return useQuery({
    queryKey: ["website-faqs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_faqs")
        .select("id, question, answer, category, display_order, helpful_count")
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return (data || []) as WebsiteFaq[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Group FAQs by category for accordion/tabs. */
export function useFaqsByCategory(): FaqCategory[] {
  const { data: faqs } = useFaqs();
  return useMemo(() => {
    if (!faqs?.length) return [];
    const byCategory = new Map<string, { question: string; answer: string }[]>();
    for (const faq of faqs) {
      const cat = faq.category || "General";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push({ question: faq.question, answer: faq.answer });
    }
    return Array.from(byCategory.entries()).map(([name, items]) => ({
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      items,
    }));
  }, [faqs]);
}
