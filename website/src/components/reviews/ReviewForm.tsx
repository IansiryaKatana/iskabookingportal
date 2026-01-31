import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitReview, ReviewFormData } from "@/hooks/useSubmitReview";
import { Loader2, CheckCircle2, Star } from "lucide-react";

const reviewFormSchema = zod.object({
  reviewer_name: zod.string().min(2, "Name must be at least 2 characters"),
  reviewer_email: zod.string().email("Invalid email address"),
  rating: zod.number().min(1, "Please select a rating").max(5, "Please select a rating"),
  title: zod.string().optional(),
  content: zod.string().min(20, "Review must be at least 20 characters").max(1000, "Review must not exceed 1000 characters"),
});

type ReviewFormValues = zod.infer<typeof reviewFormSchema>;

interface ReviewFormProps {
  onSuccess?: () => void;
}

export const ReviewForm = ({ onSuccess }: ReviewFormProps) => {
  const { mutateAsync: submitReview, isPending } = useSubmitReview();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      reviewer_name: "",
      reviewer_email: "",
      rating: 0,
      title: "",
      content: "",
    },
  });

  const onSubmit = async (values: ReviewFormValues) => {
    try {
      const payload: ReviewFormData = {
        reviewer_name: values.reviewer_name,
        reviewer_email: values.reviewer_email,
        rating: values.rating,
        title: values.title || undefined,
        content: values.content,
      };
      await submitReview(payload);
      setSubmitted(true);
      form.reset();
      onSuccess?.();
    } catch {
      // Error handled by mutation
    }
  };

  if (submitted) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Thank you for your review!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Your review has been submitted and will appear once it has been approved by our team.
          </p>
        </div>
        <Button variant="outline" onClick={() => setSubmitted(false)}>
          Add another review
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 rounded-2xl border border-border bg-card p-6 md:p-8">
        <h3 className="text-lg font-semibold">Share your experience</h3>
        <FormField
          control={form.control}
          name="rating"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rating *</FormLabel>
              <FormControl>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => field.onChange(star)}
                      className="p-1 rounded focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                      aria-label={`${star} star${star > 1 ? "s" : ""}`}
                    >
                      <Star
                        className={`h-8 w-8 transition-colors ${
                          star <= field.value ? "fill-primary text-primary" : "text-muted-foreground/40"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reviewer_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. John S." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="reviewer_email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your email *</FormLabel>
              <FormControl>
                <Input type="email" placeholder="your@email.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Review title (optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Great place to live!" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your review *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Tell others about your experience at Urban Hub..."
                  className="min-h-[120px] resize-y"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending} className="w-full sm:w-auto" data-analytics="form-review-submit">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit review
        </Button>
      </form>
    </Form>
  );
};
