/**
 * CSV Template Generator
 * Generates CSV templates from current database data for bulk import
 */

import { supabase } from "@/integrations/supabase/client";
import { BOOKING_SOURCE_VALUES } from "@/constants/bookingSources";

export interface CSVTemplateOptions {
  includeHeaders?: boolean;
  includeExampleData?: boolean;
}

/**
 * Convert array of objects to CSV string
 */
function arrayToCSV(
  data: Record<string, any>[],
  headers: string[],
  options: CSVTemplateOptions = {}
): string {
  const { includeHeaders = true, includeExampleData = true } = options;

  const csvRows: string[] = [];

  // Add headers
  if (includeHeaders && headers.length > 0) {
    csvRows.push(headers.map((h) => `"${h}"`).join(","));
  }

  // Add data rows
  if (includeExampleData && data.length > 0) {
    data.forEach((row) => {
      const values = headers.map((header) => {
        const value = row[header] ?? "";
        // Escape quotes and wrap in quotes
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(","));
    });
  }

  return csvRows.join("\n");
}

/**
 * Generate Academic Years CSV template from current data
 */
export async function generateAcademicYearsTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data } = await supabase
    .from("academic_years")
    .select("name, start_date, end_date, is_active")
    .order("start_date", { ascending: false });

  const headers = ["name", "start_date", "end_date", "is_active"];
  return arrayToCSV(data || [], headers, options);
}

/**
 * Generate Studio Grades CSV template from current data
 */
export async function generateStudioGradesTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data } = await supabase
    .from("studio_grades")
    .select("slug, name, short_description, long_description, max_occupancy, display_order, is_active")
    .order("display_order", { ascending: true });

  const headers = [
    "slug",
    "name",
    "short_description",
    "long_description",
    "max_occupancy",
    "display_order",
    "is_active",
  ];
  return arrayToCSV(data || [], headers, options);
}

/**
 * Generate Studios CSV template from current data
 */
export async function generateStudiosTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data } = await supabase
    .from("studios")
    .select(`
      studio_number,
      floor,
      status,
      allocation,
      is_active,
      studio_grade:studio_grades ( slug )
    `)
    .order("studio_number", { ascending: true });

  const studios = (data || []).map((studio: any) => ({
    studio_number: studio.studio_number,
    studio_grade_slug: (studio.studio_grade as any)?.slug || "",
    floor: studio.floor || "",
    status: studio.status || "available",
    allocation: studio.allocation || "",
    is_active: studio.is_active ?? true,
  }));

  const headers = [
    "studio_number",
    "studio_grade_slug",
    "floor",
    "status",
    "allocation",
    "is_active",
  ];
  return arrayToCSV(studios, headers, options);
}

/**
 * Generate Studio Grade Prices CSV template from current data
 */
export async function generateStudioGradePricesTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data } = await supabase
    .from("studio_grade_prices")
    .select(`
      academic_years!inner(name),
      studio_grades!inner(slug),
      weekly_price,
      deposit_amount_override,
      currency_code,
      is_active
    `);

  const prices = (data || []).map((price: any) => ({
    academic_year_name: price.academic_years?.name || "",
    studio_grade_slug: price.studio_grades?.slug || "",
    weekly_price: price.weekly_price || "",
    deposit_amount_override: price.deposit_amount_override || "",
    currency_code: price.currency_code || "GBP",
    is_active: price.is_active ?? true,
  }));

  const headers = [
    "academic_year_name",
    "studio_grade_slug",
    "weekly_price",
    "deposit_amount_override",
    "currency_code",
    "is_active",
  ];
  return arrayToCSV(prices, headers, options);
}

/**
 * Generate Payment Plans CSV template from current data
 */
export async function generatePaymentPlansTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data } = await supabase
    .from("payment_plans")
    .select(`
      academic_years!inner(name),
      name,
      description,
      deposit_amount,
      is_active
    `);

  const plans = (data || []).map((plan: any) => ({
    academic_year_name: plan.academic_years?.name || "",
    name: plan.name || "",
    description: plan.description || "",
    deposit_amount: plan.deposit_amount || "",
    is_active: plan.is_active ?? true,
  }));

  const headers = [
    "academic_year_name",
    "name",
    "description",
    "deposit_amount",
    "is_active",
  ];
  return arrayToCSV(plans, headers, options);
}

/**
 * Generate Payment Plan Installments CSV template from current data
 */
export async function generatePaymentPlanInstallmentsTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data } = await supabase
    .from("payment_plan_installments")
    .select(`
      payment_plans!inner(
        name,
        academic_years!inner(name)
      ),
      sequence,
      label,
      due_date_offset_days,
      due_date,
      amount_type,
      amount_value
    `)
    .order("payment_plans(name)", { ascending: true })
    .order("sequence", { ascending: true });

  const installments = (data || []).map((inst: any) => ({
    academic_year_name: inst.payment_plans?.academic_years?.name || "",
    payment_plan_name: inst.payment_plans?.name || "",
    sequence: inst.sequence || "",
    label: inst.label || "",
    due_date_offset_days: inst.due_date_offset_days || "",
    due_date: inst.due_date || "",
    amount_type: inst.amount_type || "percentage",
    amount_value: inst.amount_value || "",
  }));

  const headers = [
    "academic_year_name",
    "payment_plan_name",
    "sequence",
    "label",
    "due_date_offset_days",
    "due_date",
    "amount_type",
    "amount_value",
  ];
  return arrayToCSV(installments, headers, options);
}

/**
 * Generate Contracts CSV template from current data
 */
export async function generateContractsTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data } = await supabase
    .from("contracts")
    .select(`
      slug,
      name,
      academic_years!inner(name),
      studio_grades!inner(slug),
      payment_plans(name),
      contract_start,
      contract_end,
      weeks,
      weekly_price_override,
      deposit_override,
      summary,
      cta_label,
      display_order,
      is_active
    `);

  const contracts = (data || []).map((contract: any) => ({
    slug: contract.slug || "",
    name: contract.name || "",
    academic_year_name: contract.academic_years?.name || "",
    studio_grade_slug: contract.studio_grades?.slug || "",
    payment_plan_name: contract.payment_plans?.name || "",
    contract_start: contract.contract_start || "",
    contract_end: contract.contract_end || "",
    weeks: contract.weeks || "",
    weekly_price_override: contract.weekly_price_override || "",
    deposit_override: contract.deposit_override || "",
    summary: contract.summary || "",
    cta_label: contract.cta_label || "",
    display_order: contract.display_order || 0,
    is_active: contract.is_active ?? true,
  }));

  const headers = [
    "slug",
    "name",
    "academic_year_name",
    "studio_grade_slug",
    "payment_plan_name",
    "contract_start",
    "contract_end",
    "weeks",
    "weekly_price_override",
    "deposit_override",
    "summary",
    "cta_label",
    "display_order",
    "is_active",
  ];
  return arrayToCSV(contracts, headers, options);
}

/**
 * Generate Partners CSV template from current data
 */
export async function generatePartnersTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data } = await supabase
    .from("partners")
    .select("name, contact_name, contact_email, contact_phone, commission_percentage, is_active, notes");

  const headers = [
    "name",
    "contact_name",
    "contact_email",
    "contact_phone",
    "commission_percentage",
    "is_active",
    "notes",
  ];
  return arrayToCSV(data || [], headers, options);
}

/**
 * Generate Cashback Campaigns CSV template from current data
 */
export async function generateCashbackCampaignsTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data } = await supabase
    .from("cashback_campaigns")
    .select("name, description, cashback_amount, applies_to, start_date, end_date, is_active, max_uses");

  const headers = [
    "name",
    "description",
    "cashback_amount",
    "applies_to",
    "start_date",
    "end_date",
    "is_active",
    "max_uses",
  ];
  return arrayToCSV(data || [], headers, options);
}

/**
 * Generate Discount Campaigns CSV template from current data
 */
