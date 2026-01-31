import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useBrandingSettings } from "@/hooks/useBranding";
import { useSlotUrl } from "@/hooks/useWebsiteImageSlots";
import { useShortTermForm, ShortTermFormData } from "@/hooks/useShortTermForm";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, Calendar } from "lucide-react";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { isPossiblePhoneNumber } from "libphonenumber-js";
import { useSearchParams, Link } from "react-router-dom";
import { AnimatedText } from "@/components/animations/AnimatedText";
import TypingTitle from "@/components/TypingTitle";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { ChevronLeft } from "lucide-react";

const shortTermSchema = zod.object({
  full_name: zod.string().min(2, "Name must be at least 2 characters"),
  email: zod.string().email("Invalid email address"),
  phone: zod.string().refine(
    (val) => (val ? isPossiblePhoneNumber(val) : false),
    "Invalid phone number for the selected country"
  ),
  rooms_count: zod.coerce.number().min(1, "At least 1 room").max(20, "Max 20 rooms"),
  start_date: zod.string().min(1, "Please choose start date"),
  end_date: zod.string().min(1, "Please choose end date"),
});

type ShortTermFormValues = zod.infer<typeof shortTermSchema>;

const touristDescriptionParagraph = (
  <>
    No surprise bills. Rooms for every budget. En-suites, studios & shared apartments. Close to everything that matters (UCLan, Aldi, bars, gym). Quiet study zones and party-ready social spaces. Need{" "}
    <Link to="/studios" className="underline hover:text-accent-yellow transition-colors">academic year</Link>{" "}
    stays? See our{" "}
    <Link to="/contact" className="underline hover:text-accent-yellow transition-colors">contact</Link>{" "}
    page.
  </>
);

const keyworkerDescriptionParagraph = (
  <>
    No surprise bills. Rooms for every budget. En-suites, studios & shared apartments. Close to everything that matters (UCLan, Aldi, bars, gym). Quiet study zones and party-ready social spaces.{" "}
    <Link to="/studios" className="underline hover:text-accent-yellow transition-colors">View studios</Link>{" "}
    or{" "}
    <Link to="/faq" className="underline hover:text-accent-yellow transition-colors">FAQ</Link>{" "}
    for more.
  </>
);

interface ShortTermFormSectionProps {
  guestType: "tourist" | "keyworker";
  isSubmitting: boolean;
  onSubmit: (values: ShortTermFormValues) => Promise<void>;
  isSubmitted: boolean;
}

const ShortTermFormSection = ({
  guestType,
  isSubmitting,
  onSubmit,
  isSubmitted,
}: ShortTermFormSectionProps) => {
  const form = useForm<ShortTermFormValues>({
    resolver: zodResolver(shortTermSchema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      rooms_count: 1,
      start_date: "",
      end_date: "",
    },
  });

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center space-y-4">
        <div className="bg-white/20 p-3 rounded-full">
          <CheckCircle2 className="h-10 w-10 text-white" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-display font-black uppercase tracking-wide text-white">
            Request sent
          </h3>
          <p className="text-white/90 text-sm">
            We&apos;ll get back to you soon.
          </p>
        </div>
      </div>
    );
  }

  const fieldSuffix = guestType === "tourist" ? " (Tourists)" : " (Keyworkers)";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="start_date"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="relative h-12">
                    <Input
                      type="date"
                      className={`h-full w-full rounded-xl border-none outline-none ring-0 bg-black/50 focus:bg-black/60 focus-visible:ring-0 pr-10 cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-0 [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:bottom-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer ${!field.value ? "text-transparent" : "text-white"}`}
                      {...field}
                    />
                    {!field.value && (
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/55 text-sm pointer-events-none">
                        Check-in date
                      </span>
                    )}
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white pointer-events-none" aria-hidden />
                  </div>
                </FormControl>
                <FormMessage className="text-white/90 text-xs" />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="end_date"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <div className="relative h-12">
                    <Input
                      type="date"
                      className={`h-full w-full rounded-xl border-none outline-none ring-0 bg-black/50 focus:bg-black/60 focus-visible:ring-0 pr-10 cursor-pointer [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:left-0 [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:right-0 [&::-webkit-calendar-picker-indicator]:bottom-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer ${!field.value ? "text-transparent" : "text-white"}`}
                      {...field}
                    />
                    {!field.value && (
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/55 text-sm pointer-events-none">
                        Check-out date
                      </span>
                    )}
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white pointer-events-none" aria-hidden />
                  </div>
                </FormControl>
                <FormMessage className="text-white/90 text-xs" />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="full_name"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder={`Your Name${fieldSuffix}`}
                  className="h-12 rounded-xl border-none outline-none ring-0 bg-black/50 text-white placeholder:text-white/55 focus:bg-black/60 focus-visible:ring-0"
                  {...field}
                />
              </FormControl>
              <FormMessage className="text-white/90 text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  placeholder={`Your Email Address${fieldSuffix}`}
                  type="email"
                  className="h-12 rounded-xl border-none outline-none ring-0 bg-black/50 text-white placeholder:text-white/55 focus:bg-black/60 focus-visible:ring-0"
                  {...field}
                />
              </FormControl>
              <FormMessage className="text-white/90 text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormControl>
                <div
                  className={`flex w-full h-12 rounded-xl border-none outline-none ring-0 bg-black/50 focus-within:bg-black/60 ${
                    fieldState.error ? "ring-2 ring-destructive" : ""
                  }`}
                >
                  <PhoneInput
                    defaultCountry="gb"
                    value={typeof field.value === "string" ? field.value : ""}
                    onChange={(phone) => field.onChange(phone)}
                    className="flex w-full h-full [&_input]:!bg-transparent [&_input]:!text-white [&_input]:!outline-none [&_input]:placeholder:!text-white/55 [&_.react-international-phone-country-selector-button]:!bg-transparent [&_.react-international-phone-country-selector-button]:!text-white [&_.react-international-phone-country-selector-button]:!border-none"
                    inputClassName="!flex !h-full !w-full !border-none !bg-transparent !px-4 !py-0 !text-white placeholder:!text-white/55 focus:!outline-none focus:!ring-0"
                    countrySelectorStyleProps={{
                      buttonClassName: "!h-full !border-none !rounded-l-xl !bg-transparent !px-3 !text-white hover:!bg-white/10",
                    }}
                  />
                </div>
              </FormControl>
              <FormMessage className="text-white/90 text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="rooms_count"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  placeholder={`How Many Rooms Do You Need?${fieldSuffix}`}
                  className="h-12 rounded-xl border-none outline-none ring-0 bg-black/50 text-white placeholder:text-white/55 focus:bg-black/60 focus-visible:ring-0"
                  {...field}
                />
              </FormControl>
              <FormMessage className="text-white/90 text-xs" />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-12 rounded-lg bg-primary text-white font-semibold text-sm uppercase tracking-wide hover:bg-primary/90"
          data-analytics="form-shortterm-submit"
        >
          {isSubmitting && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          Book your short stay
        </Button>
      </form>
    </Form>
  );
};

