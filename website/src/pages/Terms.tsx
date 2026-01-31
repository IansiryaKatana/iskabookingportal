import { Link } from "react-router-dom";
import { useSlotUrl } from "@/hooks/useWebsiteImageSlots";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import TypingTitle from "@/components/TypingTitle";
import { ArrowUpRight } from "lucide-react";

const defaultTermsHero = "https://images.pexels.com/photos/6593883/pexels-photo-6593883.jpeg?auto=compress&cs=tinysrgb&w=1920";

const Terms = () => {
  const termsHeroImage = useSlotUrl("hero_terms", defaultTermsHero) || defaultTermsHero;
  // SEO meta tags are now handled by MetaTagsUpdater using seo_pages table

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="flex-1">
        <div className="w-full p-[5px] bg-red-50">
          <section
            aria-label="Urban Hub Preston - Terms and conditions page hero"
            className="relative flex items-center justify-center rounded-3xl overflow-hidden"
            style={{
              minHeight: "60vh",
              backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.5) 50%, rgba(0, 0, 0, 0.7) 100%), url('${termsHeroImage}')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="container mx-auto max-w-4xl px-4 text-center text-white space-y-6 py-24">
              <TypingTitle
                as="h1"
                text="TERMS & CONDITIONS"
                className="text-5xl md:text-6xl lg:text-7xl font-display font-black uppercase leading-tight"
                typingSpeed={32}
              />
              <p className="text-sm md:text-base text-white/90 max-w-2xl mx-auto">
                Tenancy agreement terms and conditions for your stay at Urban Hub.
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
          <div className="w-full max-w-[1280px] mx-auto px-4 md:px-6 lg:px-8">
            <article className="prose prose-sm md:prose lg:prose-lg !max-w-none w-full space-y-8 md:space-y-12 text-sm md:text-base">
              <section>
                <p className="text-gray-700 font-medium">
                  These tenancy agreement terms and conditions, together with the booking details above, set out the terms and conditions of the tenancy agreement under which we rent the room in the property for the length of stay (as set out in the booking details) to you.
                </p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  1 Definitions and interpretation
                </h2>
                <h3 className="text-sm md:text-lg font-display font-black uppercase tracking-wide text-gray-900 mt-4 md:mt-6 mb-1.5 md:mb-2">
                  1.1
                </h3>
                <p className="text-gray-700 mb-4">In these tenancy terms and conditions:</p>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base">
                  <li><strong>“Agent”</strong> means Unity Livin, a part of Eden Asset Management Ltd (company number 11345592), acting on behalf of the Landlord.</li>
                  <li><strong>“Booking Details”</strong> means the details provided during the online booking process on the Urban Hub website or specified in an offline Tenancy Agreement.</li>
                  <li><strong>“Contents”</strong> means the furnishings, fixtures and fittings in the Room or Flat Common Areas as listed on the inventory to be provided to you on moving-in to the Room.</li>
                  <li><strong>“Flat”</strong> means the flat (if any) referred to in the Booking Details, including its Contents, but excluding the Service Media in the Flat.</li>
                  <li><strong>“Flat Common Areas”</strong> means the Flat, other than the Room and any other rooms within the Flat (to be occupied exclusively by other tenants of the Flat).</li>
                  <li><strong>“Landlord”</strong> means Urban Hub Village Ltd (company number 14632941), as referred to in the Booking Details.</li>
                  <li><strong>“Length of Stay”</strong> means the length of stay as specified in the Booking Details being the period from and including the Check In Date and ending on and including the Check Out Date as specified in the Booking Details.</li>
                  <li><strong>“Housing Act 1988”</strong> means the Housing Act 1988 (as amended by the Housing Act 1996 or otherwise).</li>
                  <li><strong>“Payment Schedule”</strong> means the Payment Schedule Breakdown in the Booking Details setting out the amounts and the dates on which payments must be made.</li>
                  <li><strong>“Property”</strong> means the building identified in the Booking Details where the Room, Flat, Flat Common Areas and the Property Common Areas are situated.</li>
                  <li><strong>“Property Common Areas”</strong> means the entrance hall, stairs, corridors, laundry, courtyard, lifts, bicycle store (where applicable) and any other common areas in the Property provided for the benefit of all tenants.</li>
                  <li><strong>“Regulations”</strong> means such regulations as we may make pursuant to clause 4.1.5 for the purpose of ensuring the safety, security, cleanliness and good management of the Property, any part of it, or the comfort or convenience of the tenants of rooms or flats in the Property, or the efficient or economical performance by us of our obligations under the Tenancy Agreement.</li>
                  <li><strong>“Rent”</strong> means the amount stated as the Payment total in the Booking Details.</li>
                  <li><strong>“Room”</strong> means the Room as referred to in the Booking Details including its Contents, but excluding the Service Media within the Room.</li>
                  <li><strong>“Service Media”</strong> means central heating and hot water systems, electrical services for power and lighting, drainage and water services, and any data or phone services provided.</li>
                  <li><strong>“Special Conditions”</strong> means the Special Conditions referred to in the Booking Details.</li>
                  <li><strong>“Tenancy Agreement”</strong> means the tenancy agreement constituted by the Booking Details together with these Tenancy Terms and Conditions.</li>
                </ul>
                <p className="text-gray-700 mt-4">1.2 Unless set out to the contrary in these Tenancy Terms and Conditions, all terms defined in the Booking Details shall have the same meanings in these Tenancy Terms and Conditions.</p>
                <p className="text-gray-700">1.3 The expression “Landlord” includes successors in title and any other person who at any particular time has the right to receive rent under the Tenancy Agreement.</p>
                <p className="text-gray-700">1.4 When used in these Tenancy Terms and Conditions, the expressions “us” “we” and “our” shall be taken as references to the Landlord and the expressions “you” and “your” shall be taken as references to the Tenant.</p>
                <p className="text-gray-700">1.5 Any obligation on us or you not to do any act or thing is also an obligation to take all reasonable steps not to permit or suffer any other person to do any such act or thing.</p>
                <p className="text-gray-700">1.6 If any party to this Tenancy Agreement comprises two or more persons, all obligations and liabilities of each party are joint and several. This means that where, for example, the Tenant is more than one person, each person will be liable for all sums due under the Tenancy Agreement and not just liable for a proportionate part.</p>
                <p className="text-gray-700">1.7 Headings used in these Tenancy Terms and Conditions are for convenience only and are not to be considered in interpreting the Tenancy Agreement.</p>
                <p className="text-gray-700">1.8 The Tenancy Agreement is an Assured Shorthold Tenancy as defined by sections 19A and 20 of the Housing Act 1988 and the provisions for the recovery of possession by us in the Housing Act 1988 apply to the Tenancy Agreement.</p>
                <p className="text-gray-700">1.9 Subject to clause 1.10, if when this Tenancy Agreement is completed you are under 18 years of age, the Tenancy Agreement will as a matter of law take effect as a licence to occupy until such date as you become 18.</p>
                <p className="text-gray-700">1.10 You must be aged 17 or over before signing this Tenancy Agreement.</p>
                <p className="text-gray-700">1.11 If you are aged 17 or over but under 18 years of age, you must notify us at least 4 weeks in advance of the Check In Date of any reasonable adjustments in connection with your occupation of the Room which you wish to request. We shall be under no obligation to make any adjustments, but will act reasonably in considering your request.</p>
                <p className="text-gray-700">1.12 A reference to written or writing includes e-mail.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  2 The letting
                </h2>
                <p className="text-gray-700">2.1 We let the Room to you for the Length of Stay subject to the Booking Details and these Tenancy Terms and Conditions.</p>
                <p className="text-gray-700 mt-2">2.2 You are granted the following rights for the benefit of the Room in common with us and all other tenants of the Property (including all other persons from time to time duly authorised by us):</p>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base mt-2">
                  <li><strong>2.2.1</strong> the right to use the Property Common Areas and the Flat Common Areas, including the right to come and go to and from the Room over such of the Property Common Areas as are designed or designated to allow access; and</li>
                  <li><strong>2.2.2</strong> the right to use the shared facilities within the Flat Common Areas.</li>
                </ul>
                <p className="text-gray-700 mt-4">2.3 We also reserve for ourselves and all those authorised by us the right to the free passage and running of water, soil, gas and electricity through any pipes, cables, wires, drains or sewers passing in or through the Room and the Flat.</p>
                <p className="text-gray-700 mt-2">2.4 The following are conditions of this Tenancy Agreement:</p>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base mt-2">
                  <li>2.4.1 you remaining a student in full time education throughout the Length of Stay;</li>
                  <li>2.4.2 that you are not in breach of any previous tenancy with us;</li>
                  <li>2.4.3 you have no unspent criminal convictions; and</li>
                  <li>2.4.4 you are not committing any act of fraud or otherwise acting in an illegal way in entering into this Tenancy Agreement or in making any payments due under this Tenancy.</li>
                </ul>
                <p className="text-gray-700 mt-2">If you breach any of these conditions you will be in breach of this Tenancy Agreement. Being in breach of the tenancy does not allow you to terminate or avoid liability for any breaches of this Tenancy Agreement.</p>
                <p className="text-gray-700 mt-2">2.5 If we reasonably believe that you have breached this Tenancy Agreement, we reserve the right to (and you expressly consent that we may) inform your Guarantor, the academic establishment at which you are studying and any other relevant authorities of the circumstances of your breach.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  3 Our obligations
                </h2>
                <p className="text-gray-700">3.1 We agree with you that you may possess and enjoy the Room during the Length of Stay without any interruption from us or any person acting on our behalf (but if you breach this Tenancy Agreement by failing to pay the Rent or other payments included in the Payment Schedule and/or fail to perform any of your obligations under the Tenancy Agreement, then we reserve the right to seek redress via the Court’s which may result in you losing your right to possess the Room in accordance with clauses 11.1, 11.2 and 11.3 below) and we will:</p>
                <ul className="list-disc pl-5 md:pl-6 space-y-1.5 md:space-y-2 text-gray-700 text-sm md:text-base mt-2">
                  <li>3.1.1 maintain and repair the structure of the Property including the window frames and window glass;</li>
                  <li>3.1.2 maintain, repair, decorate and provide adequate heating and lighting to the Property Common Areas and the Flat Common Areas;</li>
                  <li>3.1.3 clean the Property Common Areas;</li>
                  <li>3.1.4 maintain all Service Media serving the Flat, the Property Common Areas and the Flat Common Areas;</li>
                  <li>3.1.5 provide a supply of hot and cold water, heating and electrical power to the Flat;</li>
                  <li>3.1.6 provide security facilities for the Property; and</li>
                  <li>3.1.7 provide and maintain such equipment as we think fit in the Property Common Areas and the Flat Common Areas.</li>
                </ul>
                <p className="text-gray-700 mt-4">3.2 We reserve the right during the Length of Stay to offer you alternative accommodation (which may be in a hotel) for the purpose of carrying out emergency repairs to the Room and/or the Flat and/or the Property or if we consider it necessary or desirable for any reason, to avoid difficulties between tenants or for the better management of the Property, provided that: you are given reasonable notice (except in emergency); the alternative accommodation is of substantially no lesser standard than your Room/Flat; you will occupy the alternative accommodation on the same terms as those of the Tenancy Agreement, including the Rent payable; and you are in agreement to accept the alternative accommodation which is offered (and in the absence of your agreement, we shall be required to obtain permission from a Court in advance of any such move being enforceable).</p>
                <p className="text-gray-700 mt-2">3.3 Subject to clause 4.5.2 below, we will accept delivery of your parcels and mail in accordance with our Parcel Delivery Service Terms and Conditions (as published on the <a href="https://www.urbanhub.uk/post-and-parcel-terms" target="_blank" rel="noopener noreferrer" className="text-[#ff2020] hover:underline">Urban Hub post and parcel terms</a> website), which you accept by entering into this Tenancy Agreement unless you let us know otherwise in accordance with clause 16. If you do not accept the Parcel Delivery Service Terms and Conditions we will not accept delivery of parcels and mail addressed to you.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  4 Your general obligations
                </h2>
                <p className="text-gray-700">4.1 You agree to: accept the Room, Flat, Property Common Areas, Flat Common Areas and the Property as being in good and tenantable repair and condition and fit for the purposes for which they are let and/or intended to be used from the Start Date unless you let us know in writing in accordance with clause 16 of any defects in the condition and repair within 48 hours of you collecting the keys for the Room; accept that all the Contents are present in the Room and Flat unless you let us know in writing in accordance with clause 16 that items are missing from the inventory within 48 hours of moving into the Room; provide us with a certificate of exemption for council tax within 6 weeks of registering with your university or college or 10 weeks of your Check In Date (whichever is the sooner)—in any cases where we as Landlord become liable to the local authority for any council tax payments, you will reimburse us for any council tax we are required to pay; comply with any Special Conditions; comply with any Regulations relating to your conduct in the Property which we may notify you of in writing from time to time (if there is any conflict between these Tenancy Terms and Conditions and those Regulations, these Tenancy Terms and Conditions will apply); pay for the actual costs of replacement and any other expenses reasonably incurred by us, as a result of the loss by you of a key or the fob (or other access device); pay to us in full the Rent and all other payments on the dates set out in the Booking Details (you will not off-set any amounts against the Rent or any other amounts due; we are not required to send reminders about payment due dates); pay any reasonable costs and expenses (which must be reasonable both in amount and in nature) which we have properly incurred, where you have not carried out your obligations under the Tenancy Agreement—we are within our rights to recover any of these amounts from your deposit and/or via any claims against you (or your guarantor) via the Courts; and allow us and all those authorised by us to enter the Room and the Flat on reasonable written notice of not less than 24 hours (except where, in our reasonable belief, we consider that there is an emergency and/or that an unlawful activity is or may be occurring within the Room or the Flat which is placing any person at risk of harm, when no notice will be given), for any necessary purpose, including but not limited to: viewings with prospective tenants; to inspect the condition and state of repair of the room or flat; to carry out the Landlord’s repairing obligations and other obligations under this agreement; to carry out any inspections required by law including (but not limited to) fire safety inspections; and to carry out any works, repairs, maintenance or installations required by law or any work associated with any necessary improvement or refurbishment work.</p>
                <p className="text-gray-700 mt-4">4.2 If you are in debt to us, you agree that any payments we receive from you will be allocated to the oldest debt first, which will include any sum that you still owe under any former tenancy agreement with us.</p>
                <p className="text-gray-700 mt-2">4.3 Anybody who makes payments on your behalf towards Rent or other amounts due from you under this Tenancy Agreement does so as your agent. In such circumstances you will remain liable for the payment of all sums under this Tenancy Agreement and all our rights and remedies against you remain fully preserved. Where applicable, funds will only be returned to you (not anyone else) following the end of the Length of Stay, except for any deposit (if a deposit has been paid and is detailed in the Booking Details) which (if there is no claim to it under the Tenancy Terms and Conditions) will be refunded to the person who originally paid it (unless this is no longer possible and in which case payment will be made to you).</p>
                <p className="text-gray-700 mt-2">4.4 If payment of the Rent due from you under this Tenancy Agreement is late by more than 14 days, you will pay interest at the rate of 3% per annum above the Bank of England base rate on the outstanding amount from the date payment was due until the payment is made in full. Interest will be calculated on a daily basis.</p>
                <p className="text-gray-700 mt-2">4.5 If payment of the Rent or any other money due from you under this Tenancy Agreement is late we reserve the right to: (4.5.1) remove internet access whilst your account is in arrears; (4.5.2) cease to accept delivery of your parcels and mail under clause 3.3 whilst your account is in arrears; (4.5.3) refer your account to a debt collection agency in order to recover outstanding Rent or other monies unpaid by you; and/or (4.5.4) enter the Flat Common Areas (in accordance with clause 4.1.9) to discuss arrears.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  5 Your obligations to maintain the room and flat
                </h2>
                <p className="text-gray-700">5.1 You agree that you will: maintain the Room, its Contents and, with the other tenants of the Flat, the Flat Common Areas in at least as good repair, condition and decorative order and level of cleanliness as they are in at the Check In Date (except for damage by accidental fire and water from the Service Media and fair wear and tear)—the inventory we provide you on moving in to the Room shall be evidence of the Contents’ existing condition, and any defect shall be noted on the inventory referred to in clause 4.1.2; not remove any of the Contents from the Room or Flat and notify us as soon as possible of any damage in the Room and/or the Contents and/or the Flat and/or the Property; and operate the Service Media and electrical appliances in the Flat in accordance with the manufacturer’s instructions and not change, damage, alter or interfere with them and ensure that any electrical appliances which are not supplied by us comply with all relevant standards and regulations.</p>
                <p className="text-gray-700 mt-4">5.2 You also agree to pay us a fair and reasonable proportion of any costs we incur in repairing any damage to the Room or the Flat or the Contents (including replacement items where this is necessary). These costs shall be apportioned: (5.2.1) as if you caused the damage to the Room (or the Contents of the Room); and (5.2.2) on the basis of the best available evidence in relation to the damage to the Flat (or the shared facilities or Contents in the Flat Common Areas).</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  6 Your conduct obligations
                </h2>
                <p className="text-gray-700">6.1 You agree that you will occupy the Room/Flat for personal residential purposes only and that you will not: (6.1.1) sublet the Room/Flat or share occupation of the Room/Flat; or (6.1.2) carry out any profession, trade or business in the Room or the Flat.</p>
                <p className="text-gray-700 mt-2">6.2 You also agree that you will not use the Room, the Flat or the Property for any improper, immoral or illegal purpose nor use the Property or act in any way which may, in our reasonable opinion, cause a nuisance, damage or annoyance to the other tenants of the Property, or neighbours, or any other person. In particular, you will not: smoke in the Property (including E-cigarettes); cause any noise which, if made within the Room, can be heard outside the Room or, if made within the Flat Common Areas can be heard outside the Flat Common Areas and which causes any disturbance to others; keep or use illegal drugs or psychoactive substances; keep or use any firearms, knives (other than kitchen knives), or any other weapons; harass, threaten or assault any other tenants, their guests, our employees or any other person; tamper with our fire prevention systems and control equipment (including not maliciously, recklessly or negligently activating such fire prevention systems); use designated fire escapes except for the purposes of emergency escape; keep, store or use any gas or oil heater or other fuel burning appliance in the Property, including candles and any other flame lit device; keep any animal, bird, insect or reptile; or erect any external wireless or television aerial or satellite dish at the Property or hang clothes or fabrics out of the windows or doors of the Property.</p>
                <p className="text-gray-700 mt-2">6.3 If you have any guests or visitors to the Property you will: be responsible for the conduct of guests/visitors; make sure that any guests/visitors you may have to the Property comply with the provisions of this Clause 6; and notify us in advance should you have any visitors to the Room or the Flat who may require assistance should it be necessary to evacuate the Property.</p>
                <p className="text-gray-700 mt-2">6.4 You should note that tampering with fire prevention/life-saving equipment including, but not restricted to, fire extinguishers, fire doors and smoke detectors, is a criminal offence (punishable by a fine and/or imprisonment) and it will be treated as a serious breach of this Tenancy Agreement.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  7 Transfer of tenancy
                </h2>
                <p className="text-gray-700">7.1 You agree that you will not transfer the tenancy created by the Tenancy Agreement to anyone else. If you wish to end your tenancy early and have found a replacement tenant for the Room we will, acting reasonably, consider terminating your tenancy and entering into a replacement tenancy with the new occupier, subject to the following conditions: the replacement tenant must provide a guarantor of his/her own in respect of their obligations under the replacement tenancy agreement; the replacement tenant and their guarantor shall enter into a new tenancy agreement with us in similar terms as are contained in this Tenancy Agreement and which commences on the same date that your tenancy is terminated; and you will pay any arrears before we agree to terminate your tenancy.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  8 When you leave
                </h2>
                <p className="text-gray-700">8.1 You agree to: remove all your belongings (including rubbish) from the Property and return your key to the Room/Flat/Property to us at the end of the Tenancy Agreement no later than 10am on the date the Tenancy Agreement ends; pay all outstanding costs in accordance with clause 4.1.8; and if you leave before the end of the Length of Stay you will on request confirm in writing your intention to surrender (end early) your tenancy with us which, subject to the provisions of this clause 8, we will accept.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  9 Your deposit (if applicable)
                </h2>
                <p className="text-gray-700 italic">The provisions of this clause 9 shall only apply if your Booking Details state that a Deposit is payable.</p>
                <p className="text-gray-700 mt-2">9.1 In this clause 9, “Deposit” means the deposit for the amount stated in the Booking Details and which will be used as security for the performance of your obligations as specified in the Tenancy Agreement.</p>
                <p className="text-gray-700 mt-2">9.2 You agree and acknowledge that the Deposit paid to us by you is paid to us as security for the performance of your obligations under the Tenancy Agreement.</p>
                <p className="text-gray-700 mt-2">9.3 At the end of the Length of Stay, you will be given the opportunity to attend a check-out inspection with one of our representatives with a view to reaching agreement as to what, if any, deductions we will be entitled to make from the Deposit. However, we reserve the right to give you notice of our intention to draw on the Deposit at any time in payment of any sums due from or spent on behalf of you under the Tenancy Agreement. Where applicable, the Deposit, or the relevant amount of the Deposit will be refunded to the person who originally paid it (unless this is no longer possible in which case payment will be made to you).</p>
                <p className="text-gray-700 mt-2">9.4 For the avoidance of doubt, any Deposit paid to Urban Hub Village Ltd may be used towards any outstanding charges or debts arising under this Tenancy Agreement, including but not limited to, unpaid rent, damages, and cleaning costs, as permitted by law.</p>
                <p className="text-gray-700 mt-2">9.5 You will not off-set the Deposit against any payment of Rent or other sums due to us under the Tenancy Agreement.</p>
                <p className="text-gray-700 mt-2">9.6 We agree that the Deposit shall be protected by an approved tenancy deposit scheme provider in accordance with the rules of the Tenancy Deposit Protection Scheme. Confirmation that your Deposit has been protected will be sent to you within the required timescale.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  10 Advanced rent
                </h2>
                <p className="text-gray-700 italic">The provisions of this clause 10 shall only apply if your Booking Details state that an Advanced Rent is payable.</p>
                <p className="text-gray-700 mt-2">10.1 In this clause 10, “Advanced Rent” means the sum stated in the booking details which will be a true advance payment of rent to cover your Rent payment obligations under this contract.</p>
                <p className="text-gray-700 mt-2">10.2 Payment of the Advanced Rent is a pre-condition for the completion of this Tenancy Agreement. Any failure to pay the Advanced Rent will entitle us to terminate this Tenancy Agreement without any penalty on our part and with immediate effect. We shall inform you should we exercise our right to terminate the Tenancy Agreement under this clause. The Advanced Rent constitutes a prepayment of your first rental instalment. Accordingly your first instalment will constitute the sum detailed in your Booking Details, less the Advanced Rent paid.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  11 Agreements and declarations
                </h2>
                <p className="text-gray-700">11.1 It is agreed that you will be in breach of this Tenancy Agreement if you or anyone else at your instigation have made any other false or misleading statement in the course of the booking of this Tenancy Agreement which has resulted in us granting it to you; and, if so, we may apply for a Court Order for repossession of the Room. If the Court Order is enforced, the Tenancy Agreement will end immediately but without prejudice to any other right of action or remedy either you or we may have in respect of any breach of the other’s obligations under the Tenancy Agreement.</p>
                <p className="text-gray-700 mt-2">11.2 It is also agreed that you will be in breach of this Tenancy Agreement, if at any point prior to the commencement of the Check In Date: (11.2.1) you post material on social media platforms or elsewhere which we (acting reasonably) consider to be illegal, immoral, racist, posing a threat of violence or connected to any act of terrorism (whether actual, fictional or proposed); or (11.2.2) you cease to be a student in full time education; and, if so, we may apply for a Court Order for repossession of the Room. If the Court Order is enforced, the Tenancy Agreement will end immediately but without prejudice to any other right of action or remedy either you or we may have in respect of any breach of the other’s obligations under the Tenancy Agreement.</p>
                <p className="text-gray-700 mt-2">11.3 It is also agreed between you and us that from the start of the Length of Stay if: (11.3.1) the whole or any part of the Rent is unpaid after it becomes due (whether legally demanded or not); or (11.3.2) you post material on social media platforms or elsewhere which we (acting reasonably) consider to be illegal, immoral, racist, posing a threat of violence or connected to any act of terrorism (whether actual, fictional or proposed); or (11.3.3) you cease to be a student in full time education; or (11.3.4) you engage in any criminal or anti-social behaviour; or (11.3.5) you are in breach of any of the other terms of the Tenancy Agreement, or there are any other circumstances whereby Grounds 7A, 8, 10-15 (inclusive), or 17 of Schedule 2 of Housing Act 1988 apply; then, we may apply for a Court Order for repossession of the Room. If the Court Order is enforced, the Tenancy Agreement will end immediately but without prejudice to any other right of action or remedy either you or we may have in respect of any breach of the other’s obligations under the Tenancy Agreement.</p>
                <p className="text-gray-700 mt-2">11.4 If the Room, Flat and/or Property are destroyed, or are otherwise damaged so as to make the Room and/or Flat incapable of occupation, then we or you may end the Tenancy Agreement by giving the other one month’s written notice.</p>
                <p className="text-gray-700 mt-2">11.5 If we agree to allow you to occupy the Room prior to the start of the Length of Stay it shall be as a licensee only, but otherwise in accordance with the terms of this Tenancy Agreement (but only to the extent that the terms are relevant to a licence agreement).</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  12 Failure to check in
                </h2>
                <p className="text-gray-700">12.1 If you have not taken occupation of the Room within 14 days of your Check In Date (as stated in the Booking Details) without providing a written explanation which is satisfactory to us, and we have made not less than three attempts to contact you using the contact information you supplied to us when booking this Tenancy Agreement and you have failed to respond, we will treat such failure as an unconditional offer to surrender this Tenancy Agreement.</p>
                <p className="text-gray-700 mt-2">12.2 At such point we may remarket the Room and upon successful completion of a tenancy agreement with another individual we will be deemed to have accepted such offer to surrender on the contracted start date of a tenancy agreement with another individual which will be the “Surrender Date”.</p>
                <p className="text-gray-700 mt-2">12.3 You will remain liable to pay any Rent, costs or expenses as due under this Tenancy Agreement until either the Surrender Date or the end of the Length of Stay (whichever happens first) and we reserve the right to pursue you for any outstanding costs or rent arrears.</p>
                <p className="text-gray-700 mt-2">12.4 For the avoidance of doubt, nothing in this clause 12 shall create any obligation on us to re-market the Room and/or grant a new Tenancy Agreement to a third party.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  13 Cancellation policy
                </h2>
                <p className="text-gray-700">13.1 The rules governing the cancellation of your Tenancy Agreement are published on the Urban Hub website at <a href="https://www.urbanhub.uk/cancellation-policy" target="_blank" rel="noopener noreferrer" className="text-[#ff2020] hover:underline">https://www.urbanhub.uk/cancellation-policy</a> (or available on request) and will apply to any attempts to cancel.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  14 Guarantee
                </h2>
                <p className="text-gray-700">14.1 The Guarantor guarantees that you will perform and observe your obligations under the Tenancy Agreement (including payment of Rent). If you do not perform and observe your obligations, the Guarantor will do so instead. The Guarantor is liable to reimburse us for any unpaid rent, permitted fees you have been charged and any reasonable costs and expenses (which must be reasonable both in amount and in nature) which we have properly incurred, where you have not carried out your obligations under this Tenancy Agreement. We are under no obligation to bring any claims against you before bringing any action against the Guarantor.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  15 Data protection
                </h2>
                <p className="text-gray-700">15.1 In order to administer your Tenancy Agreement we need to use your personal information and personal information relating to your Guarantor. To find out more about how we use and share your personal information please see our <Link to="/privacy" className="text-[#ff2020] hover:underline">Privacy Policy</Link>, as published at https://urbanhub.uk/privacy-policy/. The Privacy Policy also provides information about your rights in relation to your personal information and how you can exercise them.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  16 Severability
                </h2>
                <p className="text-gray-700">16.1 If any term, condition or provision contained in the Tenancy Agreement shall be held to be invalid, unlawful or unenforceable to any extent, the validity, legality or enforceability of the remaining parts of the Tenancy Agreement shall not be affected.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  17 Notices
                </h2>
                <p className="text-gray-700">17.1 As required by Section 48 of the Landlord and Tenant Act 1987 you are hereby notified that you may serve notices (including notices in proceedings) on us at the following address (and addressed to the Landlord):</p>
                <p className="text-gray-700 mt-2 font-medium">
                  Urban Hub,<br />
                  Ashmoor Street,<br />
                  Preston,<br />
                  England,<br />
                  PR1 7AL,<br />
                  United Kingdom
                </p>
                <p className="text-gray-700 mt-2">17.2 The address for service of notices on you is the address for the Room as set in the Booking Details.</p>
              </section>

              <section>
                <h2 className="text-base md:text-xl font-display font-black uppercase tracking-wide text-gray-900 border-b border-gray-300 pb-2 mb-3 md:mb-4">
                  18 Jurisdiction
                </h2>
                <p className="text-gray-700">18.1 This agreement and any dispute or claim arising out of or in connection with it or its subject matter or formation (including non-contractual disputes or claims) shall be governed by and construed in accordance with the law of England and Wales.</p>
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

export default Terms;
