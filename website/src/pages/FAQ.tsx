import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { useBrandingSettings } from "@/hooks/useBranding";
import { useSlotUrl } from "@/hooks/useWebsiteImageSlots";
import { useFaqsByCategory } from "@/hooks/useFaqs";
import { AnimatedParagraph } from "@/components/animations/AnimatedText";
import TypingTitle from "@/components/TypingTitle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  id: string;
  name: string;
  items: FAQItem[];
}

const faqData: FAQCategory[] = [
  {
    id: "booking-tenancy",
    name: "Booking & Tenancy",
    items: [
      {
        question: "What are the different studio sizes available?",
        answer: "We offer a range of studio sizes to suit your needs:\n\nSilver: 19 – 20 m²\nGold: 22 – 23 m²\nPlatinum: 25 – 26 m²\nRhodium: 28 – 30 m²\nRhodium Plus: 40 – 42 m²",
      },
      {
        question: "Do I have to pay a booking fee?",
        answer: "No, we do not charge a booking fee. However, you may be required to pay a deposit to secure your room, which is refundable under certain conditions.",
      },
      {
        question: "Can I apply for Dual Occupancy?",
        answer: "Dual occupancy is available on most rooms over 23sqm. Both occupants would need to apply and mention in their application that they are applying for dual occupancy so that the price can be amended. The price would be the total rent plus an additional £80 and then divided by two for each occupant's weekly cost unless otherwise stated.",
      },
      {
        question: "What if I want to cancel my booking?",
        answer: "You can cancel your tenancy agreement for up to 7 days after the date of your booking (the Initial Cancellation Period).\n\nWe will refund the security deposit'. An administrative fee of £10 will be deducted from any deposit refunded to UK bank accounts. For refunds made to non-UK bank accounts, an administrative fee plus applicable bank charges, totalling £20, will be deducted from the refund amount.\n\nIf you wish to cancel your tenancy agreement after the initial cancellation period or after your tenancy has started, you will be responsible for paying the rent and any applicable fees for the full tenancy period. However, if you find a replacement tenant who is approved by the landlord and has paid both the deposit and rent, your liability will be limited to the time until the replacement tenant takes over payment. The tenancy termination will only be confirmed once the replacement tenant has completed these payments.\n\nIf a replacement tenant is found, there will be a £50 fee for updating the contract, which you will need to pay within 14 days, or it will be taken from your deposit. Once the new tenancy begins, the landlord will release you from your tenancy agreement.",
      },
      {
        question: "Can I request to move rooms during my tenancy?",
        answer: "Yes, you can request to move rooms. However, this is subject to availability and may incur additional charges. Please reach out to the accommodation team for assistance.",
      },
      {
        question: "Do I have to move out during holidays?",
        answer: "No, you do not have to move out during holidays. Your tenancy agreement covers the full contract period, and you have access to your room throughout the academic year, including holiday periods.",
      },
      {
        question: "Can I move in before my contract starts?",
        answer: "If you wish to arrive earlier than your contract start date, you need to email or call the site office. If early arrival is possible your contract will be adjusted, and you will need to accept it then pay the additional charges prior to arrival. Please note, not all requests can be accommodated.",
      },
      {
        question: "How do you allocate rooms?",
        answer: "When applying for a room you will be asked a series of questions to determine the type of room/flat that you require, along with any special requests you may have. Please note that special requests cannot be guaranteed except where you have disability as defined and covered under the Equality Act 2010. We will attempt to meet your allocation needs as far as practicably possible, should you have a defined disability.\n\nIf you have a disability, medical condition or special request that affects your accommodation requirement please inform us in the additional notes section when completing your application, either online or by paper form.\n\nYou are encouraged to disclose any special requests for your stay such as your preferences regarding culture, religion, sex, gender, etc. to enable us to make an informed decision about your room allocation. Where appropriate, an applicant may be prioritised through the allocation categories as a result of disclosing a disability to us.",
      },
    ],
  },
  {
    id: "payments-rent",
    name: "Payments & Rent",
    items: [
      {
        question: "Do I need a guarantor?",
        answer: "If you wish to pay your rent in instalments, you will need a UK guarantor.",
      },
      {
        question: "Who can be a guarantor?",
        answer: "To be a guarantor you must:\n\n• Be resident in the UK for a minimum of 1 year\n• Be over 21 years of age\n• Be a homeowner or in full time employment\n• Provide a copy of photographic identification, such as a passport, driving licence or ID badge\n• Provide a copy of proof of your UK address which must be less than 3 months old, such as a utility bill (e.g. electricity, water, gas, telephone), a bank statement or a Council Tax bill.",
      },
      {
        question: "When do I pay my rent?",
        answer: "If you have a valid UK Guarantor, you can choose to pay your rent in three instalments, which are due in September, January, and April.\n\nIf you don't have a valid UK Guarantor, you are required to pay the full rent in August, 1 month prior to your contract start date.\n\nPlease note you must have paid the rent due by the time you arrive to check in.\n\nOther instalment options may be available.",
      },
      {
        question: "What's included in my rent?",
        answer: "All utility bills such as electricity, water are included in your rent. Unlimited Wi-fi* is also included. Your TV licence is not included in your rent as this is not classed as a utility and is your responsibility to purchase.\n\nUrban Hub offer a Wi-fi connection at the stated level** included within the rent and there is no additional charge for use of the on-site internet.\n\nFor information on the speed of your internet connection, please ask your Property Team for more information.\n\n** the internet speed is the maximum stated speed available into the property.",
      },
      {
        question: "Can I pay my rent in instalments?",
        answer: "Yes, we offer flexible payment plans, including instalment options. The number of instalments depends on the length of your contract and whether you have a guarantor.",
      },
      {
        question: "What can I do if my student loan has not arrived yet?",
        answer: "You can defer your rent instalments to be in line with your student loan payments if you wish. All requests for deferred payments must be made by 1st August in each academic year to the property team.\n\nYou will be required to provide evidence of your student loan schedule to the property team in order for the payment plan to be set up.\n\nYou will be required to pay two weeks rent 14 days prior to your contract start date, which will be deducted from the balance of your first instalment on the agreed date.\n\nA one-off admin fee of £50 will be charge and payable with the initial 2 week rent payment and this £50 admin fee will not be deducted from the balance of rent due.\n\nPlease note deferring your rent must be pre-arranged and agreed with the property manager prior to your move in date. If no arrangement has been made, rent is due as per your tenancy agreement.",
      },
    ],
  },
  {
    id: "university-admission",
    name: "Admissions & Cancellations",
    items: [
      {
        question: "What do I do if I'm a first-year student and I'm still awaiting my exam results?",
        answer: "If you are still waiting for your exam results and you are not sure whether your place at university is confirmed, do not worry, you can still apply.\n\nIf you are a prospective first year Undergraduate or Postgraduate student and your offer of a place at your preferred University or Higher Education Institute is withdrawn by the University or Higher Education Institute because you do not achieve the required entry grades, you may be eligible to be released from this agreement.\n\nYou must provide written evidence from the University that you do not have a place within 3 days of your results being published (and no later than 28th August, whichever date is sooner) and we will release you from the contract without penalty and refund the deposit paid.\n\nYou may also be eligible to be released from this agreement if you are a prospective first year Undergraduate student and you choose to go to a different University because you have exceeded your expected grades.\n\nTo apply to be released from this agreement in the circumstances referred to above, you will need to supply us with a copy of:\n\n• A written or email confirmation that you wish to cancel your reservation, stating full name and full details of the property booked;\n• A written rejection letter from your chosen university/college or UCAS, a screen shot of your UCAS status which confirms that the required results were not achieved, or a copy of the proof of acceptance of your new university by UCAS adjustment.\n\nThese document(s) must be received by us within 3 calendar days from the date your results are published. On receipt of the required documentation, it will be verified and, provided we are satisfied, we will cancel your agreement and refund your deposit in full.",
      },
      {
        question: "What do I do if I'm a first-year postgraduate student and I'm still awaiting my exam results?",
        answer: "If you are a prospective first year Postgraduate student and your offer of a place at your preferred University or Higher Education Institute is withdrawn by the University or Higher Education Institute because you do not achieve the required entry grades, you may be eligible to be released from this agreement.\n\nYou must provide written evidence from the University that you do not have a place within 3 days of your results being published (and no later than 28th August, whichever date is sooner) and we will release you from the contract without penalty and refund the deposit paid.\n\nTo apply to be released from this agreement, you will need to supply us with a copy of:\n\n• A written or email confirmation that you wish to cancel your reservation, stating full name and full details of the property booked;\n• A written rejection letter from your chosen university/college confirming that the required results were not achieved.\n\nThese document(s) must be received by us within 3 calendar days from the date your results are published. On receipt of the required documentation, it will be verified and, provided we are satisfied, we will cancel your agreement and refund your deposit in full.",
      },
    ],
  },
  {
    id: "accommodation-facilities",
    name: "Accommodation & Facilities",
    items: [
      {
        question: "Does my rental include room cleaning?",
        answer: "No, room cleaning is not included in the rent. However, communal areas may be cleaned regularly. You are responsible for keeping your personal space tidy.",
      },
      {
        question: "What can I bring?",
        answer: "You can bring most of your belongings but some electricals aren't suitable for our properties. Non-UK compliant electricals such as rice cookers are not suitable for use with UK power outlets and this can cause fire risks.",
      },
      {
        question: "Are pets allowed?",
        answer: "No, pets are not allowed in our accommodation, except for registered assistance animals.",
      },
    ],
  },
  {
    id: "policies-regulations",
    name: "Policies & Regulations",
    items: [
      {
        question: "Fraudulent Activity",
        answer: "It is known that people or businesses make bookings of rooms in high demand properties and cities to sell to individuals later, or pay others to make bookings to be resold later. While we do everything we can to stop this fraudulent activity, including requiring ID and university evidence, it is not possible to stop it completely. The individuals and groups conducting this fraudulent activity claim to have legitimate reasons to want to sell their rooms, but subsequently charge high additional fees to the genuine student who wants the room.\n\nStudents should NOT book rooms from private individuals claiming to have special offers or exclusivity of rooms. We manage enquiries, bookings, and organise tenancy takeovers directly. It is highly unlikely a room that becomes unwanted by an individual will be re-let to a student who is introduced to us by that person.\n\nIf in any doubt as to the legitimacy of a room offer, special promotion, or to verify if an individual or business advertising rooms to let is legitimate, you should NOT make any payment to them, and contact the reception team.",
      },
      {
        question: "Recycling",
        answer: "Recycling is one of the best ways for you to have a positive impact on the world in which we live. Recycling is important to both the natural environment and us. We must act fast as the amount of waste we create is increasing all the time.\n\nAt the Urban Hub we want to do our bit to protect the world, and we're sure you want to do your bit too, so to make being eco-friendly easy for you we've provided recycling and refuse bins throughout your accommodation and we encourage all students to use the facilities provided to recycle waste where possible.\n\nYou should make sure that you empty packages completely and give them a quick rinse before you recycle them. Below you can find examples of what you can recycle and what goes in the different bins.\n\nBe aware that if you put things in the wrong bin, it will contaminate the whole waste load which means that we cannot send that waste to be recycled. So, please take an extra couple of seconds to put things in the correct bin so we can help divert as much waste from going to landfill as possible.\n\nAlmost anything made of glass can be recycled, so make sure you put items like glass bottles and jars in the right bin and do not recycle broken glass or light bulbs. Anything that does not feature a recycling label must be put in the refuse bin. Other items that are not recyclable include: batteries, electrical appliances, kitchen waste, polystyrene, foam and sanitary products.",
      },
      {
        question: "Do I need to pay council tax?",
        answer: "Full-time students are exempt from council tax. However, if you are a part-time student or not studying, you may be responsible for council tax payments. Contact your local council for more information.",
      },
      {
        question: "What if I have a complaint?",
        answer: "If you have a complaint this will need to be sent in writing to the property manager who then has 7 working days to respond.",
      },
    ],
  },
];

