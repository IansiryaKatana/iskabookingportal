import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PaymentVerification = {
  id: string;
  payment_type: "deposit" | "instalment";
  amount: number;
  payment_method: "cash" | "card" | "bank_transfer" | "cheque";
  payment_date: string;
  is_linked: boolean;
  application_id: string | null;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
} | null;

/**
 * Verify a payment by receipt/cheque number in real-time
 * Similar to referral code validation - used in Step 5
 */
export const useVerifyPayment = (receiptNumber: string | null | undefined) => {
  return useQuery<PaymentVerification>({
    queryKey: ["verify-payment", receiptNumber],
    queryFn: async () => {
      if (!receiptNumber || receiptNumber.trim().length === 0) {
        return null; // Empty receipt number is valid (optional field)
      }

      const normalizedReceipt = receiptNumber.trim();

      const { data, error } = await supabase.rpc("verify_payment_by_receipt", {
        p_receipt_number: normalizedReceipt,
      });

      if (error) {
        if (import.meta.env.DEV) {
          console.error("Error verifying payment:", error);
        }
        return null; // Return null on error (payment not found)
      }

      if (!data || data.length === 0) {
        return null; // Payment not found
      }

      const payment = data[0];
      
      return {
        id: payment.id,
        payment_type: payment.payment_type as "deposit" | "instalment",
        amount: Number(payment.amount),
        payment_method: payment.payment_method as "cash" | "card" | "bank_transfer" | "cheque",
        payment_date: payment.payment_date,
        is_linked: payment.is_linked,
        application_id: payment.application_id,
        recorded_by: payment.recorded_by,
        notes: payment.notes,
        created_at: payment.created_at,
      };
    },
    enabled: !!receiptNumber && receiptNumber.trim().length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });
};

