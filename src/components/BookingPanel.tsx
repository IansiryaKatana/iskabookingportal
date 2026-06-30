import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import StripePaymentForm from "./StripePaymentForm";

// Load Stripe publishable key from backend (safe to expose)
const BookingPanelStripe = {
  stripePromise: null as any,
};

// Country data with flags and codes
const countries = [
  { name: "United States", code: "+1", flag: "🇺🇸", iso: "US" },
  { name: "United Kingdom", code: "+44", flag: "🇬🇧", iso: "GB" },
  { name: "Afghanistan", code: "+93", flag: "🇦🇫", iso: "AF" },
  { name: "Åland Islands", code: "+358", flag: "🇦🇽", iso: "AX" },
  { name: "Albania", code: "+355", flag: "🇦🇱", iso: "AL" },
  { name: "Algeria", code: "+213", flag: "🇩🇿", iso: "DZ" },
  { name: "American Samoa", code: "+1", flag: "🇦🇸", iso: "AS" },
  { name: "Andorra", code: "+376", flag: "🇦🇩", iso: "AD" },
  { name: "Angola", code: "+244", flag: "🇦🇴", iso: "AO" },
  { name: "Australia", code: "+61", flag: "🇦🇺", iso: "AU" },
  { name: "Austria", code: "+43", flag: "🇦🇹", iso: "AT" },
  { name: "Bangladesh", code: "+880", flag: "🇧🇩", iso: "BD" },
  { name: "Belgium", code: "+32", flag: "🇧🇪", iso: "BE" },
  { name: "Brazil", code: "+55", flag: "🇧🇷", iso: "BR" },
  { name: "Canada", code: "+1", flag: "🇨🇦", iso: "CA" },
  { name: "China", code: "+86", flag: "🇨🇳", iso: "CN" },
  { name: "Denmark", code: "+45", flag: "🇩🇰", iso: "DK" },
  { name: "Egypt", code: "+20", flag: "🇪🇬", iso: "EG" },
  { name: "Finland", code: "+358", flag: "🇫🇮", iso: "FI" },
  { name: "France", code: "+33", flag: "🇫🇷", iso: "FR" },
  { name: "Germany", code: "+49", flag: "🇩🇪", iso: "DE" },
  { name: "Greece", code: "+30", flag: "🇬🇷", iso: "GR" },
  { name: "India", code: "+91", flag: "🇮🇳", iso: "IN" },
  { name: "Ireland", code: "+353", flag: "🇮🇪", iso: "IE" },
  { name: "Italy", code: "+39", flag: "🇮🇹", iso: "IT" },
  { name: "Japan", code: "+81", flag: "🇯🇵", iso: "JP" },
  { name: "Mexico", code: "+52", flag: "🇲🇽", iso: "MX" },
  { name: "Netherlands", code: "+31", flag: "🇳🇱", iso: "NL" },
  { name: "Norway", code: "+47", flag: "🇳🇴", iso: "NO" },
  { name: "Pakistan", code: "+92", flag: "🇵🇰", iso: "PK" },
  { name: "Poland", code: "+48", flag: "🇵🇱", iso: "PL" },
  { name: "Portugal", code: "+351", flag: "🇵🇹", iso: "PT" },
  { name: "Russia", code: "+7", flag: "🇷🇺", iso: "RU" },
  { name: "Spain", code: "+34", flag: "🇪🇸", iso: "ES" },
  { name: "Sweden", code: "+46", flag: "🇸🇪", iso: "SE" },
  { name: "Switzerland", code: "+41", flag: "🇨🇭", iso: "CH" },
  { name: "Turkey", code: "+90", flag: "🇹🇷", iso: "TR" },
  { name: "Argentina", code: "+54", flag: "🇦🇷", iso: "AR" },
  { name: "Chile", code: "+56", flag: "🇨🇱", iso: "CL" },
  { name: "Colombia", code: "+57", flag: "🇨🇴", iso: "CO" },
  { name: "South Africa", code: "+27", flag: "🇿🇦", iso: "ZA" },
  { name: "Nigeria", code: "+234", flag: "🇳🇬", iso: "NG" },
  { name: "Kenya", code: "+254", flag: "🇰🇪", iso: "KE" },
  { name: "Saudi Arabia", code: "+966", flag: "🇸🇦", iso: "SA" },
  { name: "UAE", code: "+971", flag: "🇦🇪", iso: "AE" },
  { name: "Israel", code: "+972", flag: "🇮🇱", iso: "IL" },
  { name: "South Korea", code: "+82", flag: "🇰🇷", iso: "KR" },
  { name: "Thailand", code: "+66", flag: "🇹🇭", iso: "TH" },
  { name: "Vietnam", code: "+84", flag: "🇻🇳", iso: "VN" },
  { name: "Singapore", code: "+65", flag: "🇸🇬", iso: "SG" },
  { name: "Malaysia", code: "+60", flag: "🇲🇾", iso: "MY" },
  { name: "Indonesia", code: "+62", flag: "🇮🇩", iso: "ID" },
  { name: "Philippines", code: "+63", flag: "🇵🇭", iso: "PH" },
  { name: "New Zealand", code: "+64", flag: "🇳🇿", iso: "NZ" },
  { name: "Czech Republic", code: "+420", flag: "🇨🇿", iso: "CZ" },
];

