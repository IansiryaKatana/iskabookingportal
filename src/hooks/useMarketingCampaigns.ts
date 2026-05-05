import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MarketingTemplate = {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  is_active: boolean;
  created_at: string;
};

export type MarketingCampaign = {
  id: string;
  name: string;
  status: "draft" | "sending" | "completed" | "failed";
  total_recipients: number;
  emails_sent: number;
  failed_count: number;
  sent_at: string | null;
  created_at: string;
  marketing_email_templates?: { name: string } | null;
};

export type MarketingContact = {
  id: string;
  email: string;
  full_name: string | null;
  source: string;
  tags?: string[] | null;
  is_subscribed: boolean;
  created_at: string;
};

type MarketingContactInput = {
  email: string;
  full_name?: string | null;
  source?: string;
  tags?: string[];
  is_subscribed?: boolean;
};

type CreateCampaignPayload = {
  name: string;
  template_id: string;
  emails: string[];
};

const CHUNK_SIZE = 100;

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const fetchExistingContactsByEmails = async (emails: string[]) => {
  const uniqueEmails = Array.from(new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)));
  if (uniqueEmails.length === 0) return [] as Array<{ id: string; email: string }>;

  const results: Array<{ id: string; email: string }> = [];

  for (const emailChunk of chunkArray(uniqueEmails, CHUNK_SIZE)) {
    const { data, error } = await (supabase as any)
      .from("marketing_contacts")
      .select("id, email")
      .in("email", emailChunk);

    if (!error) {
      results.push(...((data ?? []) as Array<{ id: string; email: string }>));
      continue;
    }

    // Fallback for PostgREST parsing issues on large/special-value IN filters.
    for (const email of emailChunk) {
      const { data: row, error: rowError } = await (supabase as any)
        .from("marketing_contacts")
        .select("id, email")
        .eq("email", email)
        .maybeSingle();
      if (rowError) throw rowError;
      if (row) results.push(row as { id: string; email: string });
    }
  }

  const deduped = new Map<string, { id: string; email: string }>();
  results.forEach((contact) => {
    deduped.set(contact.email.toLowerCase(), contact);
  });
  return Array.from(deduped.values());
};

export const useMarketingTemplates = () =>
  useQuery({
    queryKey: ["marketing-templates"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("marketing_email_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MarketingTemplate[];
    },
  });

export const useCreateMarketingTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      subject: string;
      body_html: string;
      body_text?: string;
      is_active?: boolean;
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await (supabase as any)
        .from("marketing_email_templates")
        .insert({
          ...payload,
          body_text: payload.body_text || null,
          is_active: payload.is_active ?? true,
          created_by: user?.id ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as MarketingTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-templates"] });
    },
  });
};

export const useUpdateMarketingTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      subject: string;
      body_html: string;
      body_text?: string;
      is_active?: boolean;
    }) => {
      const { id, ...rest } = payload;
      const { data, error } = await (supabase as any)
        .from("marketing_email_templates")
        .update({
          ...rest,
          body_text: rest.body_text || null,
          is_active: rest.is_active ?? true,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as MarketingTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-templates"] });
    },
  });
};

export const useDeleteMarketingTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await (supabase as any)
        .from("marketing_email_templates")
        .delete()
        .eq("id", templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-templates"] });
    },
  });
};

export const useMarketingCampaigns = () =>
  useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("marketing_campaigns")
        .select("id, name, status, total_recipients, emails_sent, failed_count, sent_at, created_at, marketing_email_templates(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as MarketingCampaign[];
    },
  });

export const useMarketingContacts = () =>
  useQuery({
    queryKey: ["marketing-contacts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("marketing_contacts")
        .select("id, email, full_name, source, tags, is_subscribed, created_at")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as MarketingContact[];
    },
  });

export const useCreateAndSendMarketingCampaign = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, template_id, emails }: CreateCampaignPayload) => {
      const normalizedEmails = Array.from(
        new Set(
          emails
            .map((email) => email.trim().toLowerCase())
            .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
        ),
      );

      if (normalizedEmails.length === 0) {
        throw new Error("No valid email addresses found.");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const existingContacts = await fetchExistingContactsByEmails(normalizedEmails);

      const existingEmails = new Set(
        (existingContacts ?? []).map((contact: { email: string }) => contact.email.toLowerCase()),
      );
      const missingEmails = normalizedEmails.filter((email) => !existingEmails.has(email));

      if (missingEmails.length > 0) {
        const contactsPayload = missingEmails.map((email) => ({
          email,
          source: "campaign_upload",
          created_by: user?.id ?? null,
        }));
        const { error: contactsInsertError } = await (supabase as any)
          .from("marketing_contacts")
          .insert(contactsPayload);
        if (contactsInsertError) throw contactsInsertError;
      }

      const contacts = await fetchExistingContactsByEmails(normalizedEmails);

      const { data: campaign, error: campaignError } = await (supabase as any)
        .from("marketing_campaigns")
        .insert({
          name,
          template_id,
          created_by: user?.id ?? null,
          sent_by: user?.id ?? null,
          status: "draft",
          audience_source: "manual_upload",
        })
        .select("id")
        .single();

      if (campaignError) throw campaignError;

      const contactByEmail = new Map<string, { id: string; email: string }>();
      (contacts ?? []).forEach((contact: { id: string; email: string }) => {
        contactByEmail.set(contact.email.toLowerCase(), contact);
      });

      const recipientsPayload = normalizedEmails.map((email) => ({
        campaign_id: campaign.id,
        contact_id: contactByEmail.get(email)?.id ?? null,
        email,
      }));

      const { error: recipientsError } = await (supabase as any)
        .from("marketing_campaign_recipients")
        .insert(recipientsPayload);

      if (recipientsError) throw recipientsError;

      const { error: invokeError } = await supabase.functions.invoke("send-marketing-campaign", {
        body: { campaign_id: campaign.id },
      });
      if (invokeError) throw invokeError;

      return campaign.id as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-contacts"] });
    },
  });
};