type DrawerStep = "choose" | "tourist" | "keyworker";

const ShortTerm = () => {
  const { data: brandingSettings } = useBrandingSettings();
  const heroSlotUrl = useSlotUrl("hero_shortterm", brandingSettings?.studio_catalog_hero_image);
  const heroImagePath = heroSlotUrl || "https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp";
  const { submitShortTermForm, isSubmitting } = useShortTermForm();
  const [submittedTab, setSubmittedTab] = useState<"tourist" | "keyworker" | null>(null);
  const isMobile = useIsMobile();
  const [bookDrawerOpen, setBookDrawerOpen] = useState(false);
  const [drawerStep, setDrawerStep] = useState<DrawerStep>("choose");
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") === "keyworker" ? "keyworker" : "tourist";

  // SEO meta tags are now handled by MetaTagsUpdater using seo_pages table

  const handleDrawerOpenChange = (open: boolean) => {
    setBookDrawerOpen(open);
    if (!open) setDrawerStep("choose");
  };

  const handleSubmit = (guestType: "tourist" | "keyworker") => async (values: ShortTermFormValues) => {
    const payload: ShortTermFormData = {
      ...values,
      guest_type: guestType,
    };
    await submitShortTermForm(payload);
    setSubmittedTab(guestType);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main>
      {/* Hero section: full width, 100px padding except top; left = title, desc, tabs at bottom; right = form at bottom */}
      <section
        aria-label="Urban Hub Preston short-term stays - Book tourist or keyworker accommodation"
        className="relative flex h-screen max-h-screen flex-col overflow-hidden pt-24 md:h-auto md:min-h-screen md:pt-0"
        style={{
          backgroundImage: `linear-gradient(180deg, rgba(5, 6, 9, 0.7) 0%, rgba(5, 6, 9, 0.35) 50%, rgba(5, 6, 9, 0.7) 100%), url('${heroImagePath}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <Tabs defaultValue={tabFromUrl} className="w-full h-full min-h-0 flex flex-col md:min-h-screen">
          <div className="w-full min-h-0 flex-1 overflow-y-auto px-4 py-8 pb-4 md:overflow-visible md:px-[100px] md:pb-[100px] md:pt-0 md:min-h-screen flex flex-col md:flex-row md:items-end md:justify-between gap-8 md:gap-12 pb-36 md:pb-4">
            {/* Left: title, desc, tabs — aligned to very bottom, tabs directly under desc like CTAs; pb-36 on mobile clears the fixed CTA button */}
            <div className="flex-1 flex min-h-0 flex-col justify-end text-white max-w-2xl md:justify-end md:min-h-0">
              <TabsContent value="tourist" className="mt-0 mb-0 outline-none ring-0">
                <AnimatedText delay={0.1}>
                  <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-display font-black uppercase leading-tight text-left">
                    Preston&apos;s Perfect Getaway
                  </h1>
                </AnimatedText>
              </TabsContent>
              <TabsContent value="keyworker" className="mt-0 mb-0 outline-none ring-0">
                <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-display font-black uppercase leading-tight text-left">
                  <TypingTitle
                    as="span"
                    text="Private En-suite Studios "
                    className="inline"
                    typingSpeed={32}
                    showCursor={false}
                  />
                  <br />
                  <TypingTitle
                    as="span"
                    text="for Professionals & Key Workers"
                    className="inline"
                    typingSpeed={32}
                    showCursor={false}
                  />
                </h1>
              </TabsContent>
              <AnimatedText delay={0.2} as="div" className="text-white/90 text-sm md:text-base max-w-lg mt-2 md:mt-3">
                <TabsContent value="tourist" className="mt-0 mb-0 outline-none ring-0">
                  <p className="text-left">{touristDescriptionParagraph}</p>
                </TabsContent>
                <TabsContent value="keyworker" className="mt-0 mb-0 outline-none ring-0">
                  <p className="text-left">{keyworkerDescriptionParagraph}</p>
                </TabsContent>
              </AnimatedText>
              <div className="mt-3 md:mt-4 w-fit hidden md:block">
                <TabsList className="inline-flex h-12 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 p-1 gap-1">
                  <TabsTrigger
                    value="tourist"
                    className="rounded-md text-sm font-semibold uppercase tracking-wide px-6 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=inactive]:text-white/90 data-[state=inactive]:hover:bg-white/10"
                  >
                    Tourist
                  </TabsTrigger>
                  <TabsTrigger
                    value="keyworker"
                    className="rounded-md text-sm font-semibold uppercase tracking-wide px-6 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=inactive]:text-white/90 data-[state=inactive]:hover:bg-white/10"
                  >
                    Keyworker
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            {/* Right: form aligned very bottom */}
            <div className="hidden md:flex w-full md:max-w-[420px] lg:max-w-[440px] flex-shrink-0 md:ml-auto md:self-end">
              <div className="rounded-2xl bg-black/35 backdrop-blur-md border border-white/10 shadow-2xl p-6 md:p-8 w-full">
                <TabsContent value="tourist" className="mt-0">
                  <ShortTermFormSection
                    guestType="tourist"
                    isSubmitting={isSubmitting}
                    onSubmit={handleSubmit("tourist")}
                    isSubmitted={submittedTab === "tourist"}
                  />
                </TabsContent>
                <TabsContent value="keyworker" className="mt-0">
                  <ShortTermFormSection
                    guestType="keyworker"
                    isSubmitting={isSubmitting}
                    onSubmit={handleSubmit("keyworker")}
                    isSubmitted={submittedTab === "keyworker"}
                  />
                </TabsContent>
              </div>
            </div>
          </div>
        </Tabs>

        {/* Mobile: full-width Book your Short Stay Now button */}
        {isMobile && (
          <div className="absolute inset-x-0 bottom-0 px-4 pb-8 pt-4 md:hidden">
            <Button
              onClick={() => setBookDrawerOpen(true)}
              className="w-full h-14 rounded-full bg-primary text-white font-semibold text-base uppercase tracking-wide hover:bg-primary/90"
              data-analytics="short-term-book"
            >
              Book your Short Stay Now
            </Button>
          </div>
        )}
      </section>
      </main>

      {/* Mobile: bottom drawer — choose Tourist or Keyworker, then form */}
      <Drawer open={bookDrawerOpen} onOpenChange={handleDrawerOpenChange}>
        <DrawerContent className="mb-0 rounded-t-2xl rounded-b-none border-t border-x-0 border-b-0 [&>div:first-child]:hidden">
          {drawerStep === "choose" ? (
            <>
              <DrawerHeader className="text-left px-6 pt-8 pb-4">
                <DrawerTitle className="text-xl font-display font-black uppercase tracking-wide">
                  Book your short stay
                </DrawerTitle>
                <p className="text-sm text-muted-foreground mt-1">Choose an option below</p>
              </DrawerHeader>
              <div className="px-6 pb-8 flex flex-col gap-3">
                <Button
                  onClick={() => setDrawerStep("tourist")}
                  variant="outline"
                  className="w-full h-14 rounded-xl text-base font-semibold uppercase"
                  data-analytics="short-term-tourist"
                >
                  Tourist
                </Button>
                <Button
                  onClick={() => setDrawerStep("keyworker")}
                  variant="outline"
                  className="w-full h-14 rounded-xl text-base font-semibold uppercase"
                  data-analytics="short-term-keyworker"
                >
                  Keyworker
                </Button>
              </div>
            </>
          ) : (
            <div className="bg-gray-900 min-h-[70vh] rounded-t-2xl flex flex-col">
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <DrawerClose asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/10 shrink-0"
                    onClick={() => setDrawerStep("choose")}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                </DrawerClose>
                <span className="text-white font-semibold uppercase text-sm">
                  {drawerStep === "tourist" ? "Tourist" : "Keyworker"}
                </span>
              </div>
              <div className="flex-1 overflow-auto px-4 pb-8 pt-2">
                <ShortTermFormSection
                  guestType={drawerStep}
                  isSubmitting={isSubmitting}
                  onSubmit={handleSubmit(drawerStep)}
                  isSubmitted={submittedTab === drawerStep}
                />
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <Footer />
    </div>
  );
};

export default ShortTerm;
