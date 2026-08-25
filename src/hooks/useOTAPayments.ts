import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { OTAPaymentStatus } from "@/utils/otaPayment";

export type OTAPayment = Database["public"]["Tables"]["ota_payments"]["Row"];

export type OTAPaymentSummary = {
  gross_booking_value: number;
  amount_due: number;
  total_received: number;
  remaining_balance: number;
  payment_count: number;
  last_payment_date: string | null;
  payment_status: OTAPaymentStatus;
};

export type OTAPaymentLedgerRow = {
  booking_id: string;
  external_ref: string;
  channel: string;
  guest_name: string;
  studio_id: string | null;
  check_in: string;
  check_out: string;
  booking_status: string;
  price_per_night: number | null;
  commission_amount: number | null;
  total_revenue: number | null;
  number_of_nights: number | null;
  currency: string | null;
  gross_booking_value: number;
  amount_due: number;
  total_received: number;
  remaining_balance: number;
  payment_count: number;
  last_payment_date: string | null;
  payment_status: OTAPaymentStatus;
};

export type CreateOTAPaymentInput = {
  otaBookingId: string;
  amount: number;
  paymentType?: "payout" | "refund" | "adjustment";
  receivedFrom: "ota_payout" | "bank_transfer" | "virtual_card" | "guest_direct" | "other";
  referenceNumber: string;
  paymentDate: string;
  currency?: string;
  notes?: string;
};

export type UpdateOTAPaymentInput = {
  id: string;
  bookingId: string;
  amount: number;
  receivedFrom: "ota_payout" | "bank_transfer" | "virtual_card" | "guest_direct" | "other";
  referenceNumber: string;
  paymentDate: string;
  notes?: string;
};

export type OTAPaymentHistoryRow = OTAPayment & {
  ota_booking: {
    id: string;
    external_ref: string;
    channel: string;
    guest_name: string;
    guest_email: string | null;
    guest_phone: string | null;
    check_in: string;
    check_out: string;
    studio_id: string | null;
    currency: string | null;
    status: string;
    number_of_nights: number | null;
    studio?: { studio_number: string } | null;
  } | null;
};