const BookingPanel = () => {
  const [openWeeks45, setOpenWeeks45] = useState(false);
  const [openWeeks51, setOpenWeeks51] = useState(false);
  const [openCustom, setOpenCustom] = useState(false);
  const [referredByResident, setReferredByResident] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(countries[1]); // Default to UK
  const [phoneNumber, setPhoneNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [stayDuration, setStayDuration] = useState("");
  const [paymentPlan, setPaymentPlan] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  useEffect(() => {
    const updatePanelDimensions = () => {
      const panel = document.getElementById('booking-panel');
      if (panel) {
        const rect = panel.getBoundingClientRect();
        document.documentElement.style.setProperty('--booking-panel-width', `${rect.width}px`);
        document.documentElement.style.setProperty('--booking-panel-height', `${rect.height}px`);
      }
    };
    
    updatePanelDimensions();
    window.addEventListener('resize', updatePanelDimensions);
    return () => window.removeEventListener('resize', updatePanelDimensions);
  }, []);

  // Fetch Stripe publishable key and create PaymentIntent on mount
  useEffect(() => {
    const initStripeAndIntent = async () => {
      try {
        // 1) Get publishable key
        const keyRes = await supabase.functions.invoke('get-publishable-key');
        if (keyRes.error || !keyRes.data?.publishableKey) {
          console.error('Failed to load Stripe publishable key', keyRes.error);
          return;
        }
        BookingPanelStripe.stripePromise = loadStripe(keyRes.data.publishableKey);

        // 2) Create payment intent
        const { data, error } = await supabase.functions.invoke("create-payment", {
          body: {
            fullName: "Temporary User",
            email: "temp@example.com",
            phoneNumber: "+440000000000",
            stayDuration: "45",
            paymentPlan: "3",
          },
        });
        if (error) {
          console.error("Error creating payment intent:", error);
          return;
        }
        if (data?.clientSecret) {
          setClientSecret(data.clientSecret);
        }
      } catch (e) {
        console.error('Init error:', e);
      }
    };
    initStripeAndIntent();
  }, []);

  const handlePaymentSuccess = () => {
    toast.success("Payment successful! We'll contact you shortly.");
    setClientSecret("");
    setFullName("");
    setEmail("");
    setPhoneNumber("");
    setStayDuration("");
    setPaymentPlan("");
    setReferredByResident(false);
  };

  return (
    <Card className="sticky top-24" id="booking-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-2xl md:text-3xl font-display font-black uppercase"
            tooltip={
              <>
                A <strong>fixed deposit</strong> of <strong>£99</strong> will be required. After making your deposit, you will need to complete a{" "}
                <strong>Booking Journey Form</strong> with your personal and relevant documents for review and verification. Then you&apos;ll pay the balance on the payment plan you wish to be on.
              </>
            }
            tooltipLabel="About Tenancy Duration"
          >
            TENANCY DURATION
          </CardTitle>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Info className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="lg:!absolute lg:!top-0 lg:!left-0 lg:!transform-none lg:!translate-x-0 lg:!translate-y-0 max-w-full lg:max-w-[var(--booking-panel-width)] lg:h-[var(--booking-panel-height)] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-2xl font-display font-black uppercase">
                    BOOKING DETAILS
                  </DialogTitle>
                </div>
              </DialogHeader>
              
              <div className="space-y-4 mt-4">
                <CardDescription>
                  A <strong>fixed deposit</strong> of <strong>£99</strong> will be required. After making your deposit, you will need to complete a{" "}
                  <strong>Booking Journey Form</strong> with your personal and relevant documents for review and verification. Then you'll pay the balance on the payment plan you wish to be on.
                </CardDescription>

                <Collapsible open={openWeeks45} onOpenChange={setOpenWeeks45}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between w-full p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <span className="font-semibold">45 Weeks</span>
                      {openWeeks45 ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 p-4 border rounded-lg bg-muted/20">
                    <div className="space-y-2">
                      <p className="text-3xl font-bold text-primary">£7200</p>
                      <p className="text-sm text-muted-foreground">6th September to 18th July 2026</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={openWeeks51} onOpenChange={setOpenWeeks51}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between w-full p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <span className="font-semibold">51 Weeks</span>
                      {openWeeks51 ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 p-4 border rounded-lg bg-muted/20">
                    <div className="space-y-2">
                      <p className="text-3xl font-bold text-primary">£8160</p>
                      <p className="text-sm text-muted-foreground">6th September to 29th August 2026</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={openCustom} onOpenChange={setOpenCustom}>
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between w-full p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <span className="font-semibold">Customizable Period</span>
                      {openCustom ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 p-4 border rounded-lg bg-muted/20">
                    <p className="text-sm text-muted-foreground">
                      The total amount depends on your preferred duration of stay. Please fill out the form, and our team will get in touch to discuss a suitable rate.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input 
            id="fullname" 
            placeholder="Full Names" 
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          
          <Popover open={countryOpen} onOpenChange={setCountryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={countryOpen}
                className="w-full justify-start h-10 px-3 font-normal"
              >
                <span className="text-base mr-2">{selectedCountry.flag}</span>
                <span className="mr-2 font-normal">{selectedCountry.code}</span>
                <Input
                  placeholder="Phone Number"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="flex-1 border-0 bg-transparent p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search country..." />
                <CommandList>
                  <CommandEmpty>No country found.</CommandEmpty>
                  <CommandGroup>
                    {countries.map((country) => (
                      <CommandItem
                        key={country.iso}
                        value={`${country.name} ${country.code}`}
                        onSelect={() => {
                          setSelectedCountry(country);
                          setCountryOpen(false);
                        }}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <span className="text-base">{country.flag}</span>
                        <span className="flex-1">{country.name}</span>
                        <span className="text-muted-foreground text-sm">{country.code}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Input 
            id="email" 
            type="email" 
            placeholder="Email Address" 
            className="md:col-span-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <Select value={stayDuration} onValueChange={setStayDuration}>
            <SelectTrigger id="duration">
              <SelectValue placeholder="Stay Duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="45">45 Weeks</SelectItem>
              <SelectItem value="51">51 Weeks</SelectItem>
            </SelectContent>
          </Select>

          <Select value={paymentPlan} onValueChange={setPaymentPlan}>
            <SelectTrigger id="payment-plan">
              <SelectValue placeholder="Payment Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 Installments</SelectItem>
              <SelectItem value="4">4 Installments</SelectItem>
              <SelectItem value="10">10 Installments</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-start space-x-2 pt-2">
          <Checkbox 
            id="terms" 
            checked={referredByResident}
            onCheckedChange={(checked) => setReferredByResident(checked as boolean)}
          />
          <Label htmlFor="terms" className="text-[9px] leading-tight cursor-pointer">
            Referred by a resident? I agree to <a href="#" className="text-primary underline">Terms & Conditions</a>
          </Label>
        </div>

        <div className="space-y-4 pt-4">
          {clientSecret && BookingPanelStripe.stripePromise ? (
            <Elements stripe={BookingPanelStripe.stripePromise} options={{ clientSecret }}>
              <StripePaymentForm
                amountPence={9900}
                currency="GBP"
                onSuccess={handlePaymentSuccess}
                onLoadError={() => setClientSecret("")}
              />
            </Elements>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Loading payment form...</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default BookingPanel;