export async function generateDiscountCampaignsTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data } = await supabase
    .from("discount_campaigns")
    .select("name, description, discount_amount, amount_type, applies_to, start_date, end_date, is_active, max_uses, booking_source");

  const headers = [
    "name",
    "description",
    "discount_amount",
    "amount_type",
    "applies_to",
    "start_date",
    "end_date",
    "is_active",
    "max_uses",
    "booking_source",
  ];
  return arrayToCSV(data || [], headers, options);
}

/**
 * Download CSV as file
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generate Applications CSV template from current data
 * Creates comprehensive example rows with all contract/payment plan permutations
 */
export async function generateApplicationsTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const PLACEHOLDER_DOCUMENT_PATH = "documents/PLACEHOLDER.pdf";

  // Fetch all contracts with their payment plans for generating examples
  const { data: contracts } = await supabase
    .from("contracts")
    .select(`
      slug,
      name,
      academic_years!inner(name),
      contract_payment_plans:contract_payment_plans (
        payment_plan:payment_plans (
          name
        )
      ),
      payment_plans:payment_plan_id (
        name
      )
    `)
    .eq("is_active", true)
    .order("academic_years(name)", { ascending: false })
    .order("slug", { ascending: true });

  // Fetch some studios for examples
  const { data: studios } = await supabase
    .from("studios")
    .select("studio_number")
    .eq("is_active", true)
    .limit(50)
    .order("studio_number", { ascending: true });

  const studioNumbers = (studios || []).map((s: any) => s.studio_number);

  // Generate example data with all permutations
  const exampleRows: any[] = [];

  if (contracts && contracts.length > 0) {
    // Realistic dummy data pool
    const firstNames = [
      "John", "Sarah", "Michael", "Emily", "David", "Jessica", "James", "Emma",
      "Daniel", "Olivia", "Matthew", "Sophia", "Christopher", "Isabella", "Andrew", "Charlotte"
    ];
    const lastNames = [
      "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
      "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas", "Taylor"
    ];
    const ethnicities = ["White British", "Asian", "Black", "Mixed", "Other"];
    const genders = ["Male", "Female", "Other", "Prefer not to say"];
    const countries = ["United Kingdom", "India", "China", "Nigeria", "Pakistan", "United States"];
    const yearsOfStudy = ["1", "2", "3", "4", "Postgraduate"];
    const fieldsOfStudy = [
      "Computer Science", "Business Management", "Engineering", "Medicine",
      "Law", "Psychology", "Economics", "Architecture"
    ];
    const entryIntoUK = ["Student Visa", "UK Citizen", "EU Settlement", "Work Visa"];

    let exampleCounter = 0;

    contracts.forEach((contract: any, contractIndex: number) => {
      const contractSlug = contract.slug || "";
      const contractName = contract.name || "";
      const academicYearName = contract.academic_years?.name || "";

      // Get payment plans for this contract
      const paymentPlanNames: string[] = [];
      if (contract.contract_payment_plans && contract.contract_payment_plans.length > 0) {
        contract.contract_payment_plans.forEach((cpp: any) => {
          if (cpp.payment_plan?.name) {
            paymentPlanNames.push(cpp.payment_plan.name);
          }
        });
      }
      if (contract.payment_plans?.name) {
        paymentPlanNames.push(contract.payment_plans.name);
      }

      // Generate 2-3 examples per contract
      const examplesPerContract = paymentPlanNames.length > 0 ? Math.min(3, paymentPlanNames.length + 1) : 2;

      for (let i = 0; i < examplesPerContract; i++) {
        const firstName = firstNames[exampleCounter % firstNames.length];
        const lastName = lastNames[exampleCounter % lastNames.length];
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${exampleCounter}@example.com`;
        
        // Calculate date of birth (age 18-25)
        const age = 18 + (exampleCounter % 8);
        const birthYear = new Date().getFullYear() - age;
        const birthMonth = String(1 + (exampleCounter % 12)).padStart(2, "0");
        const birthDay = String(1 + (exampleCounter % 28)).padStart(2, "0");
        const dateOfBirth = `${birthYear}-${birthMonth}-${birthDay}`;

        // Select payment plan (rotate through available plans, or empty for one example)
        const paymentPlanName = i < paymentPlanNames.length 
          ? paymentPlanNames[i] 
          : (paymentPlanNames.length > 0 ? paymentPlanNames[0] : "");

        // Select studio (rotate through available studios)
        const studioNumber = studioNumbers.length > 0 
          ? studioNumbers[exampleCounter % studioNumbers.length] 
          : "";

        // All examples have deposits (ongoing confirmed applications)
        const depositAmount = "99";
        const depositPaidDate = "2024-09-01";

        // Calculate submitted date (recent past)
        const submittedDate = new Date();
        submittedDate.setDate(submittedDate.getDate() - (exampleCounter % 30));
        const submittedAt = submittedDate.toISOString();

        exampleRows.push({
          email,
          first_name: firstName,
          last_name: lastName,
          date_of_birth: dateOfBirth,
          ethnicity: ethnicities[exampleCounter % ethnicities.length],
          gender: genders[exampleCounter % genders.length],
          ucas_id: `UCAS${String(1000000 + exampleCounter).padStart(7, "0")}`,
          country: countries[exampleCounter % countries.length],
          mobile: `+44 7${String(100000000 + exampleCounter).slice(-9)}`,
          address_line_1: `${10 + (exampleCounter % 90)} High Street`,
          address_line_2: exampleCounter % 3 === 0 ? "Flat 2B" : "",
          postcode: ["SW1A 1AA", "M1 1AA", "B1 1AA", "LS1 1AA", "S1 1AA"][exampleCounter % 5],
          town: ["London", "Manchester", "Birmingham", "Leeds", "Sheffield"][exampleCounter % 5],
          year_of_study: yearsOfStudy[exampleCounter % yearsOfStudy.length],
          field_of_study: fieldsOfStudy[exampleCounter % fieldsOfStudy.length],
          disabled: exampleCounter % 10 === 0 ? "yes" : "no",
          smoker: exampleCounter % 5 === 0 ? "yes" : "no",
          medical_requirements: exampleCounter % 4 === 0 ? "None" : "",
          entry_into_uk: entryIntoUK[exampleCounter % entryIntoUK.length],
          uk_citizen: exampleCounter % 3 === 0 ? "yes" : "no",
          academic_year_name: academicYearName,
          contract_slug: contractSlug,
          studio_number: studioNumber,
          payment_plan_name: paymentPlanName,
          guarantor_name: exampleCounter % 2 === 0 ? `${firstName} ${lastName} Senior` : "",
          guarantor_email: exampleCounter % 2 === 0 ? `guarantor.${email}` : "",
          guarantor_phone: exampleCounter % 2 === 0 ? `+44 7${String(200000000 + exampleCounter).slice(-9)}` : "",
          guarantor_relationship: exampleCounter % 2 === 0 ? "Parent" : "",
          guarantor_dob: exampleCounter % 2 === 0 ? `${birthYear - 25}-${birthMonth}-${birthDay}` : "",
          witness_name: exampleCounter % 2 === 0 ? "Jane Witness" : "",
          witness_email: exampleCounter % 2 === 0 ? "witness@example.com" : "",
          witness_phone: exampleCounter % 2 === 0 ? "+44 7123456789" : "",
          status: "confirmed",
          submitted_at: submittedAt,
          passport_path: PLACEHOLDER_DOCUMENT_PATH,
          visa_path: exampleCounter % 3 !== 0 ? PLACEHOLDER_DOCUMENT_PATH : "",
          passport_photo_path: PLACEHOLDER_DOCUMENT_PATH,
          student_proof_path: PLACEHOLDER_DOCUMENT_PATH,
          utility_bill_path: PLACEHOLDER_DOCUMENT_PATH,
          id_document_path: PLACEHOLDER_DOCUMENT_PATH,
          bank_statement_path: PLACEHOLDER_DOCUMENT_PATH,
          contract_pdf_path: PLACEHOLDER_DOCUMENT_PATH,
          referral_code: "",
          booking_source: BOOKING_SOURCE_VALUES[exampleCounter % BOOKING_SOURCE_VALUES.length] ?? "",
          deposit_amount: depositAmount,
          deposit_paid_date: depositPaidDate,
        });

        exampleCounter++;
      }
    });
  }

  // If we have existing applications, use them; otherwise use generated examples
  const { data: applications } = await supabase
    .from("student_applications")
    .select(`
      id,
      status,
      submitted_at,
      booking_source,
      contracts!contract_id (
        slug,
        academic_years!inner(name)
      ),
      studios!assigned_studio_id (
        studio_number
      ),
      student_application_steps (
        step_number,
        payload
      ),
      student_documents (
        document_type,
        storage_path
      ),
      partner_referrals (
        referral_code
      )
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  const headers = [
    "email",
    "first_name",
    "last_name",
    "date_of_birth",
    "ethnicity",
    "gender",
    "ucas_id",
    "country",
    "mobile",
    "address_line_1",
    "address_line_2",
    "postcode",
    "town",
    "year_of_study",
    "field_of_study",
    "disabled",
    "smoker",
    "medical_requirements",
    "entry_into_uk",
    "uk_citizen",
    "academic_year_name",
    "contract_slug",
    "studio_number",
    "payment_plan_name",
    "guarantor_name",
    "guarantor_email",
    "guarantor_phone",
    "guarantor_relationship",
    "guarantor_dob",
    "witness_name",
    "witness_email",
    "witness_phone",
    "status",
    "submitted_at",
    "passport_path",
    "visa_path",
    "passport_photo_path",
    "student_proof_path",
    "utility_bill_path",
    "id_document_path",
    "bank_statement_path",
    "contract_pdf_path",
    "referral_code",
    "booking_source",
    "deposit_amount",
    "deposit_paid_date",
  ];

  // Always use generated comprehensive examples when includeExampleData is true
  // Otherwise, use existing applications if available
  if (options.includeExampleData && exampleRows.length > 0) {
    return arrayToCSV(exampleRows, headers, options);
  }

  // If no examples generated and no existing applications, return empty template
  if (!applications || applications.length === 0) {
    return arrayToCSV([], headers, options);
  }

  // If we have existing applications, use them as examples
  // Note: Email will come from step2 payload or needs to be filled in manually

  const applicationsData = applications.map((app: any) => {
    const step1 = app.student_application_steps?.find(
      (s: any) => s.step_number === 1
    )?.payload || {};
    const step2 = app.student_application_steps?.find(
      (s: any) => s.step_number === 2
    )?.payload || {};
    const step3 = app.student_application_steps?.find(
      (s: any) => s.step_number === 3
    )?.payload || {};
    const step4 = app.student_application_steps?.find(
      (s: any) => s.step_number === 4
    )?.payload || {};
    const step5 = app.student_application_steps?.find(
      (s: any) => s.step_number === 5
    )?.payload || {};
    const step6 = app.student_application_steps?.find(
      (s: any) => s.step_number === 6
    )?.payload || {};

    const documents = (app.student_documents || []).reduce(
      (acc: Record<string, string>, doc: any) => {
        acc[doc.document_type] = doc.storage_path || "";
        return acc;
      },
      {} as Record<string, string>
    );

    const referralCode =
      app.partner_referrals?.[0]?.referral_code || step1.referral_code || "";

    return {
      email: step2.email || "", // Email should be in step2 payload or filled manually
      first_name: step1.first_name || "",
      last_name: step1.last_name || "",
      date_of_birth: step1.date_of_birth || "",
      ethnicity: step1.ethnicity || "",
      gender: step1.gender || "",
      ucas_id: step1.ucas_id || "",
      country: step1.country || "",
      mobile: step2.mobile || "",
      address_line_1: step2.address_line_1 || "",
      address_line_2: step2.address_line_2 || "",
      postcode: step2.postcode || "",
      town: step2.town || "",
      year_of_study: step3.year_of_study || "",
      field_of_study: step3.field_of_study || "",
      disabled: step3.disabled || "",
      smoker: step3.smoker || "",
      medical_requirements: step3.medical_requirements || "",
      entry_into_uk: step3.entry_into_uk || "",
      uk_citizen: step4.uk_citizen || "yes",
      academic_year_name: app.contracts?.academic_years?.name || "", // Shows which academic year contract belongs to
      contract_slug: app.contracts?.slug || "",
      studio_number: app.studios?.studio_number || "",
      payment_plan_name: "", // Would need to look up from contract
      guarantor_name: step5.guarantor_name || "",
      guarantor_email: step5.guarantor_email || "",
      guarantor_phone: step5.guarantor_phone || "",
      guarantor_relationship: step5.guarantor_relationship || "",
      guarantor_dob: step5.guarantor_dob || "",
      witness_name: step5.witness_name || "",
      witness_email: step5.witness_email || "",
      witness_phone: step5.witness_phone || "",
      status: app.status || "confirmed",
      submitted_at: app.submitted_at
        ? new Date(app.submitted_at).toISOString()
        : "",
      passport_path: documents.passport || step4.passport_document || "",
      visa_path: documents.visa || step4.visa_document || "",
      passport_photo_path:
        documents.passport_photo || step4.passport_photo || "",
      student_proof_path:
        documents.student_proof || step4.student_proof || "",
      utility_bill_path: documents.utility_bill || step5.utility_bill || "",
      id_document_path: documents.id_document || step5.id_document || "",
      bank_statement_path:
        documents.bank_statement || step5.bank_statement || "",
      contract_pdf_path: step6.contract_pdf_path || "",
      referral_code: referralCode,
      booking_source: app.booking_source || "",
      deposit_amount: "",
      deposit_paid_date: "",
    };
  });

  return arrayToCSV(applicationsData, headers, options);
}

/**
 * Export a single application with a default/template contract as a CSV row
 * matching the standard applications bulk import template.
 */
export async function exportSingleApplicationDefaultCSV(
  applicationId: string
): Promise<string> {
  const headers = [
    "email",
    "first_name",
    "last_name",
    "date_of_birth",
    "ethnicity",
    "gender",
    "ucas_id",
    "country",
    "mobile",
    "address_line_1",
    "address_line_2",
    "postcode",
    "town",
    "year_of_study",
    "field_of_study",
    "disabled",
    "smoker",
    "medical_requirements",
    "entry_into_uk",
    "uk_citizen",
    "academic_year_name",
    "contract_slug",
    "studio_number",
    "payment_plan_name",
    "guarantor_name",
    "guarantor_email",
    "guarantor_phone",
    "guarantor_relationship",
    "guarantor_dob",
    "witness_name",
    "witness_email",
    "witness_phone",
    "status",
    "submitted_at",
    "passport_path",
    "visa_path",
    "passport_photo_path",
    "student_proof_path",
    "utility_bill_path",
    "id_document_path",
    "bank_statement_path",
    "contract_pdf_path",
    "referral_code",
    "booking_source",
    "deposit_amount",
    "deposit_paid_date",
  ];

  const { data: app, error } = await supabase
    .from("student_applications")
    .select(
      `
        id,
        selected_payment_plan_id,
        status,
        submitted_at,
        booking_source,
        contract:contracts!contract_id (
          slug,
          academic_years!inner(name)
        ),
        studios:assigned_studio_id (
          studio_number
        ),
        student_application_steps (
          step_number,
          payload
        ),
        student_documents (
          document_type,
          storage_path
        ),
        partner_referrals (
          referral_code
        )
      `,
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    console.error("Error loading application for single default CSV export:", error);
    throw error;
  }

  if (!app) {
    return arrayToCSV([], headers, { includeHeaders: true, includeExampleData: false });
  }

  const steps = app.student_application_steps || [];
  const step1 = steps.find((s: any) => s.step_number === 1)?.payload || {};
  const step2 = steps.find((s: any) => s.step_number === 2)?.payload || {};
  const step3 = steps.find((s: any) => s.step_number === 3)?.payload || {};
  const step4 = steps.find((s: any) => s.step_number === 4)?.payload || {};
  const step5 = steps.find((s: any) => s.step_number === 5)?.payload || {};
  const step6 = steps.find((s: any) => s.step_number === 6)?.payload || {};

  const documents = (app.student_documents || []).reduce(
    (acc: Record<string, string>, doc: any) => {
      acc[doc.document_type] = doc.storage_path || "";
      return acc;
    },
    {} as Record<string, string>,
  );

  const referralCode =
    app.partner_referrals?.[0]?.referral_code || step1.referral_code || "";

  // Resolve payment plan name from selected_payment_plan_id, if any
  let paymentPlanName = "";
  if (app.selected_payment_plan_id) {
    const { data: plan, error: planError } = await supabase
      .from("payment_plans")
      .select("name")
      .eq("id", app.selected_payment_plan_id)
      .maybeSingle();

    if (planError) {
      console.warn("Failed to load payment plan for single export:", planError);
    }
    paymentPlanName = plan?.name ?? "";
  }

  const row = {
    email: step2.email || "",
    first_name: step1.first_name || "",
    last_name: step1.last_name || "",
    date_of_birth: step1.date_of_birth || "",
    ethnicity: step1.ethnicity || "",
    gender: step1.gender || "",
    ucas_id: step1.ucas_id || "",
    country: step1.country || "",
    mobile: step2.mobile || "",
    address_line_1: step2.address_line_1 || "",
    address_line_2: step2.address_line_2 || "",
    postcode: step2.postcode || "",
    town: step2.town || "",
    year_of_study: step3.year_of_study || "",
    field_of_study: step3.field_of_study || "",
    disabled: step3.disabled || "",
    smoker: step3.smoker || "",
    medical_requirements: step3.medical_requirements || "",
    entry_into_uk: step3.entry_into_uk || "",
    uk_citizen: step4.uk_citizen || "yes",
    academic_year_name: app.contract?.academic_years?.name || "",
    contract_slug: app.contract?.slug || "",
    studio_number: app.studios?.studio_number || "",
    payment_plan_name: paymentPlanName,
    guarantor_name: step5.guarantor_name || "",
    guarantor_email: step5.guarantor_email || "",
    guarantor_phone: step5.guarantor_phone || "",
    guarantor_relationship: step5.guarantor_relationship || "",
    guarantor_dob: step5.guarantor_dob || "",
    witness_name: step5.witness_name || "",
    witness_email: step5.witness_email || "",
    witness_phone: step5.witness_phone || "",
    status: app.status || "confirmed",
    submitted_at: app.submitted_at
      ? new Date(app.submitted_at).toISOString()
      : "",
    passport_path: documents.passport || step4.passport_document || "",
    visa_path: documents.visa || step4.visa_document || "",
    passport_photo_path:
      documents.passport_photo || step4.passport_photo || "",
    student_proof_path:
      documents.student_proof || step4.student_proof || "",
    utility_bill_path: documents.utility_bill || step5.utility_bill || "",
    id_document_path: documents.id_document || step5.id_document || "",
    bank_statement_path:
      documents.bank_statement || step5.bank_statement || "",
    contract_pdf_path: step6.contract_pdf_path || "",
    referral_code: referralCode,
    booking_source: app.booking_source || "",
    deposit_amount: "",
    deposit_paid_date: "",
  };

  return arrayToCSV([row], headers, {
    includeHeaders: true,
    includeExampleData: true,
  });
}

const APPLICATIONS_CUSTOM_CONTRACTS_HEADERS = [
  "academic_year_name",
  "contract_slug",
  "Weekly Rate",
  "Nearest Exceeding Duration",
  "Custom contract start date",
  "payment_plan_name",
  "studio_number",
  "Given Total",
  "Chargeable Total",
  "Discount Needed",
  "email",
  "first_name",
  "last_name",
  "date_of_birth",
  "ethnicity",
  "gender",
  "ucas_id",
  "country",
  "mobile",
  "address_line_1",
  "address_line_2",
  "postcode",
  "town",
  "year_of_study",
  "field_of_study",
  "disabled",
  "smoker",
  "medical_requirements",
  "entry_into_uk",
  "uk_citizen",
  "guarantor_name",
  "guarantor_email",
  "guarantor_phone",
  "guarantor_relationship",
  "guarantor_dob",
  "witness_name",
  "witness_email",
  "witness_phone",
  "status",
  "submitted_at",
  "booking_source",
  "deposit_amount",
  "deposit_paid_date",
  "referral_code",
  "passport_path",
  "visa_path",
  "utility_bill_path",
  "id_document_path",
  "bank_statement_path",
  "contract_pdf_path",
  "instalment_due_dates",
  "instalment_amounts",
];

/**
 * Generate Applications with custom contracts CSV template.
 * Column order: contract/pricing first, then student/application, then instalment_due_dates, instalment_amounts.
 */
export async function generateApplicationsWithCustomContractsTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const PLACEHOLDER_DOCUMENT_PATH = "documents/PLACEHOLDER.pdf";
  const { data: contracts } = await supabase
    .from("contracts")
    .select(`
      slug,
      name,
      academic_years!inner(name)
    `)
    .eq("is_active", true)
    .is("student_application_id", null)
    .order("academic_years(name)", { ascending: false })
    .order("slug", { ascending: true })
    .limit(20);

  const { data: studios } = await supabase
    .from("studios")
    .select("studio_number")
    .eq("is_active", true)
    .limit(20);

  const studioNumbers = (studios || []).map((s: any) => s.studio_number);
  const exampleRows: Record<string, string>[] = [];

  if (contracts && contracts.length > 0) {
    const firstNames = ["John", "Sarah", "Michael", "Emily"];
    const lastNames = ["Smith", "Johnson", "Williams", "Brown"];
    for (let i = 0; i < Math.min(3, contracts.length); i++) {
      const c = contracts[i] as any;
      const ayName = c.academic_years?.name ?? "";
      const slug = c.slug ?? "";
      const email = `${(firstNames[i] ?? "user").toLowerCase()}.${(lastNames[i] ?? "example").toLowerCase()}@example.com`;
      const startDate = "2025-09-24";
      const endDate = "2026-08-29";
      const dueDates = `${startDate},2026-01-01,2026-04-01`;
      const amounts = "2308.57,2720.00,2720.00";
      exampleRows.push({
        academic_year_name: ayName,
        contract_slug: slug,
        "Weekly Rate": "160",
        "Nearest Exceeding Duration": "48w 3d",
        "Custom contract start date": `24 September 2025 to 29 August 2026`,
        payment_plan_name: "3 Instalments",
        studio_number: studioNumbers[i % Math.max(1, studioNumbers.length)] ?? "",
        "Given Total": "7748.57",
        "Chargeable Total": "7748.57",
        "Discount Needed": "0",
        email,
        first_name: firstNames[i] ?? "First",
        last_name: lastNames[i] ?? "Last",
        date_of_birth: "2005-06-16",
        ethnicity: "Other",
        gender: "Prefer not to say",
        ucas_id: "",
        country: "United Kingdom",
        mobile: "+447000000000",
        address_line_1: "Example Street 1",
        address_line_2: "",
        postcode: "SW1A 1AA",
        town: "London",
        year_of_study: "2",
        field_of_study: "Not Specified yet",
        disabled: "no",
        smoker: "no",
        medical_requirements: "None",
        entry_into_uk: "Student Visa",
        uk_citizen: "No",
        guarantor_name: "to be provided later",
        guarantor_email: "guarantor@example.com",
        guarantor_phone: "+447123456789",
        guarantor_relationship: "Not Provided",
        guarantor_dob: "16/04/1966",
        witness_name: "Witness Name",
        witness_email: "witness@example.com",
        witness_phone: "+44 7123456789",
        status: "confirmed",
        submitted_at: new Date().toISOString(),
        booking_source: "hfs_sales",
        deposit_amount: "99",
        deposit_paid_date: "11/11/2024",
        referral_code: "",
        passport_path: PLACEHOLDER_DOCUMENT_PATH,
        visa_path: PLACEHOLDER_DOCUMENT_PATH,
        utility_bill_path: PLACEHOLDER_DOCUMENT_PATH,
        id_document_path: PLACEHOLDER_DOCUMENT_PATH,
        bank_statement_path: PLACEHOLDER_DOCUMENT_PATH,
        contract_pdf_path: PLACEHOLDER_DOCUMENT_PATH,
        instalment_due_dates: dueDates,
        instalment_amounts: amounts,
      });
    }
  }

  return arrayToCSV(exampleRows, APPLICATIONS_CUSTOM_CONTRACTS_HEADERS, options);
}

/**
 * Export a single application with a custom contract as a CSV row matching
 * the applications_custom_contracts bulk import template.
 */
export async function exportSingleApplicationCustomCSV(
  applicationId: string
): Promise<string> {
  const headers = APPLICATIONS_CUSTOM_CONTRACTS_HEADERS;

  const { data: app, error } = await supabase
    .from("student_applications")
    .select(
      `
        id,
        status,
        submitted_at,
        booking_source,
        contract:contracts!contract_id (
          id,
          slug,
          academic_years!inner(name),
          contract_start,
          contract_end,
          weeks,
          extra_days,
          weekly_price_override,
          payment_plan_id
        ),
        studios:assigned_studio_id (
          studio_number
        ),
        student_application_steps (
          step_number,
          payload
        ),
        student_documents (
          document_type,
          storage_path
        ),
        partner_referrals (
          referral_code
        )
      `,
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    console.error("Error loading application for single custom CSV export:", error);
    throw error;
  }

  if (!app) {
    return arrayToCSV([], headers, { includeHeaders: true, includeExampleData: false });
  }

  const steps = app.student_application_steps || [];
  const step1 = steps.find((s: any) => s.step_number === 1)?.payload || {};
  const step2 = steps.find((s: any) => s.step_number === 2)?.payload || {};
  const step3 = steps.find((s: any) => s.step_number === 3)?.payload || {};
  const step4 = steps.find((s: any) => s.step_number === 4)?.payload || {};
  const step5 = steps.find((s: any) => s.step_number === 5)?.payload || {};

  const documents = (app.student_documents || []).reduce(
    (acc: Record<string, string>, doc: any) => {
      acc[doc.document_type] = doc.storage_path || "";
      return acc;
    },
    {} as Record<string, string>,
  );

  const referralCode =
    app.partner_referrals?.[0]?.referral_code || step1.referral_code || "";

  const contract = app.contract as any;
  const academicYearName = contract?.academic_years?.name ?? "";
  const planId = contract?.payment_plan_id as string | null;

  let paymentPlanName = "";
  let instalmentDueDates: string[] = [];
  let instalmentAmounts: string[] = [];

  if (planId) {
    const { data: plan } = await supabase
      .from("payment_plans")
      .select("id, name")
      .eq("id", planId)
      .maybeSingle();
    paymentPlanName = plan?.name ?? "";

    const { data: installments } = await supabase
      .from("payment_plan_installments")
      .select("sequence, due_date, amount_value")
      .eq("payment_plan_id", planId)
      .order("sequence", { ascending: true });

    (installments || []).forEach((inst: any) => {
      instalmentDueDates.push(inst.due_date ? String(inst.due_date) : "");
      instalmentAmounts.push(
        inst.amount_value !== null && inst.amount_value !== undefined
          ? String(inst.amount_value)
          : "",
      );
    });
  }

  const weeks = contract?.weeks ?? 0;
  const extraDays = contract?.extra_days ?? 0;
  const duration =
    weeks > 0 ? `${weeks}w ${extraDays ?? 0}d` : "";

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const formatDateRange = (start: string | null, end: string | null): string => {
    if (!start || !end) return "";
    const s = new Date(start);
    const e = new Date(end);
    const fmt = (d: Date) =>
      `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    return `${fmt(s)} to ${fmt(e)}`;
  };

  const row = {
    academic_year_name: academicYearName,
    contract_slug: contract?.slug || "",
    "Weekly Rate":
      contract?.weekly_price_override !== null &&
      contract?.weekly_price_override !== undefined
        ? String(contract.weekly_price_override)
        : "",
    "Nearest Exceeding Duration": duration,
    "Custom contract start date": formatDateRange(
      contract?.contract_start ?? null,
      contract?.contract_end ?? null,
    ),
    payment_plan_name: paymentPlanName,
    studio_number: app.studios?.studio_number || "",
    "Given Total": "",
    "Chargeable Total": "",
    "Discount Needed": "",
    email: step2.email || "",
    first_name: step1.first_name || "",
    last_name: step1.last_name || "",
    date_of_birth: step1.date_of_birth || "",
    ethnicity: step1.ethnicity || "",
    gender: step1.gender || "",
    ucas_id: step1.ucas_id || "",
    country: step1.country || "",
    mobile: step2.mobile || "",
    address_line_1: step2.address_line_1 || "",
    address_line_2: step2.address_line_2 || "",
    postcode: step2.postcode || "",
    town: step2.town || "",
    year_of_study: step3.year_of_study || "",
    field_of_study: step3.field_of_study || "",
    disabled: step3.disabled || "",
    smoker: step3.smoker || "",
    medical_requirements: step3.medical_requirements || "",
    entry_into_uk: step3.entry_into_uk || "",
    uk_citizen: step4.uk_citizen || "yes",
    guarantor_name: step5.guarantor_name || "",
    guarantor_email: step5.guarantor_email || "",
    guarantor_phone: step5.guarantor_phone || "",
    guarantor_relationship: step5.guarantor_relationship || "",
    guarantor_dob: step5.guarantor_dob || "",
    witness_name: step5.witness_name || "",
    witness_email: step5.witness_email || "",
    witness_phone: step5.witness_phone || "",
    status: app.status || "confirmed",
    submitted_at: app.submitted_at
      ? new Date(app.submitted_at).toISOString()
      : "",
    booking_source: app.booking_source || "",
    deposit_amount: "",
    deposit_paid_date: "",
    referral_code: referralCode,
    passport_path: documents.passport || step4.passport_document || "",
    visa_path: documents.visa || step4.visa_document || "",
    utility_bill_path: documents.utility_bill || step5.utility_bill || "",
    id_document_path: documents.id_document || step5.id_document || "",
    bank_statement_path:
      documents.bank_statement || step5.bank_statement || "",
    contract_pdf_path: "",
    instalment_due_dates: instalmentDueDates.join(","),
    instalment_amounts: instalmentAmounts.join(","),
  };

  return arrayToCSV([row], headers, {
    includeHeaders: true,
    includeExampleData: true,
  });
}

/**
 * Generate Payment Records CSV template (installment payments for existing applications).
 * Use application_id OR (student_email + academic_year_name) to identify the application.
 */
export async function generatePaymentRecordsTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const headers = [
    "student_email",
    "academic_year_name",
    "amount",
    "payment_date",
    "payment_method",
    "notes",
    "instalment_sequence",
  ];
  const { includeHeaders = true, includeExampleData = true } = options;

  let exampleRows: Record<string, string>[] = [];
  if (includeExampleData) {
    const { data: academicYears } = await supabase
      .from("academic_years")
      .select("name")
      .order("start_date", { ascending: false })
      .limit(3);
    const yearName = academicYears?.[0]?.name ?? "2024/2025";
    exampleRows = [
      {
        student_email: "student@example.com",
        academic_year_name: yearName,
        amount: "500.00",
        payment_date: "2024-10-01",
        payment_method: "bank_transfer",
        notes: "First installment (imported)",
        instalment_sequence: "1",
      },
      {
        student_email: "student@example.com",
        academic_year_name: yearName,
        amount: "500.00",
        payment_date: "2024-11-01",
        payment_method: "bank_transfer",
        notes: "Second installment (imported)",
        instalment_sequence: "2",
      },
    ];
  }
  return arrayToCSV(exampleRows, headers, options);
}

/**
 * Export applications for a given academic year where contracts are template-based
 * (default contracts – student_application_id IS NULL on contracts).
 * Output columns match the standard applications bulk import template.
 */
export async function exportApplicationsDefaultContractsCSV(
  academicYearId: string
): Promise<string> {
  const headers = [
    "email",
    "first_name",
    "last_name",
    "date_of_birth",
    "ethnicity",
    "gender",
    "ucas_id",
    "country",
    "mobile",
    "address_line_1",
    "address_line_2",
    "postcode",
    "town",
    "year_of_study",
    "field_of_study",
    "disabled",
    "smoker",
    "medical_requirements",
    "entry_into_uk",
    "uk_citizen",
    "academic_year_name",
    "contract_slug",
    "studio_number",
    "payment_plan_name",
    "guarantor_name",
    "guarantor_email",
    "guarantor_phone",
    "guarantor_relationship",
    "guarantor_dob",
    "witness_name",
    "witness_email",
    "witness_phone",
    "status",
    "submitted_at",
    "passport_path",
    "visa_path",
    "passport_photo_path",
    "student_proof_path",
    "utility_bill_path",
    "id_document_path",
    "bank_statement_path",
    "contract_pdf_path",
    "referral_code",
    "booking_source",
    "deposit_amount",
    "deposit_paid_date",
  ];

  // Step 1: find all template contracts for the academic year
  const { data: contracts, error: contractsError } = await supabase
    .from("contracts")
    .select(
      `
        id,
        slug,
        academic_year_id,
        academic_years!inner(name)
      `,
    )
    .eq("academic_year_id", academicYearId)
    .is("student_application_id", null);

  if (contractsError) {
    console.error("Error loading contracts for export:", contractsError);
    throw contractsError;
  }

  if (!contracts || contracts.length === 0) {
    return arrayToCSV([], headers, { includeHeaders: true, includeExampleData: false });
  }

  const contractIds = contracts.map((c: any) => c.id as string);
  const contractById = new Map(
    contracts.map((c: any) => [
      c.id,
      {
        slug: c.slug as string,
        academic_year_name: (c.academic_years as any)?.name as string,
      },
    ]),
  );

  // Step 2: load all applications for those contracts (paged)
  const pageSize = 1000;
  let from = 0;
  const allApplications: any[] = [];

  /* Paginate to avoid row limits */
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("student_applications")
      .select(
        `
          id,
          status,
          submitted_at,
          booking_source,
          contract_id,
          studios:studios!assigned_studio_id (
            studio_number
          ),
          student_application_steps (
            step_number,
            payload
          ),
          student_documents (
            document_type,
            storage_path
          ),
          partner_referrals (
            referral_code
          )
        `,
      )
      .in("contract_id", contractIds)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("Error loading applications for export:", error);
      throw error;
    }

    if (!data || data.length === 0) break;

    allApplications.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (allApplications.length === 0) {
    return arrayToCSV([], headers, { includeHeaders: true, includeExampleData: false });
  }

  const rows = allApplications.map((app: any) => {
    const contract = contractById.get(app.contract_id) || {
      slug: "",
      academic_year_name: "",
    };

    const steps = app.student_application_steps || [];
    const step1 = steps.find((s: any) => s.step_number === 1)?.payload || {};
    const step2 = steps.find((s: any) => s.step_number === 2)?.payload || {};
    const step3 = steps.find((s: any) => s.step_number === 3)?.payload || {};
    const step4 = steps.find((s: any) => s.step_number === 4)?.payload || {};
    const step5 = steps.find((s: any) => s.step_number === 5)?.payload || {};
    const step6 = steps.find((s: any) => s.step_number === 6)?.payload || {};

    const documents = (app.student_documents || []).reduce(
      (acc: Record<string, string>, doc: any) => {
        acc[doc.document_type] = doc.storage_path || "";
        return acc;
      },
      {} as Record<string, string>,
    );

    const referralCode =
      app.partner_referrals?.[0]?.referral_code || step1.referral_code || "";

    return {
      email: step2.email || "",
      first_name: step1.first_name || "",
      last_name: step1.last_name || "",
      date_of_birth: step1.date_of_birth || "",
      ethnicity: step1.ethnicity || "",
      gender: step1.gender || "",
      ucas_id: step1.ucas_id || "",
      country: step1.country || "",
      mobile: step2.mobile || "",
      address_line_1: step2.address_line_1 || "",
      address_line_2: step2.address_line_2 || "",
      postcode: step2.postcode || "",
      town: step2.town || "",
      year_of_study: step3.year_of_study || "",
      field_of_study: step3.field_of_study || "",
      disabled: step3.disabled || "",
      smoker: step3.smoker || "",
      medical_requirements: step3.medical_requirements || "",
      entry_into_uk: step3.entry_into_uk || "",
      uk_citizen: step4.uk_citizen || "yes",
      academic_year_name: contract.academic_year_name || "",
      contract_slug: contract.slug || "",
      studio_number: app.studios?.studio_number || "",
      payment_plan_name: "",
      guarantor_name: step5.guarantor_name || "",
      guarantor_email: step5.guarantor_email || "",
      guarantor_phone: step5.guarantor_phone || "",
      guarantor_relationship: step5.guarantor_relationship || "",
      guarantor_dob: step5.guarantor_dob || "",
      witness_name: step5.witness_name || "",
      witness_email: step5.witness_email || "",
      witness_phone: step5.witness_phone || "",
      status: app.status || "confirmed",
      submitted_at: app.submitted_at
        ? new Date(app.submitted_at).toISOString()
        : "",
      passport_path: documents.passport || step4.passport_document || "",
      visa_path: documents.visa || step4.visa_document || "",
      passport_photo_path:
        documents.passport_photo || step4.passport_photo || "",
      student_proof_path:
        documents.student_proof || step4.student_proof || "",
      utility_bill_path: documents.utility_bill || step5.utility_bill || "",
      id_document_path: documents.id_document || step5.id_document || "",
      bank_statement_path:
        documents.bank_statement || step5.bank_statement || "",
      contract_pdf_path: step6.contract_pdf_path || "",
      referral_code: referralCode,
      booking_source: app.booking_source || "",
      // For exports we leave deposit fields empty; admin can fill if needed before re-import
      deposit_amount: "",
      deposit_paid_date: "",
    };
  });

  return arrayToCSV(rows, headers, {
    includeHeaders: true,
    includeExampleData: true,
  });
}

/**
 * Export applications for a given academic year where contracts are per-application
 * custom contracts (contracts.student_application_id IS NOT NULL).
 * Output columns match the applications_custom_contracts bulk import template.
 */
export async function exportApplicationsCustomContractsCSV(
  academicYearId: string
): Promise<string> {
  const headers = APPLICATIONS_CUSTOM_CONTRACTS_HEADERS;

  // Step 1: find custom contracts for the academic year
  const { data: contracts, error: contractsError } = await supabase
    .from("contracts")
    .select(
      `
        id,
        slug,
        academic_year_id,
        academic_years!inner(name),
        contract_start,
        contract_end,
        weeks,
        extra_days,
        weekly_price_override,
        payment_plan_id
      `,
    )
    .eq("academic_year_id", academicYearId)
    .not("student_application_id", "is", null);

  if (contractsError) {
    console.error("Error loading custom contracts for export:", contractsError);
    throw contractsError;
  }

  if (!contracts || contracts.length === 0) {
    return arrayToCSV([], headers, { includeHeaders: true, includeExampleData: false });
  }

  const contractIds = contracts.map((c: any) => c.id as string);
  const contractById = new Map(
    contracts.map((c: any) => [
      c.id,
      {
        slug: c.slug as string,
        academic_year_name: (c.academic_years as any)?.name as string,
        contract_start: c.contract_start as string | null,
        contract_end: c.contract_end as string | null,
        weeks: c.weeks as number | null,
        extra_days: c.extra_days as number | null,
        weekly_price_override: c.weekly_price_override as number | null,
        payment_plan_id: c.payment_plan_id as string | null,
      },
    ]),
  );

  const paymentPlanIds = Array.from(
    new Set(
      contracts
        .map((c: any) => c.payment_plan_id as string | null)
        .filter((id): id is string => !!id),
    ),
  );

  // Step 2: load payment plan names and instalment schedules for those plans
  const planNameById = new Map<string, string>();
  const scheduleByPlanId = new Map<
    string,
    { dueDates: string[]; amounts: string[] }
  >();

  if (paymentPlanIds.length > 0) {
    const { data: plans, error: plansError } = await supabase
      .from("payment_plans")
      .select("id, name")
      .in("id", paymentPlanIds);

    if (plansError) {
      console.error("Error loading payment plans for export:", plansError);
      throw plansError;
    }

    (plans || []).forEach((p: any) => {
      planNameById.set(p.id as string, (p.name as string) ?? "");
    });

    const { data: installments, error: installmentsError } = await supabase
      .from("payment_plan_installments")
      .select("payment_plan_id, sequence, due_date, amount_type, amount_value")
      .in("payment_plan_id", paymentPlanIds)
      .order("payment_plan_id", { ascending: true })
      .order("sequence", { ascending: true });

    if (installmentsError) {
      console.error("Error loading payment plan installments for export:", installmentsError);
      throw installmentsError;
    }

    (installments || []).forEach((inst: any) => {
      const planId = inst.payment_plan_id as string;
      const dueDate = inst.due_date ? String(inst.due_date) : "";
      const amountRaw = inst.amount_value as number | null;
      const amount =
        amountRaw !== null && amountRaw !== undefined ? String(amountRaw) : "";

      if (!scheduleByPlanId.has(planId)) {
        scheduleByPlanId.set(planId, { dueDates: [], amounts: [] });
      }
      const schedule = scheduleByPlanId.get(planId)!;
      schedule.dueDates.push(dueDate);
      schedule.amounts.push(amount);
    });
  }

  // Step 3: load all applications for those contracts (paged)
  const pageSize = 1000;
  let from = 0;
  const allApplications: any[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("student_applications")
      .select(
        `
          id,
          status,
          submitted_at,
          booking_source,
          contract_id,
          studios:studios!assigned_studio_id (
            studio_number
          ),
          student_application_steps (
            step_number,
            payload
          ),
          student_documents (
            document_type,
            storage_path
          ),
          partner_referrals (
            referral_code
          )
        `,
      )
      .in("contract_id", contractIds)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error("Error loading applications for custom contracts export:", error);
      throw error;
    }

    if (!data || data.length === 0) break;

    allApplications.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  if (allApplications.length === 0) {
    return arrayToCSV([], headers, { includeHeaders: true, includeExampleData: false });
  }

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const formatDateRange = (start: string | null, end: string | null): string => {
    if (!start || !end) return "";
    const s = new Date(start);
    const e = new Date(end);
    const fmt = (d: Date) =>
      `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    return `${fmt(s)} to ${fmt(e)}`;
  };

  const rows = allApplications.map((app: any, idx: number) => {
    const contract = contractById.get(app.contract_id) || {
      slug: "",
      academic_year_name: "",
      contract_start: null,
      contract_end: null,
      weeks: null,
      extra_days: null,
      weekly_price_override: null,
      payment_plan_id: null,
    };

    const steps = app.student_application_steps || [];
    const step1 = steps.find((s: any) => s.step_number === 1)?.payload || {};
    const step2 = steps.find((s: any) => s.step_number === 2)?.payload || {};
    const step3 = steps.find((s: any) => s.step_number === 3)?.payload || {};
    const step4 = steps.find((s: any) => s.step_number === 4)?.payload || {};
    const step5 = steps.find((s: any) => s.step_number === 5)?.payload || {};

    const documents = (app.student_documents || []).reduce(
      (acc: Record<string, string>, doc: any) => {
        acc[doc.document_type] = doc.storage_path || "";
        return acc;
      },
      {} as Record<string, string>,
    );

    const referralCode =
      app.partner_referrals?.[0]?.referral_code || step1.referral_code || "";

    const planId = contract.payment_plan_id as string | null;
    const schedule = planId ? scheduleByPlanId.get(planId) : undefined;
    const dueDates = schedule?.dueDates?.filter(Boolean) ?? [];
    const amounts = schedule?.amounts?.filter(Boolean) ?? [];

    const weeks = contract.weeks ?? 0;
    const extraDays = contract.extra_days ?? 0;
    const duration =
      weeks > 0 ? `${weeks}w ${extraDays ?? 0}d` : "";

    return {
      academic_year_name: contract.academic_year_name || "",
      contract_slug: contract.slug || "",
      "Weekly Rate":
        contract.weekly_price_override !== null &&
        contract.weekly_price_override !== undefined
          ? String(contract.weekly_price_override)
          : "",
      "Nearest Exceeding Duration": duration,
      "Custom contract start date": formatDateRange(
        contract.contract_start,
        contract.contract_end,
      ),
      payment_plan_name: planId ? planNameById.get(planId) || "" : "",
      studio_number: app.studios?.studio_number || "",
      "Given Total": "",
      "Chargeable Total": "",
      "Discount Needed": "",
      email: step2.email || "",
      first_name: step1.first_name || "",
      last_name: step1.last_name || "",
      date_of_birth: step1.date_of_birth || "",
      ethnicity: step1.ethnicity || "",
      gender: step1.gender || "",
      ucas_id: step1.ucas_id || "",
      country: step1.country || "",
      mobile: step2.mobile || "",
      address_line_1: step2.address_line_1 || "",
      address_line_2: step2.address_line_2 || "",
      postcode: step2.postcode || "",
      town: step2.town || "",
      year_of_study: step3.year_of_study || "",
      field_of_study: step3.field_of_study || "",
      disabled: step3.disabled || "",
      smoker: step3.smoker || "",
      medical_requirements: step3.medical_requirements || "",
      entry_into_uk: step3.entry_into_uk || "",
      uk_citizen: step4.uk_citizen || "yes",
      guarantor_name: step5.guarantor_name || "",
      guarantor_email: step5.guarantor_email || "",
      guarantor_phone: step5.guarantor_phone || "",
      guarantor_relationship: step5.guarantor_relationship || "",
      guarantor_dob: step5.guarantor_dob || "",
      witness_name: step5.witness_name || "",
      witness_email: step5.witness_email || "",
      witness_phone: step5.witness_phone || "",
      status: app.status || "confirmed",
      submitted_at: app.submitted_at
        ? new Date(app.submitted_at).toISOString()
        : "",
      booking_source: app.booking_source || "",
      deposit_amount: "",
      deposit_paid_date: "",
      referral_code: referralCode,
      passport_path: documents.passport || step4.passport_document || "",
      visa_path: documents.visa || step4.visa_document || "",
      utility_bill_path: documents.utility_bill || step5.utility_bill || "",
      id_document_path: documents.id_document || step5.id_document || "",
      bank_statement_path:
        documents.bank_statement || step5.bank_statement || "",
      contract_pdf_path: "",
      instalment_due_dates: dueDates.join(","),
      instalment_amounts: amounts.join(","),
    };
  });

  return arrayToCSV(rows, headers, {
    includeHeaders: true,
    includeExampleData: true,
  });
}

/**
 * Generate reference file with contract slugs and payment plan names for applications import
 */
export async function generateApplicationsReferenceFile(): Promise<string> {
  // Fetch all contracts with their payment plans
  const { data: contracts } = await supabase
    .from("contracts")
    .select(`
      slug,
      name,
      academic_years!inner(name),
      contract_payment_plans:contract_payment_plans (
        payment_plan:payment_plans (
          name
        )
      ),
      payment_plans:payment_plan_id (
        name
      )
    `)
    .eq("is_active", true)
    .order("slug", { ascending: true });

  // Fetch all payment plans grouped by academic year
  const { data: paymentPlans } = await supabase
    .from("payment_plans")
    .select(`
      name,
      academic_years!inner(name)
    `)
    .eq("is_active", true)
    .order("name", { ascending: true });

  // Build reference data
  const contractData: Array<{
    contract_slug: string;
    contract_name: string;
    academic_year: string;
    payment_plan_names: string;
  }> = [];

  const paymentPlanData: Array<{
    payment_plan_name: string;
    academic_year: string;
  }> = [];

  // Process contracts
  if (contracts) {
    contracts.forEach((contract: any) => {
      const paymentPlanNames: string[] = [];

      // Get payment plans from junction table
      if (contract.contract_payment_plans && contract.contract_payment_plans.length > 0) {
        contract.contract_payment_plans.forEach((cpp: any) => {
          if (cpp.payment_plan?.name) {
            paymentPlanNames.push(cpp.payment_plan.name);
          }
        });
      }

      // Get payment plan from legacy field
      if (contract.payment_plans?.name) {
        paymentPlanNames.push(contract.payment_plans.name);
      }

      contractData.push({
        contract_slug: contract.slug || "",
        contract_name: contract.name || "",
        academic_year: contract.academic_years?.name || "",
        payment_plan_names: paymentPlanNames.join(", ") || "None",
      });
    });

    // Sort by academic year (descending) then by contract slug
    contractData.sort((a, b) => {
      if (a.academic_year !== b.academic_year) {
        return b.academic_year.localeCompare(a.academic_year); // Descending
      }
      return a.contract_slug.localeCompare(b.contract_slug);
    });
  }

  // Process payment plans
  if (paymentPlans) {
    paymentPlans.forEach((plan: any) => {
      paymentPlanData.push({
        payment_plan_name: plan.name || "",
        academic_year: plan.academic_years?.name || "",
      });
    });

    // Sort by academic year (descending) then by payment plan name
    paymentPlanData.sort((a, b) => {
      if (a.academic_year !== b.academic_year) {
        return b.academic_year.localeCompare(a.academic_year); // Descending
      }
      return a.payment_plan_name.localeCompare(b.payment_plan_name);
    });
  }

  // Build CSV content
  const csvRows: string[] = [];

  // Header
  csvRows.push("APPLICATIONS IMPORT REFERENCE FILE");
  csvRows.push(`Generated: ${new Date().toISOString()}`);
  csvRows.push("");

  // Contracts section
  csvRows.push("=== CONTRACT SLUGS ===");
  csvRows.push("Use these exact contract_slug values in your CSV:");
  csvRows.push("");
  csvRows.push("contract_slug,contract_name,academic_year,available_payment_plans");
  contractData.forEach((contract) => {
    csvRows.push(
      `"${contract.contract_slug}","${contract.contract_name}","${contract.academic_year}","${contract.payment_plan_names}"`
    );
  });

  csvRows.push("");
  csvRows.push("");

  // Payment plans section
  csvRows.push("=== PAYMENT PLAN NAMES ===");
  csvRows.push("Use these exact payment_plan_name values in your CSV:");
  csvRows.push("");
  csvRows.push("payment_plan_name,academic_year");
  paymentPlanData.forEach((plan) => {
    csvRows.push(`"${plan.payment_plan_name}","${plan.academic_year}"`);
  });

  csvRows.push("");
  csvRows.push("");

  // Instructions
  csvRows.push("=== INSTRUCTIONS ===");
  csvRows.push("1. Use contract_slug from the CONTRACT SLUGS section above");
  csvRows.push("2. Use payment_plan_name from the PAYMENT PLAN NAMES section above");
  csvRows.push("3. Ensure the payment plan belongs to the same academic year as the contract");
  csvRows.push("4. Values are case-sensitive - use exact values as shown");
  csvRows.push("5. If a contract shows 'None' for payment plans, leave payment_plan_name empty in your CSV");

  return csvRows.join("\n");
}

/**
 * Generate OTA Bookings CSV template from current data or example rows
 */
export async function generateOTABookingsTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data } = await supabase
    .from("ota_bookings")
    .select(`
      external_ref,
      channel,
      guest_name,
      guest_phone,
      guest_email,
      check_in,
      check_out,
      status,
      notes,
      internal_notes,
      price_per_night,
      commission_amount,
      currency,
      studio:studios ( studio_number )
    `)
    .order("check_in", { ascending: false })
    .limit(20);

  const headers = [
    "external_ref",
    "channel",
    "guest_name",
    "guest_phone",
    "guest_email",
    "studio_number",
    "check_in",
    "check_out",
    "status",
    "notes",
    "internal_notes",
    "price_per_night",
    "commission_amount",
    "currency",
  ];

  if (data && data.length > 0) {
    const rows = data.map((row: any) => ({
      external_ref: row.external_ref ?? "",
      channel: row.channel ?? "airbnb",
      guest_name: row.guest_name ?? "",
      guest_phone: row.guest_phone ?? "",
      guest_email: row.guest_email ?? "",
      studio_number: (row.studio as any)?.studio_number ?? "",
      check_in: row.check_in ?? "",
      check_out: row.check_out ?? "",
      status: row.status ?? "arriving",
      notes: row.notes ?? "",
      internal_notes: row.internal_notes ?? "",
      price_per_night: row.price_per_night ?? "",
      commission_amount: row.commission_amount ?? "",
      currency: row.currency ?? "GBP",
    }));
    return arrayToCSV(rows, headers, options);
  }

  const exampleRows = [
    {
      external_ref: "AIR-2024-001",
      channel: "airbnb",
      guest_name: "Jane Doe",
      guest_phone: "+44 7700 900123",
      guest_email: "jane@example.com",
      studio_number: "",
      check_in: "2024-09-01",
      check_out: "2024-09-05",
      status: "arriving",
      notes: "",
      internal_notes: "",
      price_per_night: "120",
      commission_amount: "15",
      currency: "GBP",
    },
    {
      external_ref: "BK-2024-002",
      channel: "booking",
      guest_name: "John Smith",
      guest_phone: "",
      guest_email: "john@example.com",
      studio_number: "",
      check_in: "2024-09-10",
      check_out: "2024-09-15",
      status: "arriving",
      notes: "",
      internal_notes: "",
      price_per_night: "",
      commission_amount: "",
      currency: "GBP",
    },
  ];
  return arrayToCSV(exampleRows, headers, options);
}

/**
 * Get template generator function by import type
 */
export function getTemplateGenerator(importType: string): () => Promise<string> {
  const generators: Record<string, () => Promise<string>> = {
    academic_years: generateAcademicYearsTemplate,
    studio_grades: generateStudioGradesTemplate,
    studios: generateStudiosTemplate,
    studio_grade_prices: generateStudioGradePricesTemplate,
    payment_plans: generatePaymentPlansTemplate,
    payment_plan_installments: generatePaymentPlanInstallmentsTemplate,
    contracts: generateContractsTemplate,
    partners: generatePartnersTemplate,
    cashback_campaigns: generateCashbackCampaignsTemplate,
    discount_campaigns: generateDiscountCampaignsTemplate,
    applications: generateApplicationsTemplate,
    applications_custom_contracts: generateApplicationsWithCustomContractsTemplate,
    payment_records: generatePaymentRecordsTemplate,
    ota_bookings: generateOTABookingsTemplate,
  };

  return generators[importType] || (async () => "");
}

