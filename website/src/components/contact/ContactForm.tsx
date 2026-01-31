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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContactForm, ContactFormData } from "@/hooks/useContactForm";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { isPossiblePhoneNumber } from "libphonenumber-js";

const contactFormSchema = zod.object({
  full_name: zod.string().min(2, "Name must be at least 2 characters"),
  email: zod.string().email("Invalid email address"),
  phone: zod.string().refine((val) => {
    if (!val) return false;
    return isPossiblePhoneNumber(val);
  }, "Invalid phone number for the selected country"),
  form_type: zod.enum(["inquiry", "resident_support"]),
  reason: zod.string().optional(),
  message: zod.string().min(10, "Message must be at least 10 characters").max(100, "Message must not exceed 100 characters"),
});

type ContactFormValues = zod.infer<typeof contactFormSchema>;

interface ContactFormProps {
  onSuccess?: () => void;
}

const inquiryReasons = [
  "General Inquiry",
  "Booking Information",
  "Studio Availability",
  "Pricing & Payment Plans",
  "Amenities & Facilities",
  "Location & Transportation",
  "Other",
];

const residentSupportReasons = [
  "Maintenance Request",
  "Billing Question",
  "Lease Question",
  "Facility Access",
  "Noise Complaint",
  "Other Issue",
];

export const ContactForm = ({ onSuccess }: ContactFormProps) => {
  const { user, profile } = useAuth();
  const { submitContactForm, isSubmitting } = useContactForm();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const formType: "inquiry" | "resident_support" = "inquiry";

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      form_type: "inquiry",
      reason: "",
      message: "",
    },
  });

  // Pre-fill form if user is logged in
  useEffect(() => {
    if (user) {
      form.reset({
        full_name: profile?.first_name ? `${profile.first_name} ${profile.last_name || ""}`.trim() : "",
        email: user.email || "",
        phone: profile?.phone || "",
        form_type: formType,
        reason: "",
        message: "",
      });
    }
  }, [user, profile, form, formType]);

  // Set form type
  useEffect(() => {
    form.setValue("form_type", formType);
  }, [formType, form]);

  const onSubmit = async (values: ContactFormValues) => {
    const payload: ContactFormData = {
      ...values,
      form_type: formType,
    };
    
    try {
      await submitContactForm(payload);
      setIsSubmitted(true);
      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (error) {
      // Error handled in hook
    }
  };

  const messageValue = form.watch("message");
  const characterCount = messageValue?.length || 0;
  const maxCharacters = 100;

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-6">
        <div className="bg-green-100 p-4 rounded-full">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-display font-black uppercase tracking-wide">Message Sent!</h3>
          <p className="text-muted-foreground">
            Thank you for contacting us. We'll get back to you as soon as possible.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl p-8 md:p-10 shadow-sm">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="flex flex-col md:grid md:grid-cols-2 gap-5">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormControl>
                    <Input 
                      placeholder="Your Name" 
                      className="h-12 rounded-lg border-2 border-gray-200 bg-white px-4 text-base placeholder:text-gray-400 focus:border-primary focus:ring-0 focus-visible:ring-0" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-xs mt-1" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormControl>
                    <Input 
                      placeholder="Your Email Address" 
                      type="email" 
                      className="h-12 rounded-lg border-2 border-gray-200 bg-white px-4 text-base placeholder:text-gray-400 focus:border-primary focus:ring-0 focus-visible:ring-0" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage className="text-xs mt-1" />
                </FormItem>
              )}
            />
          </div>

          <div className="flex flex-col md:grid md:grid-cols-2 gap-5">
            <FormField
              control={form.control}
              name="phone"
              render={({ field, fieldState }) => (
                <FormItem className="flex flex-col">
                  <FormControl>
                    <div className={`flex w-full h-12 rounded-lg border-2 bg-white ring-offset-background focus-within:ring-0 focus-within:ring-offset-0 ${fieldState.error ? 'border-destructive' : 'border-gray-200 focus-within:border-primary'}`}>
                      <PhoneInput
                        defaultCountry="gb"
                        value={field.value}
                        onChange={(phone) => field.onChange(phone)}
                        className="flex w-full h-full"
                        inputClassName="!flex !h-full !w-full !border-none !bg-transparent !px-4 !py-0 !text-base !placeholder:text-gray-400 focus:!outline-none disabled:!cursor-not-allowed disabled:!opacity-50 !shadow-none"
                        countrySelectorStyleProps={{
                          buttonClassName: "!h-full !border-none !rounded-l-lg !bg-transparent !px-3 hover:!bg-gray-50",
                        }}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-xs mt-1" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-12 rounded-lg border-2 border-gray-200 bg-white px-4 text-base placeholder:text-gray-400 focus:border-primary focus:ring-0 focus-visible:ring-0">
                        <SelectValue placeholder="Reason For Contacting" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {inquiryReasons.map((reason) => (
                        <SelectItem key={reason} value={reason}>
                          {reason}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs mt-1" />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormControl>
                  <Textarea
                    placeholder="Your Message"
                    className="min-h-[140px] resize-none rounded-lg border-2 border-gray-200 bg-white px-4 py-3 text-base placeholder:text-gray-400 focus:border-primary focus:ring-0 focus-visible:ring-0"
                    maxLength={maxCharacters}
                    {...field}
                  />
                </FormControl>
                <div className="flex justify-between items-center mt-2">
                  <FormMessage className="text-xs" />
                  <span className={`text-xs ${characterCount > maxCharacters * 0.9 ? 'text-destructive' : 'text-gray-400'}`}>
                    {characterCount} / {maxCharacters}
                  </span>
                </div>
              </FormItem>
            )}
          />

          <div className="flex justify-center pt-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              data-analytics="form-contact-submit"
              className="bg-primary hover:bg-primary/90 text-white rounded-full px-10 py-4 h-auto font-semibold text-sm md:text-base uppercase tracking-[0.18em] shadow-lg hover:shadow-xl transition-all duration-200"
            >
              {isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              Send Message
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