const FAQ = () => {
  const { data: brandingSettings } = useBrandingSettings();
  const faqCategoriesFromDb = useFaqsByCategory();
  const displayData: FAQCategory[] = faqCategoriesFromDb.length > 0 ? faqCategoriesFromDb : faqData;
  const [activeTab, setActiveTab] = useState(displayData[0]?.id ?? "booking-tenancy");
  const heroSlotUrl = useSlotUrl("hero_faq", brandingSettings?.studio_catalog_hero_image);
  const heroImagePath = heroSlotUrl || "https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp";

  useEffect(() => {
    const firstId = displayData[0]?.id;
    if (firstId && !displayData.some((c) => c.id === activeTab)) {
      setActiveTab(firstId);
    }
  }, [displayData, activeTab]);

  // SEO meta tags are now handled by MetaTagsUpdater using seo_pages table
  // Only add dynamic JSON-LD for FAQPage rich results
  useEffect(() => {
    const faqStructuredData = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": displayData.flatMap((category) =>
        category.items.map((item) => ({
          "@type": "Question",
          "name": item.question,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": item.answer.replace(/\n/g, " ").replace(/\s+/g, " ").trim(),
          },
        }))
      ),
    };

    // Remove existing FAQ structured data script if any
    const existingScript = document.querySelector('script[type="application/ld+json"][data-faq-page]');
    if (existingScript) {
      existingScript.remove();
    }

    // Add new structured data script
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-faq-page", "true");
    script.textContent = JSON.stringify(faqStructuredData);
    document.head.appendChild(script);

    return () => {
      const scriptToRemove = document.querySelector('script[type="application/ld+json"][data-faq-page]');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [displayData]);


  return (
    <div className="min-h-screen bg-background text-white">
      <Navigation />

      {/* Hero Section */}
      <div className="w-full p-[5px] bg-red-50">
        <section
          aria-label="Urban Hub Preston student accommodation - FAQ page hero"
          className="relative flex items-center justify-center rounded-3xl overflow-hidden"
          style={{
            minHeight: "60vh",
            backgroundImage: heroImagePath
              ? `linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.7) 100%), url('${heroImagePath}')`
              : "linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.7) 100%), url('https://urbanhub.uk/wp-content/uploads/2025/05/URBAN-HUB-OUTSIDE-A-3-of-1-scaled-1.webp')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="container mx-auto max-w-4xl px-4 text-center text-white space-y-8 py-24">
            <TypingTitle
              as="h1"
              text="Frequently Asked Questions"
              className="text-5xl md:text-6xl lg:text-7xl font-display font-black uppercase leading-tight"
              typingSpeed={30}
            />
            <AnimatedParagraph delay={0.2} className="text-sm md:text-base text-white/90 max-w-2xl mx-auto">
              We&apos;re here to help with any questions you have about{" "}
              <Link to="/studios" className="underline hover:text-accent-yellow transition-colors">booking</Link>
              , tenancy, pricing, and life at{" "}
              <Link to="/about" className="underline hover:text-accent-yellow transition-colors">Urban Hub</Link>
              . See our{" "}
              <Link to="/reviews" className="underline hover:text-accent-yellow transition-colors">reviews</Link>
              {" "}or{" "}
              <Link to="/contact" className="underline hover:text-accent-yellow transition-colors">contact us</Link>
              {" "}for more.
            </AnimatedParagraph>
          </div>
        </section>
      </div>

      {/* FAQ Content Section */}
      <main className="bg-red-50 py-12 md:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl text-gray-900">
          {/* Category Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="overflow-x-auto mb-8 md:mb-12 scrollbar-hide">
              <TabsList className="inline-flex w-auto h-auto bg-transparent p-0 gap-2 min-w-max">
                {displayData.map((category) => (
                  <TabsTrigger
                    key={category.id}
                    value={category.id}
                    className="text-xs sm:text-sm font-medium bg-white/80 text-gray-800 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-sm py-2 sm:py-3 px-3 sm:px-4 whitespace-nowrap rounded-xl transition-colors hover:bg-white flex-shrink-0"
                  >
                    {category.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* FAQ Accordion for each category */}
            {displayData.map((category) => (
              <TabsContent key={category.id} value={category.id} className="mt-0">
                <Accordion type="single" collapsible className="w-full space-y-3 sm:space-y-4">
                  {category.items.map((item, index) => (
                    <AccordionItem
                      key={index}
                      value={`item-${index}`}
                      className="border-0 rounded-2xl bg-white/90 text-gray-900 overflow-hidden backdrop-blur-sm shadow-sm"
                    >
                      <AccordionTrigger className="text-left font-semibold text-base sm:text-lg py-4 sm:py-5 px-4 sm:px-6 hover:no-underline [&[data-state=open]>svg]:rotate-180 focus:outline-none focus-visible:outline-none focus-visible:ring-0 [&>svg]:bg-gray-200 [&>svg]:rounded-full [&>svg]:p-1.5 [&>svg]:h-6 [&>svg]:w-6 [&>svg]:text-gray-700 [&[data-state=open]>svg]:bg-primary [&[data-state=open]>svg]:text-white">
                        <span className="flex-1 pr-4 text-gray-900">{item.question}</span>
                      </AccordionTrigger>
                      <AccordionContent className="text-gray-700 text-xs sm:text-sm leading-relaxed pb-4 sm:pb-5 pt-0 px-4 sm:px-6 bg-transparent">
                        <div className="whitespace-pre-line">{item.answer}</div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FAQ;