export const useDeleteMarketingCampaign = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { error } = await (supabase as any)
        .from("marketing_campaigns")
        .delete()
        .eq("id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
    },
  });
};

export const useBulkDeleteMarketingCampaigns = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (campaignIds: string[]) => {
      if (campaignIds.length === 0) return;
      const { error } = await (supabase as any)
        .from("marketing_campaigns")
        .delete()
        .in("id", campaignIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
    },
  });
};

export const useBulkSaveMarketingContacts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactsInput: MarketingContactInput[]) => {
      const normalized = Array.from(
        new Map(
          contactsInput
            .map((contact) => ({
              email: contact.email.trim().toLowerCase(),
              full_name: contact.full_name?.trim() || null,
              source: contact.source?.trim() || "manual_upload",
              tags: Array.isArray(contact.tags) ? contact.tags.map((tag) => tag.trim()).filter(Boolean) : [],
              is_subscribed: contact.is_subscribed ?? true,
            }))
            .filter((contact) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email))
            .map((contact) => [contact.email, contact]),
        ).values(),
      );

      if (normalized.length === 0) throw new Error("No valid contacts to save.");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const emails = normalized.map((contact) => contact.email);
      const existingContacts = await fetchExistingContactsByEmails(emails);

      const existingByEmail = new Map(
        (existingContacts ?? []).map((contact: { id: string; email: string }) => [contact.email.toLowerCase(), contact.id]),
      );

      const toInsert = normalized
        .filter((contact) => !existingByEmail.has(contact.email))
        .map((contact) => ({
          ...contact,
          created_by: user?.id ?? null,
        }));

      if (toInsert.length > 0) {
        const { error: insertError } = await (supabase as any).from("marketing_contacts").insert(toInsert);
        if (insertError) throw insertError;
      }

      for (const contact of normalized) {
        const existingId = existingByEmail.get(contact.email);
        if (!existingId) continue;
        const { error: updateError } = await (supabase as any)
          .from("marketing_contacts")
          .update({
            full_name: contact.full_name,
            source: contact.source,
            tags: contact.tags,
            is_subscribed: contact.is_subscribed,
          })
          .eq("id", existingId);
        if (updateError) throw updateError;
      }

      return { total: normalized.length, inserted: toInsert.length, updated: normalized.length - toInsert.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-contacts"] });
    },
  });
};

export const useUpdateMarketingContact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      email: string;
      full_name?: string | null;
      source?: string;
      is_subscribed?: boolean;
    }) => {
      const { id, ...rest } = payload;
      const { error } = await (supabase as any)
        .from("marketing_contacts")
        .update({
          ...rest,
          email: rest.email.trim().toLowerCase(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-contacts"] });
    },
  });
};

export const useDeleteMarketingContact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await (supabase as any)
        .from("marketing_contacts")
        .delete()
        .eq("id", contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-contacts"] });
    },
  });
};

export const useBulkDeleteMarketingContacts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contactIds: string[]) => {
      if (contactIds.length === 0) return;
      const { error } = await (supabase as any)
        .from("marketing_contacts")
        .delete()
        .in("id", contactIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-contacts"] });
    },
  });
};

export const useBulkUpdateMarketingContactsSubscription = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { contactIds: string[]; is_subscribed: boolean }) => {
      if (payload.contactIds.length === 0) return;
      const { error } = await (supabase as any)
        .from("marketing_contacts")
        .update({ is_subscribed: payload.is_subscribed })
        .in("id", payload.contactIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-contacts"] });
    },
  });
};

export const useBulkDeleteMarketingTemplates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (templateIds: string[]) => {
      if (templateIds.length === 0) return;
      const { error } = await (supabase as any)
        .from("marketing_email_templates")
        .delete()
        .in("id", templateIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-templates"] });
    },
  });
};

export const useBulkUpdateMarketingTemplatesActive = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { templateIds: string[]; is_active: boolean }) => {
      if (payload.templateIds.length === 0) return;
      const { error } = await (supabase as any)
        .from("marketing_email_templates")
        .update({ is_active: payload.is_active })
        .in("id", payload.templateIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing-templates"] });
    },
  });
};