export const useOTAPaymentSummary = (bookingId: string | null | undefined) => {
  return useQuery({
    queryKey: ["ota-payment-summary", bookingId],
    queryFn: async (): Promise<OTAPaymentSummary | null> => {
      if (!bookingId) return null;
      const { data, error } = await supabase.rpc("get_ota_payment_summary", {
        p_booking_id: bookingId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        gross_booking_value: Number(row.gross_booking_value ?? 0),
        amount_due: Number(row.amount_due ?? 0),
        total_received: Number(row.total_received ?? 0),
        remaining_balance: Number(row.remaining_balance ?? 0),
        payment_count: Number(row.payment_count ?? 0),
        last_payment_date: row.last_payment_date ?? null,
        payment_status: (row.payment_status ?? "unpaid") as OTAPaymentStatus,
      };
    },
    enabled: Boolean(bookingId),
  });
};

export const useOTAPaymentsForBooking = (bookingId: string | null | undefined) => {
  return useQuery({
    queryKey: ["ota-payments", "booking", bookingId],
    queryFn: async () => {
      if (!bookingId) return [] as OTAPayment[];
      const { data, error } = await supabase
        .from("ota_payments")
        .select("*")
        .eq("ota_booking_id", bookingId)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OTAPayment[];
    },
    enabled: Boolean(bookingId),
  });
};

export const useOTAPaymentLedger = (filters?: {
  channel?: string;
  paymentStatus?: OTAPaymentStatus | "all";
  checkInStart?: string;
  checkInEnd?: string;
  search?: string;
}) => {
  return useQuery({
    queryKey: ["ota-payment-ledger", filters],
    queryFn: async () => {
      let query = supabase
        .from("ota_bookings_payment_ledger")
        .select("*")
        .order("check_in", { ascending: false });

      if (filters?.channel) {
        query = query.eq("channel", filters.channel);
      }
      if (filters?.paymentStatus && filters.paymentStatus !== "all") {
        query = query.eq("payment_status", filters.paymentStatus);
      }
      if (filters?.checkInStart) {
        query = query.gte("check_in", filters.checkInStart);
      }
      if (filters?.checkInEnd) {
        query = query.lte("check_in", filters.checkInEnd);
      }

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as OTAPaymentLedgerRow[];

      const q = filters?.search?.trim().toLowerCase();
      if (q) {
        rows = rows.filter(
          (r) =>
            r.external_ref.toLowerCase().includes(q) ||
            r.guest_name.toLowerCase().includes(q) ||
            r.channel.toLowerCase().includes(q),
        );
      }

      const studioIds = [...new Set(rows.map((r) => r.studio_id).filter(Boolean))] as string[];
      let studioMap: Record<string, string> = {};
      if (studioIds.length > 0) {
        const { data: studios } = await supabase
          .from("studios")
          .select("id, studio_number")
          .in("id", studioIds);
        (studios ?? []).forEach((s) => {
          studioMap[s.id] = s.studio_number;
        });
      }

      return rows.map((row) => ({
        ...row,
        studio_number: row.studio_id ? studioMap[row.studio_id] ?? null : null,
      }));
    },
  });
};

export const useOTAPaymentHistory = (filters?: {
  channel?: string;
  paymentDateStart?: string;
  paymentDateEnd?: string;
  search?: string;
}) => {
  return useQuery({
    queryKey: ["ota-payments", "history", filters],
    queryFn: async () => {
      let query = supabase
        .from("ota_payments")
        .select(`
          *,
          ota_booking:ota_bookings(
            id, external_ref, channel, guest_name, guest_email, guest_phone,
            check_in, check_out, studio_id, currency, status, number_of_nights
          )
        `)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (filters?.paymentDateStart) {
        query = query.gte("payment_date", filters.paymentDateStart);
      }
      if (filters?.paymentDateEnd) {
        query = query.lte("payment_date", filters.paymentDateEnd);
      }

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as unknown as OTAPaymentHistoryRow[];

      const studioIds = [
        ...new Set(rows.map((r) => r.ota_booking?.studio_id).filter(Boolean)),
      ] as string[];
      let studioMap: Record<string, string> = {};
      if (studioIds.length > 0) {
        const { data: studios } = await supabase
          .from("studios")
          .select("id, studio_number")
          .in("id", studioIds);
        (studios ?? []).forEach((s) => {
          studioMap[s.id] = s.studio_number;
        });
      }

      rows = rows.map((row) => {
        const studioId = row.ota_booking?.studio_id;
        return {
          ...row,
          ota_booking: row.ota_booking
            ? {
                ...row.ota_booking,
                studio: studioId && studioMap[studioId]
                  ? { studio_number: studioMap[studioId] }
                  : null,
              }
            : null,
        };
      });

      if (filters?.channel) {
        rows = rows.filter((r) => r.ota_booking?.channel === filters.channel);
      }

      const q = filters?.search?.trim().toLowerCase();
      if (q) {
        rows = rows.filter((r) => {
          const booking = r.ota_booking;
          return (
            r.reference_number.toLowerCase().includes(q) ||
            (r.notes ?? "").toLowerCase().includes(q) ||
            (booking?.external_ref ?? "").toLowerCase().includes(q) ||
            (booking?.guest_name ?? "").toLowerCase().includes(q) ||
            (booking?.guest_email ?? "").toLowerCase().includes(q) ||
            (booking?.studio?.studio_number ?? "").toLowerCase().includes(q)
          );
        });
      }

      return rows;
    },
  });
};

export const useCreateOTAPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOTAPaymentInput) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user?.id) throw new Error("You must be signed in to record a payment.");

      const summaryResult = await supabase.rpc("get_ota_payment_summary", {
        p_booking_id: input.otaBookingId,
      });
      if (summaryResult.error) throw summaryResult.error;
      const summary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
      if (summary?.payment_status === "fully_paid") {
        throw new Error("This reservation is already fully settled.");
      }
      if (summary?.payment_status === "void") {
        throw new Error("Cannot record payments on cancelled or no-show bookings.");
      }

      const { data, error } = await supabase
        .from("ota_payments")
        .insert({
          ota_booking_id: input.otaBookingId,
          amount: input.amount,
          payment_type: input.paymentType ?? "payout",
          received_from: input.receivedFrom,
          reference_number: input.referenceNumber.trim(),
          payment_date: input.paymentDate,
          currency: input.currency ?? "GBP",
          notes: input.notes?.trim() || null,
          recorded_by: userData.user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as OTAPayment;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ota-payments"] });
      queryClient.invalidateQueries({ queryKey: ["ota-payment-summary", variables.otaBookingId] });
      queryClient.invalidateQueries({ queryKey: ["ota-payment-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["ota-bookings"] });
    },
  });
};

export const useUpdateOTAPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateOTAPaymentInput) => {
      const { data, error } = await supabase
        .from("ota_payments")
        .update({
          amount: input.amount,
          received_from: input.receivedFrom,
          reference_number: input.referenceNumber.trim(),
          payment_date: input.paymentDate,
          notes: input.notes?.trim() || null,
        })
        .eq("id", input.id)
        .select()
        .single();

      if (error) throw error;
      return data as OTAPayment;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["ota-payments"] });
      queryClient.invalidateQueries({ queryKey: ["ota-payment-summary", variables.bookingId] });
      queryClient.invalidateQueries({ queryKey: ["ota-payment-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["ota-bookings"] });
    },
  });
};

export const useDeleteOTAPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, bookingId }: { id: string; bookingId: string }) => {
      const { error } = await supabase.from("ota_payments").delete().eq("id", id);
      if (error) throw error;
      return bookingId;
    },
    onSuccess: (bookingId) => {
      queryClient.invalidateQueries({ queryKey: ["ota-payments"] });
      queryClient.invalidateQueries({ queryKey: ["ota-payment-summary", bookingId] });
      queryClient.invalidateQueries({ queryKey: ["ota-payment-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["ota-bookings"] });
    },
  });
};

export const useSendOTAPaymentReceipt = () => {
  return useMutation({
    mutationFn: async (input: { paymentId: string; toEmail: string }) => {
      const { data, error } = await supabase.functions.invoke("send-ota-payment-receipt", {
        body: {
          paymentId: input.paymentId,
          toEmail: input.toEmail.trim(),
        },
      });
      if (error) {
        const message =
          data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : error.message;
        throw new Error(message);
      }
      if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
        throw new Error((data as { error: string }).error);
      }
      return data as { message: string; to: string; receiptNumber: string };
    },
  });
};
