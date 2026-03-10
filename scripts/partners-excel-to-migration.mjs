import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const filePath = join(root, 'partners.xlsx');

function escapeSql(str) {
  if (str == null || str === '') return null;
  const s = String(str).trim();
  if (s === '') return null;
  return s.replace(/'/g, "''");
}

function extractEmail(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  const match = trimmed.match(/<([^>]+)>/);
  if (match) return match[1].trim();
  if (trimmed.includes('@')) return trimmed;
  return trimmed || null;
}

function toReferralCode(name) {
  const base = name
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 30);
  return base || null;
}

const wb = XLSX.read(readFileSync(filePath), { type: 'buffer' });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

// Skip header row (when Name column contains "Name")
const dataRows = rows.filter((r) => {
  const name = (r['__EMPTY'] || '').toString().trim();
  return name && name !== 'Name';
});

const seenCodes = new Set();
const partners = dataRows.map((r) => {
  const name = (r['__EMPTY'] || '').toString().trim();
  const web = (r['__EMPTY_1'] || '').toString().trim();
  const phone = (r['__EMPTY_2'] || '').toString().trim();
  const emailRaw = (r['__EMPTY_3'] || '').toString().trim();
  const country = (r['__EMPTY_4'] || '').toString().trim();
  const status = (r['__EMPTY_5'] || '').toString().trim();

  let code = toReferralCode(name);
  if (!code) code = 'PARTNER';
  if (seenCodes.has(code)) {
    let n = 2;
    while (seenCodes.has(code + n)) n++;
    code = code.slice(0, 25) + n;
  }
  seenCodes.add(code);

  const contactEmail = extractEmail(emailRaw) || (emailRaw && emailRaw.includes('@') ? emailRaw : null);
  const notesParts = [];
  if (status) notesParts.push(`Status: ${status}`);
  if (country) notesParts.push(`Country: ${country}`);
  if (web) notesParts.push(`Web: ${web.slice(0, 200)}`);
  const notes = notesParts.length ? notesParts.join('. ') : null;

  return {
    name,
    contact_email: contactEmail,
    contact_phone: phone || null,
    referral_code: code,
    notes,
  };
});

// Output SQL VALUES
function sqlVal(v) {
  if (v == null || v === '') return 'NULL';
  return `'${escapeSql(v)}'`;
}

const valuesLines = partners.map(
  (p) =>
    `  (${sqlVal(p.name)}, NULL, ${sqlVal(p.contact_email)}, ${sqlVal(p.contact_phone)}, 5.00, true, ${sqlVal(p.notes)}, ${sqlVal(p.referral_code)})`
);

const sql = `-- Seed partners from current partners list (Excel import)
-- Only inserts rows that do not already exist (by referral_code).
-- Partners table: name, contact_name, contact_email, contact_phone, commission_percentage, is_active, notes, referral_code

INSERT INTO public.partners (name, contact_name, contact_email, contact_phone, commission_percentage, is_active, notes, referral_code)
SELECT * FROM (VALUES
${valuesLines.join(',\n')}
) AS v(name, contact_name, contact_email, contact_phone, commission_percentage, is_active, notes, referral_code)
WHERE NOT EXISTS (SELECT 1 FROM public.partners p WHERE p.referral_code = v.referral_code);
`;

const outPath = join(root, 'supabase', 'migrations', '20260310_seed_partners_from_excel.sql');
writeFileSync(outPath, sql, 'utf8');
console.log('Written:', outPath);
console.log('Partners count:', partners.length);
