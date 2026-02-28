#!/usr/bin/env node
/**
 * Compare application CSVs (default + custom) with payment records CSV.
 * Reports: payment emails with no matching application (will fail on payment import).
 * Run from project root.
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

// Default contracts: first column is email
const defaultPath = path.join(ROOT, '2526 Data -Default Contracts - Full file.csv');
const defaultRows = loadCSV(defaultPath);
const defaultHeader = defaultRows[0];
const defaultEmails = new Set(
  defaultRows.slice(1).map((r) => normalizeEmail(r[0])).filter(Boolean)
);

// Custom contracts: find "email" column
const customPath = path.join(ROOT, '2526 Data - Applications with custom contracts - complete - Uploaded.csv');
const customRows = loadCSV(customPath);
const customHeader = customRows[0];
const emailColIdx = customHeader.findIndex((h) => h.trim().toLowerCase() === 'email');
if (emailColIdx === -1) {
  console.error('Custom CSV: "email" column not found. Headers:', customHeader.slice(0, 15).join(', '));
  process.exit(1);
}
const customEmails = new Set(
  customRows.slice(1).map((r) => normalizeEmail(r[emailColIdx])).filter(Boolean)
);

// Payment records: first column is student_email
const paymentPath = path.join(ROOT, 'payment_records_template - IAN 10.2.2026 (2).csv');
const paymentRows = loadCSV(paymentPath);
const paymentHeader = paymentRows[0];
const paymentEmails = paymentRows.slice(1).map((r) => normalizeEmail(r[0])).filter(Boolean);
const uniquePaymentEmails = [...new Set(paymentEmails)];

const applicationEmails = new Set([...defaultEmails, ...customEmails]);

const inApps = [];
const notInApps = [];
for (const e of uniquePaymentEmails) {
  if (applicationEmails.has(e)) {
    inApps.push(e);
  } else {
    notInApps.push(e);
  }
}

// Payment method check: import only allows cash, card, bank_transfer, cheque
const methodCol = paymentHeader.findIndex((h) => h.trim().toLowerCase() === 'payment_method');
const invalidMethods = new Set();
if (methodCol >= 0) {
  paymentRows.slice(1).forEach((r) => {
    const m = (r[methodCol] || '').toLowerCase().trim();
    if (m && !['cash', 'card', 'bank_transfer', 'cheque'].includes(m)) {
      invalidMethods.add(m);
    }
  });
}

console.log('=== 25/26 Applications vs Payment Records – Discrepancy Report ===\n');
console.log('Counts:');
console.log('  Default contracts (applications):', defaultEmails.size, 'unique emails');
console.log('  Custom contracts (applications):', customEmails.size, 'unique emails');
console.log('  Combined application emails:', applicationEmails.size, '(default ∪ custom, no double count)');
console.log('  Payment records file:');
console.log('    Total data rows:', paymentRows.length - 1);
console.log('    Unique student_emails:', uniquePaymentEmails.length);
console.log('');

console.log('Payment records by application match:');
console.log('  Emails in payment records that HAVE an application (default or custom):', inApps.length);
console.log('  Emails in payment records that have NO application in either file:', notInApps.length);
console.log('');

if (notInApps.length > 0) {
  console.log('--- Emails in PAYMENT RECORDS with NO application in your two files ---');
  console.log('(These rows will FAIL on payment import until you add applications or remove them from the payment CSV.)\n');
  notInApps.sort().forEach((e) => console.log('  ', e));
  console.log('');
}

if (invalidMethods.size > 0) {
  console.log('--- Payment method values in payment CSV that import will REJECT ---');
  console.log('(Allowed: cash, card, bank_transfer, cheque)\n');
  [...invalidMethods].sort().forEach((m) => console.log('  ', m));
  console.log('');
}

// Summary for success
console.log('=== What you need for a successful payment import ===');
console.log('1. Upload applications first: default contracts CSV, then custom contracts CSV.');
console.log('2. Ensure every student_email in the payment CSV has a matching application (same email) in one of those two files.');
if (notInApps.length > 0) {
  console.log('3. For the', notInApps.length, 'emails listed above, either:');
  console.log('   - Add them to your application data (default or custom) and re-upload applications, or');
  console.log('   - Remove those rows from the payment records CSV before importing payments.');
} else {
  console.log('3. All payment-record emails have a matching application in your files.');
}
if (invalidMethods.size > 0) {
  console.log('4. Change invalid payment_method values in the payment CSV to one of: cash, card, bank_transfer, cheque.');
}
console.log('');
console.log('Done.');
