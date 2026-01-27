import { useMemo, useState, useEffect } from "react";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface StripePaymentFormProps {
  amountPence: number;
  currency?: string;
  onSuccess: () => void;
}

const StripePaymentForm = ({
  amountPence,
  currency = "GBP",
  onSuccess,
}: StripePaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);


  // Wait for Elements to be ready
  useEffect(() => {
    if (elements) {
      // Small delay to ensure PaymentElement is fully mounted
      const timer = setTimeout(() => {
        setIsReady(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [elements]);

  const formattedAmount = useMemo(() => {
    const formatter = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    });
    return formatter.format(amountPence / 100);
  }, [amountPence, currency]);

  const handleSubmit = async () => {
    if (!stripe || !elements || !isReady) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: window.location.href,
        },
      }).catch((err) => {
        // Handle postMessage errors gracefully
        if (err?.message?.includes("message channel") || err?.message?.includes("asynchronous response")) {
          // These are non-critical, try to proceed
          return { error: null, paymentIntent: null };
        }
        throw err;
      });

      if (error) {
        console.error("Payment confirmation error:", error);
        toast.error(error.message ?? "Payment failed. Please try again.");
        setIsProcessing(false);
        return;
      }

      // Verify payment intent status
      if (paymentIntent) {
        if (import.meta.env.DEV) console.log("Payment intent received:", {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          metadata: paymentIntent.metadata,
        });
        
        if (paymentIntent.status === "succeeded") {
          if (import.meta.env.DEV) console.log("Payment succeeded:", paymentIntent.id);
          toast.success("Payment successful!");
          onSuccess(paymentIntent.id);
        } else if (paymentIntent.status === "processing") {
          toast.success("Payment is processing. Please wait...");
          // Wait a bit and check status
          setTimeout(async () => {
            try {
              const retrieved = await stripe.retrievePaymentIntent(paymentIntent.client_secret!);
              if (retrieved.paymentIntent?.status === "succeeded") {
                if (import.meta.env.DEV) console.log("Payment confirmed as succeeded:", retrieved.paymentIntent.id);
                toast.success("Payment successful!");
                onSuccess(retrieved.paymentIntent.id);
              } else {
                console.warn("Payment still processing:", retrieved.paymentIntent?.status);
                toast.error("Payment is still processing. Please refresh the page to check status.");
              }
            } catch (err) {
              console.error("Error checking payment status:", err);
            }
          }, 2000);
        } else {
          console.error("Payment intent status:", paymentIntent.status);
          toast.error(`Payment status: ${paymentIntent.status}. Please try again.`);
        }
      } else {
        // If no paymentIntent returned, the payment might have been redirected
        // In that case, onSuccess will be called after redirect
        console.warn("No payment intent returned from confirmPayment");
        toast.success("Payment processing...");
        onSuccess();
      }
    } catch (error) {
      // Only log actual errors, not postMessage warnings
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("message channel") && !errorMessage.includes("asynchronous response")) {
        console.error("Payment error:", error);
      }
      toast.error("Payment failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!stripe || !elements) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground">Loading payment form...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="min-h-[200px]">
        <PaymentElement 
          onReady={() => setIsReady(true)}
          options={{
            layout: "tabs",
            business: {
              name: "Urban Hub",
            },
            appearance: {
              variables: {
                colorPrimary: "hsl(0, 85%, 45%)",
                colorBackground: "hsl(0, 0%, 100%)",
                colorText: "hsl(0, 0%, 0%)",
                colorDanger: "hsl(0, 84%, 60%)",
                fontFamily: "system-ui, sans-serif",
                spacingUnit: "4px",
                borderRadius: "8px",
              },
              rules: {
                ".Input": {
                  border: "1px solid hsl(0, 0%, 80%)",
                },
              },
            },
          }}
        />
      </div>
      <Button
        type="button"
        className="w-full rounded-full uppercase tracking-wide"
        size="lg"
        disabled={!isReady || isProcessing}
        onClick={handleSubmit}
      >
        {isProcessing ? "Processing…" : `Pay ${formattedAmount}`}
      </Button>
    </div>
  );
};

export default StripePaymentForm;
