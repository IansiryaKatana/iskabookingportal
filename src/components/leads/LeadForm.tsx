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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeadsCRM, LeadFormData } from "@/hooks/useLeadsCRM";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { isPossiblePhoneNumber } from "libphonenumber-js";

const leadFormSchema = zod.object({
  full_name: zod.string().min(2, "Name must be at least 2 characters"),
  email: zod.string().email("Invalid email address"),
  phone: zod.string().refine((val) => {
    if (!val) return false;
    return isPossiblePhoneNumber(val);
  }, "Invalid phone number for the selected country"),
  preferred_date: zod.string().min(1, "Please select a date"),
  preferred_time: zod.enum(["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"], {
    errorMap: () => ({ message: "Please select a valid time slot" }),
  }),
  studio_type: zod.string().optional(),
  landing_page: zod.string().default("Urbanhub Portal"),
});

type LeadFormValues = zod.infer<typeof leadFormSchema>;

interface LeadFormProps {
  formType: "booking" | "callback";
  onSuccess: () => void;
  onCancel: () => void;
}

export const LeadForm = ({ formType, onSuccess, onCancel }: LeadFormProps) => {
  const { user, profile } = useAuth();
  const { submitToLeadsCRM, isSubmitting } = useLeadsCRM();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const timeSlots = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      preferred_date: "",
      preferred_time: "" as any,
      studio_type: formType === "booking" ? "silver" : undefined,
      landing_page: "Urbanhub Portal",
    },
  });

  // Pre-fill form if user is logged in
  useEffect(() => {
    if (user) {
      form.reset({
        full_name: profile?.first_name ? `${profile.first_name} ${profile.last_name || ""}`.trim() : "",
        email: user.email || "",
        phone: profile?.phone || "",
        preferred_date: "",
        preferred_time: "" as any,
        studio_type: formType === "booking" ? "silver" : undefined,
        landing_page: "Urbanhub Portal",
      });
    }
  }, [user, profile, form, formType]);

  const onSubmit = async (values: LeadFormValues) => {
    const payload: LeadFormData = {
      ...values,
      form_type: formType,
    };
    
    try {
      await submitToLeadsCRM(payload);
      setIsSubmitted(true);
    } catch (error) {
      // Error handled in hook
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center space-y-6">
        <div className="bg-green-100 p-4 rounded-md">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-display font-black uppercase tracking-wide">Request Received!</h3>
          <p className="text-muted-foreground">
            {formType === "booking" 
              ? "Your viewing request has been sent. We'll contact you shortly to confirm the appointment."
              : "Thank you! Our team will give you a call at your preferred time."}
          </p>
        </div>
        <Button 
          onClick={onSuccess}
          className="bg-accent-yellow text-black hover:bg-accent-yellow/90 rounded-md px-8 uppercase tracking-wider text-xs font-semibold"
        >
          Close
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 p-4 md:p-0">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Full Name</FormLabel>
                <FormControl>
                  <Input placeholder="John Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Email Address</FormLabel>
                <FormControl>
                  <Input placeholder="john@example.com" type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field, fieldState }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Phone Number</FormLabel>
                <FormControl>
                  <div className={`flex w-full rounded-md border bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${fieldState.error ? 'border-destructive' : 'border-input'}`}>
                    <PhoneInput
                      defaultCountry="gb"
                      value={field.value}
                      onChange={(phone) => field.onChange(phone)}
                      className="flex w-full"
                      inputClassName="!flex !h-10 !w-full !border-none !bg-transparent !px-3 !py-2 !text-sm !placeholder:text-muted-foreground focus:!outline-none disabled:!cursor-not-allowed disabled:!opacity-50 !shadow-none"
                      countrySelectorStyleProps={{
                        buttonClassName: "!h-10 !border-none !rounded-l-md !bg-transparent !px-3 hover:!bg-accent",
                      }}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {formType === "booking" && (
            <FormField
              control={form.control}
              name="studio_type"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Studio Preference</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select studio type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="silver">Silver Studio</SelectItem>
                      <SelectItem value="gold">Gold Studio</SelectItem>
                      <SelectItem value="platinum">Platinum Studio</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="preferred_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Preferred Date</FormLabel>
                <FormControl>
                  <Input type="date" min={new Date().toISOString().split('T')[0]} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="preferred_time"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Preferred Time</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a time slot" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {timeSlots.map((slot) => (
                      <SelectItem key={slot} value={slot}>
                        {slot}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col-reverse md:flex-row md:justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="w-full md:w-auto rounded-md uppercase tracking-wider text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full md:w-auto bg-accent-yellow text-black hover:bg-accent-yellow/90 rounded-md uppercase tracking-wider text-xs font-semibold"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {formType === "booking" ? "Confirm Booking" : "Request Callback"}
          </Button>
        </div>
      </form>
    </Form>
  );
};
