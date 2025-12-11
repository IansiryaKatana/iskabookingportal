/**
 * CSV Template Generator
 * Generates CSV templates from current database data for bulk import
 */

import { supabase } from "@/integrations/supabase/client";

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
 */
export async function generateApplicationsTemplate(
  options: CSVTemplateOptions = {}
): Promise<string> {
  const { data: applications } = await supabase
    .from("student_applications")
    .select(`
      id,
      status,
      submitted_at,
      contracts!contract_id (
        slug,
        academic_years!inner(name)
      ),
      studios!assigned_studio_id (
        studio_number
      ),
      profiles!student_id (
        id,
        first_name,
        last_name
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
    .limit(50); // Limit to recent 50 for template

  if (!applications || applications.length === 0) {
    // Return template with headers only if no data
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
      "confirmed_at",
      "passport_path",
      "visa_path",
      "utility_bill_path",
      "id_document_path",
      "bank_statement_path",
      "contract_pdf_path",
      "referral_code",
      "deposit_amount",
      "deposit_paid_date",
    ];
    return arrayToCSV([], headers, options);
  }

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
      first_name: step1.first_name || app.profiles?.first_name || "",
      last_name: step1.last_name || app.profiles?.last_name || "",
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
      confirmed_at:
        app.status === "confirmed" && app.submitted_at
          ? new Date(app.submitted_at).toISOString()
          : "",
      passport_path: documents.passport || step4.passport_document || "",
      visa_path: documents.visa || step4.visa_document || "",
      utility_bill_path: documents.utility_bill || step5.utility_bill || "",
      id_document_path: documents.id_document || step5.id_document || "",
      bank_statement_path: documents.bank_statement || step5.bank_statement || "",
      contract_pdf_path: step6.contract_pdf_path || "",
      referral_code: referralCode,
      deposit_amount: "",
      deposit_paid_date: "",
    };
  });

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
    "confirmed_at",
    "passport_path",
    "visa_path",
    "utility_bill_path",
    "id_document_path",
    "bank_statement_path",
    "contract_pdf_path",
    "referral_code",
    "deposit_amount",
    "deposit_paid_date",
  ];

  return arrayToCSV(applicationsData, headers, options);
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
    applications: generateApplicationsTemplate,
  };

  return generators[importType] || (async () => "");
}

