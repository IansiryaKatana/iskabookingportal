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
  onSuccess: (paymentIntentId?: string) => void;
  /** Called when Payment Element fails to load (e.g. 400 from Stripe). Parent can clear clientSecret and retry. */
  onLoadError?: () => void;
}

const StripePaymentForm = ({
  amountPence,
  currency = "GBP",
  onSuccess,
  onLoadError,
}: StripePaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);


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
      });

      if (error) {
        console.error("Payment confirmation error:", error);
        toast.error(error.message ?? "Payment failed. Please try again.");
        setIsProcessing(false);
        return;
      }

      const confirmSucceeded = async (intent: { id: string; status: string; client_secret?: string | null }) => {
        if (intent.status === "succeeded") {
          if (import.meta.env.DEV) console.log("Payment succeeded:", intent.id);
          toast.success("Payment successful!");
          onSuccess(intent.id);
          return true;
        }
        return false;
      };

      if (paymentIntent) {
        if (import.meta.env.DEV) console.log("Payment intent received:", {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          metadata: paymentIntent.metadata,
        });

        if (await confirmSucceeded(paymentIntent)) {
          return;
        }

        if (paymentIntent.status === "processing") {
          toast.info("Payment is processing. Verifying with Stripe...");
          for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            try {
              const retrieved = await stripe.retrievePaymentIntent(paymentIntent.client_secret!);
              if (retrieved.paymentIntent && await confirmSucceeded(retrieved.paymentIntent)) {
                return;
              }
            } catch (err) {
              console.error("Error checking payment status:", err);
            }
          }
          toast.error("Payment is still processing. Please wait and refresh before trying again.");
          return;
        }

        console.error("Payment intent status:", paymentIntent.status);
        toast.error(`Payment was not completed (${paymentIntent.status.replaceAll("_", " ")}). Please try again.`);
        return;
      }

      console.warn("No payment intent returned from confirmPayment");
      toast.error("We could not confirm your payment. Please try again.");
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

  const handleLoadError = (event: { elementType?: string; error?: { message?: string } }) => {
    const msg = event?.error?.message ?? "Payment form could not load.";
    console.error("Stripe Payment Element load error:", event?.error);
    setLoadError(msg);
    toast.error(msg + " Please try again or use a different payment method.");
    onLoadError?.();
  };

  if (loadError) {
    return (
      <div className="space-y-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <p className="text-xs text-muted-foreground">
          Close this form and click Pay again to get a fresh payment link. If it keeps failing, check that your Stripe keys (test/live) match.
        </p>
        {onLoadError && (
          <Button type="button" variant="outline" size="sm" onClick={onLoadError}>
            Close and try again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="min-h-[200px]">
        <PaymentElement
          onReady={() => setIsReady(true)}
          onLoadError={handleLoadError}
          options={{
            layout: "tabs",
            business: { name: "Urban Hub" },
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
