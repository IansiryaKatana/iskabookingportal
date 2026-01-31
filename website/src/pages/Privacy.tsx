import { Link } from "react-router-dom";
import { useSlotUrl } from "@/hooks/useWebsiteImageSlots";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import TypingTitle from "@/components/TypingTitle";
import { ArrowUpRight } from "lucide-react";

const defaultPrivacyHero = "https://images.pexels.com/photos/6593883/pexels-photo-6593883.jpeg?auto=compress&cs=tinysrgb&w=1920";

const Privacy = () => {
  const privacyHeroImage = useSlotUrl("hero_privacy", defaultPrivacyHero) || defaultPrivacyHero;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="flex-1">
        {/* Hero Section – same structure as Contact */}
        <div className="w-full p-[5px] bg-red-50">
          <section
            aria-label="Urban Hub Preston - Privacy policy page hero"
            className="relative flex items-center justify-center rounded-3xl overflow-hidden"
            style={{
              minHeight: "60vh",
              backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.7) 100%), url('${privacyHeroImage}')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="container mx-auto max-w-4xl px-4 text-center text-white space-y-6 py-24">
              <TypingTitle
                as="h1"
                text="PRIVACY POLICY"
                className="text-5xl md:text-6xl lg:text-7xl font-display font-black uppercase leading-tight"
                typingSpeed={32}
              />
              <p className="text-sm md:text-base text-white/90 max-w-2xl mx-auto">
                This privacy notice tells you what to expect us to do with your personal information.
              </p>
              <Button size="sm" className="bg-yellow-400 hover:bg-yellow-500 text-black rounded-full w-fit" asChild>
                <Link to="/" className="flex items-center gap-1.5 justify-center mx-auto">
                  Back to home
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </section>
        </div>

        <section className="py-8 md:py-16 bg-red-50 text-gray-900">
          <div className="container mx-auto px-4 max-w-4xl">
            <article className="prose prose-sm md:prose lg:prose-lg max-w-none space-y-8 md:space-y-12 text-sm md:text-base">
              {/* Data Controller */}
              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  Data Controller
                </h2>
                <p className="font-semibold text-gray-900 uppercase tracking-wide">Urban Hub, registered in England &amp; Wales.</p>
                <p className="text-gray-700">Reg No. 06822434.</p>
                <p className="text-gray-700 uppercase">Registered offices:</p>
                <p className="text-gray-700">
                  Studio 28, Clipper House,<br />
                  33 Trinity Buoy Wharf,<br />
                  London, E14 0FJ.
                </p>
                <p className="text-gray-700 mt-2">
                  Email: <a href="mailto:hello@eden-am.com" className="text-[#ff2020] hover:underline">hello@eden-am.com</a>
                </p>
                <p className="text-gray-700 mt-4">
                  Urban Hub collects and processes personal data relating to homestay hosts (“host families”) and students (or other homestay guests). We are committed to being transparent about how we collect and use that data and to meeting our data protection obligations.
                </p>
              </section>

              {/* What information we collect */}
              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  What information we collect, use, and why
                </h2>
                <p className="text-gray-700 mb-4">
                  We collect or use the following information to:
                </p>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li>Provide and improve products and services for clients</li>
                  <li>Operate client or customer accounts</li>
                  <li>Protect client welfare</li>
                  <li>Deal with queries, complaints, or claims</li>
                  <li>Comply with legal requirements</li>
                </ul>

                <h3 className="text-sm md:text-lg font-display font-black uppercase tracking-wide text-gray-900 mt-4 md:mt-6 mb-1.5 md:mb-2">
                  Homestay hosts (“host families”)
                </h3>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li>Personal information about residents in homestay, including children and frequent visitors</li>
                  <li>Information recorded during home inspections (ID documentation, feedback, accommodation details, photographs)</li>
                  <li>Bank details for payments</li>
                  <li>Changes to your home (e.g., additional bedrooms, guest preferences)</li>
                  <li>Feedback from homestay guests or educational clients</li>
                </ul>

                <h3 className="text-sm md:text-lg font-display font-black uppercase tracking-wide text-gray-900 mt-4 md:mt-6 mb-1.5 md:mb-2">
                  International students / homestay guests
                </h3>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li>Personal information (name, gender, nationality, contact details, purpose of visit, special requirements)</li>
                  <li>Visa information (for students requiring a UK visa)</li>
                </ul>

                <h3 className="text-sm md:text-lg font-display font-black uppercase tracking-wide text-gray-900 mt-4 md:mt-6 mb-1.5 md:mb-2">
                  General
                </h3>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li>Equal opportunities monitoring (ethnic origin, sexual orientation, health, religion)</li>
                  <li>Statistical and analytical data on website visitors (IP addresses, browser types)</li>
                  <li><strong>Cookies:</strong> Our website uses cookies to improve user experience. You can manage cookie settings in your browser.</li>
                </ul>
              </section>

              {/* Why does Urban Hub process personal data */}
              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  Why does Urban Hub process personal data?
                </h2>
                <p className="text-gray-700 mb-4">We process personal data to:</p>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li>Provide our homestay services</li>
                  <li>Match students with host families on behalf of language schools, universities, and international study agents</li>
                  <li>Maintain records and service quality</li>
                  <li>Fulfil legal obligations (e.g., British Council requirements, background checks for hosting minors)</li>
                  <li>Inform you about services, offers, and promotions (with your consent)</li>
                </ul>
                <p className="text-gray-700 mt-4">
                  Our privacy policy does not extend to external websites linked from our site.
                </p>
              </section>

              {/* Lawful bases and data protection rights */}
              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  Lawful bases and data protection rights
                </h2>
                <p className="text-gray-700 mb-4">
                  Under UK GDPR, we rely on the following lawful bases for processing personal data:
                </p>
                <ul className="list-disc pl-6 space-y-2 text-gray-700 mb-6">
                  <li><strong>Consent</strong> – You have given permission after being informed.</li>
                  <li><strong>Legitimate interests</strong> – Processing benefits you, us, or someone else without undue risk.</li>
                  <li><strong>Legal obligations</strong> – Required to meet legal or regulatory obligations.</li>
                </ul>

                <h3 className="text-sm md:text-lg font-display font-black uppercase tracking-wide text-gray-900 mb-1.5 md:mb-2">
                  Your rights under data protection law
                </h3>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li><strong>Right of access</strong> – Request copies of your personal data.</li>
                  <li><strong>Right to rectification</strong> – Ask for inaccurate or incomplete data to be corrected or deleted.</li>
                  <li><strong>Right to erasure</strong> – Request deletion of your personal data.</li>
                  <li><strong>Right to restrict processing</strong> – Limit how we use your data.</li>
                  <li><strong>Right to object</strong> – Object to data processing.</li>
                  <li><strong>Right to data portability</strong> – Request transfer of your data to another entity.</li>
                  <li><strong>Right to withdraw consent</strong> – When processing is based on consent, you can withdraw it at any time.</li>
                </ul>
                <p className="text-gray-700 mt-4">
                  We must respond to your request within one month. Contact us at the email provided above to make a request.
                </p>
              </section>

              {/* Changes of business ownership */}
              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  Changes of business ownership and control
                </h2>
                <p className="text-gray-700 mb-4">
                  Urban Hub may transfer ownership or control, which could involve the transfer of personal data. In such cases:
                </p>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li>Your data will be transferred to the new owner under the terms of this privacy policy.</li>
                  <li>Prospective buyers may be given access to data during negotiations.</li>
                  <li>Measures will be taken to protect your privacy.</li>
                </ul>
              </section>

              {/* Where we get personal information from */}
              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  Where we get personal information from
                </h2>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li>Directly from you (e.g., applications, communications)</li>
                  <li>Legal bodies or professionals (e.g., courts, solicitors)</li>
                  <li>Third parties: Eden Asset Management; Unity Living; Stripe Payment Platform</li>
                </ul>
                <p className="text-gray-700 mt-4">
                  Urban Hub may also collect personal data about you from third parties where necessary (e.g., background checks for host families, student enrolment verification).
                </p>
              </section>

              {/* How we keep information */}
              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  How we keep information
                </h2>
                <p className="text-gray-700 mb-4">
                  We retain personal data only as long as necessary for its intended purpose. Specifically:
                </p>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li><strong>Retention period:</strong> One year from collection, unless legally required or needed for ongoing legal proceedings.</li>
                  <li>Data is stored in application records, internal CRM systems, and IT systems (including email).</li>
                </ul>
              </section>

              {/* Who we share information with */}
              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  Who we share information with
                </h2>
                <p className="text-gray-700 mb-4">
                  We may share your information internally and with third parties to provide our homestay service, including:
                </p>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li>Management team</li>
                  <li>Accommodation officers</li>
                  <li>Administration team</li>
                  <li>Home inspectors</li>
                  <li>Educational clients (language schools, universities, international study agents)</li>
                  <li>Students or other homestay guests</li>
                  <li>British Council inspectors</li>
                  <li>IT staff (for necessary data access)</li>
                  <li>Taxi transfer companies (if student requests a transfer)</li>
                </ul>
                <p className="text-gray-700 mt-4">
                  Urban Hub will not make your data publicly available online or use it for marketing purposes without your prior consent.
                </p>
                <p className="text-gray-700 mt-4">
                  However, we create an online profile for each homestay host, which is searchable via a closed system accessible to:
                </p>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 mt-2 text-sm md:text-base">
                  <li>Urban Hub staff</li>
                  <li>Authorised agents (language schools, universities, study agents, homestay guests)</li>
                </ul>
                <p className="text-gray-700 mt-4">This profile includes:</p>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li>Basic details about the homestay and residents</li>
                  <li>Home photographs (taken by our home inspectors or provided by the host)</li>
                </ul>
                <p className="text-gray-700 mt-4">
                  The system is not publicly accessible without the host’s consent.
                </p>
              </section>
            </article>

            <div className="mt-12 pt-8 border-t border-gray-200">
              <Button className="bg-[#ff2020] text-white hover:bg-[#e01b1b]" asChild>
                <Link to="/contact">Contact us</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
