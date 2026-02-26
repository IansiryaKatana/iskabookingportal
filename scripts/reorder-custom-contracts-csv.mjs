/**
 * Reorder CSV columns for "Applications with custom contracts" import.
 * No data change - only column order. Contract structure first, then pricing, then student/application.
 */
import fs from "fs";

const file = "2526 Data - HFS Sales - All custom contracts Complete Final.csv";
let raw = fs.readFileSync(file, "utf8");
raw = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (c === "," || c === "\n" || c === "\r")) {
      row.push(field);
      field = "";
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
      if (c === "\r" && text[i + 1] === "\n") i++;
      continue;
    }
    field += c;
  }
  if (field !== "" || row.length > 0) row.push(field);
  if (row.length) rows.push(row);
  return rows;
}

const rows = parseCSV(raw);
const oldHeaders = rows[0].map((h, i) => (i === 0 ? h.replace(/^\uFEFF/, "") : h));
const oldIndex = {};
oldHeaders.forEach((h, i) => {
  oldIndex[h] = i;
});
// Use normalized headers for lookups (in case first header had BOM)
rows[0] = oldHeaders;

// Contract structure first, then pricing, then student/application
const newOrder = [
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
  "Instalment Dates",
];

const MONTH = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Parse "Instalment Dates" free text into two comma-separated strings:
 * - instalment_due_dates: YYYY-MM-DD, YYYY-MM-DD, ...
 * - instalment_amounts: 2308.57, 2720.00, ...
 */
function parseInstalmentDates(text) {
  if (text == null || String(text).trim() === "") return { dates: "", amounts: "" };
  const s = String(text).trim();
  const dates = [];
  const amounts = [];
  // Dates: DD Mon YYYY (e.g. 24 Sep 2025, 01 Jan 2026)
  const dateRe = /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/gi;
  let m;
  while ((m = dateRe.exec(s)) !== null) {
    const day = parseInt(m[1], 10);
    const month = MONTH[m[2].toLowerCase().slice(0, 3)];
    const year = parseInt(m[3], 10);
    if (month && day >= 1 && day <= 31) {
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      dates.push(iso);
    }
  }
  // Amounts: £X,XXX.XX or X,XXX.XX or XXXX.XX (1 or 2 decimal places)
  const amountRe = /£?([\d,]+\.\d{1,2})\b/g;
  while ((m = amountRe.exec(s)) !== null) {
    const num = m[1].replace(/,/g, "");
    if (num.length > 0) amounts.push(num);
  }
  return {
    dates: dates.join(","),
    amounts: amounts.join(","),
  };
}

function escapeCSV(val) {
  if (val == null) return "";
  const s = String(val);
  if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

const instDatesIdx = oldIndex["Instalment Dates"];

const outRows = rows.map((row, rowIndex) => {
  const instalmentRaw = instDatesIdx !== undefined ? row[instDatesIdx] : "";
  const { dates: instDatesStr, amounts: instAmountsStr } = parseInstalmentDates(instalmentRaw);
  const isHeaderRow = rowIndex === 0;
  return newOrder.map((col) => {
    if (col === "instalment_due_dates") return escapeCSV(isHeaderRow ? "instalment_due_dates" : instDatesStr);
    if (col === "instalment_amounts") return escapeCSV(isHeaderRow ? "instalment_amounts" : instAmountsStr);
    const idx = oldIndex[col];
    return idx === undefined ? "" : escapeCSV(row[idx]);
  });
});

const out = outRows.map((r) => r.join(",")).join("\n");
const outFile = "2526 Data - Applications with custom contracts - Reordered - Structured instalments.csv";
fs.writeFileSync(outFile, out, "utf8");
console.log("Written", outFile, "- rows:", outRows.length, "- cols:", newOrder.length);
