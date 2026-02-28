#!/usr/bin/env node
/**
 * Validate "checked payment_records with applications.csv" against application files.
 * Usage: node scripts/validate-checked-payments.mjs
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());

function parseCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

function loadCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  return lines.map((l) => parseCSVLine(l));
}

function normalizeEmail(e) {
  return (e || '').toLowerCase().trim();
}

const defaultPath = path.join(ROOT, '2526 Data -Default Contracts - Full file.csv');
const defaultRows = loadCSV(defaultPath);
const defaultEmails = new Set(
  defaultRows.slice(1).map((r) => normalizeEmail(r[0])).filter(Boolean)
);

const customPath = path.join(ROOT, '2526 Data - Applications with custom contracts - complete - Uploaded.csv');
const customRows = loadCSV(customPath);
const customHeader = customRows[0];
const emailColIdx = customHeader.findIndex((h) => h.trim().toLowerCase() === 'email');
const customEmails = new Set(
  customRows.slice(1).map((r) => normalizeEmail(r[emailColIdx])).filter(Boolean)
);

const applicationEmails = new Set([...defaultEmails, ...customEmails]);

const paymentPath = path.join(ROOT, 'checked payment_records with applications.csv');
const paymentRows = loadCSV(paymentPath);
const paymentHeader = paymentRows[0];
const studentEmailIdx = paymentHeader.findIndex((h) => h.trim().toLowerCase() === 'student_email');
const amountIdx = paymentHeader.findIndex((h) => h.trim().toLowerCase() === 'amount');
const paymentDateIdx = paymentHeader.findIndex((h) => h.trim().toLowerCase() === 'payment_date');
const paymentMethodIdx = paymentHeader.findIndex((h) => h.trim().toLowerCase() === 'payment_method');

const allowedMethods = new Set(['cash', 'card', 'bank_transfer', 'cheque']);
const dateLooksNumeric = /^\d{4,6}$/; // Excel serial or similar

const dataRows = paymentRows.slice(1);
const uniquePaymentEmails = [...new Set(dataRows.map((r) => normalizeEmail(r[studentEmailIdx])).filter(Boolean))];

const notInApps = uniquePaymentEmails.filter((e) => !applicationEmails.has(e));
const invalidMethodRows = [];
let numericDateCount = 0;
let emptyOrInvalidEmail = 0;
let invalidAmount = 0;

dataRows.forEach((r, i) => {
  const method = (r[paymentMethodIdx] || '').toLowerCase().trim();
  if (method && !allowedMethods.has(method)) {
    invalidMethodRows.push({ row: i + 2, method, email: r[studentEmailIdx] });
  }
  const dateVal = (r[paymentDateIdx] || '').trim();
  if (dateVal && dateLooksNumeric.test(dateVal)) {
    numericDateCount++;
  }
  const email = (r[studentEmailIdx] || '').trim();
  if (!email || !email.includes('@')) {
    emptyOrInvalidEmail++;
  }
  const amt = parseFloat(r[amountIdx]);
  if (r[amountIdx] !== '' && (isNaN(amt) || amt <= 0)) {
    invalidAmount++;
  }
});

console.log('=== Validation: checked payment_records with applications.csv ===\n');

let allGood = true;

if (notInApps.length > 0) {
  allGood = false;
  console.log('❌ Emails in payment file with NO application (will fail on import):', notInApps.length);
  notInApps.sort().forEach((e) => console.log('   ', e));
  console.log('');
} else {
  console.log('✅ All payment-record emails exist in your application files (default or custom).');
}

if (invalidMethodRows.length > 0) {
  allGood = false;
  console.log('❌ Invalid payment_method (allowed: cash, card, bank_transfer, cheque):', invalidMethodRows.length, 'rows');
  invalidMethodRows.slice(0, 10).forEach(({ row, method }) => console.log('   Row', row, ':', method));
  if (invalidMethodRows.length > 10) console.log('   ... and', invalidMethodRows.length - 10, 'more');
  console.log('');
} else {
  console.log('✅ All payment_method values are valid.');
}

if (numericDateCount > 0) {
  allGood = false;
  console.log('❌ payment_date format issue:', numericDateCount, 'rows have numeric values (e.g. 45878, 46016) instead of dates.');
  console.log('   The import expects dates (e.g. YYYY-MM-DD or DD/MM/YYYY). Excel serial numbers will cause "invalid input syntax for type date" errors.');
  console.log('');
} else {
  console.log('✅ payment_date column looks like dates (no Excel serial numbers detected).');
}

if (emptyOrInvalidEmail > 0) {
  allGood = false;
  console.log('❌ Rows with missing or invalid student_email (no @):', emptyOrInvalidEmail);
  console.log('');
}

if (invalidAmount > 0) {
  allGood = false;
  console.log('❌ Rows with invalid amount (not a positive number):', invalidAmount);
  console.log('');
}

console.log('--- Summary ---');
console.log('Total data rows:', dataRows.length);
console.log('Unique student_emails:', uniquePaymentEmails.length);
if (allGood) {
  console.log('\n✅ File looks good to upload (all checks passed).');
} else {
  console.log('\n❌ Fix the issues above before uploading.');
}
