/**
 * Fix overpaid rent ledgers across applications by removing duplicate / stale
 * instalment manual_payments (REQ approvals and exact duplicate amounts) until
 * paid ≈ due. Never removes deposit rows. Never leaves paid < due - £0.05.
 *
 *   node scripts/fix-overpaid-instalment-duplicates.mjs --dry-run
 *   node scripts/fix-overpaid-instalment-duplicates.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
function loadEnv() {
  const env = {};
  for (const file of [".env", ".env.local"]) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?$/);
      if (m) env[m[1]] = m[2];
    }
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const supabase = createClient(url, key, { auth: { persistSession: false } });
const TOL = 0.05;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function listOverpaidApps() {
  // Pull confirmed/active-ish apps in pages and check summary.
  // Faster path: use SQL via rpc if available; else scan applications with payments.
  const { data: paidApps, error } = await supabase
    .from("manual_payments")
    .select("application_id")
    .eq("payment_type", "instalment");
  if (error) throw error;
  const appIds = [...new Set((paidApps ?? []).map((r) => r.application_id).filter(Boolean))];
  console.log(`Apps with instalment manuals: ${appIds.length}`);

  const overpaid = [];
  for (let i = 0; i < appIds.length; i++) {
    const id = appIds[i];
    const { data, error: e } = await supabase.rpc("get_payment_summary", {
      p_application_id: id,
    });
    if (e) continue;
    const row = Array.isArray(data) ? data[0] : data;
    const due = Number(row?.total_due ?? 0);
    const paid = Number(row?.total_paid ?? 0);
    if (due > 0 && paid > due + TOL) {
      overpaid.push({
        application_id: id,
        total_due: due,
        total_paid: paid,
        excess: round2(paid - due),
        payment_status: row?.payment_status,
      });
    }
    if ((i + 1) % 100 === 0) process.stdout.write(`… scanned ${i + 1}/${appIds.length}\n`);
  }
  return overpaid.sort((a, b) => b.excess - a.excess);
}

function scoreRemovalCandidate(p, totalDue, amountCounts) {
  // Higher = remove first
  let score = 0;
  const isReq = String(p.receipt_number || "").startsWith("REQ-");
  if (isReq) score += 1000;
  if (!p.instalment_id) score += 200;
  if (amountCounts.get(round2(p.amount)) >= 2) score += 500;
  if (Math.abs(Number(p.amount) - totalDue) < 1) score += 400; // full-rent lump
  if (Math.abs(Number(p.amount) - totalDue / 2) < 1) score += 50;
  // newer preferred
  score += Math.min(100, Date.parse(p.created_at || p.payment_date || 0) / 1e12);
  return score;
}

function chooseDeletions(manuals, totalDue, totalPaid) {
  const instalments = manuals
    .filter((p) => p.payment_type === "instalment" || (!p.payment_type && p.amount))
    .filter((p) => p.payment_type !== "deposit");

  const amountCounts = new Map();
  for (const p of instalments) {
    const a = round2(p.amount);
    amountCounts.set(a, (amountCounts.get(a) || 0) + 1);
  }

  const ranked = [...instalments].sort((a, b) => {
    const sb = scoreRemovalCandidate(b, totalDue, amountCounts);
    const sa = scoreRemovalCandidate(a, totalDue, amountCounts);
    if (sb !== sa) return sb - sa;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });

  let paid = totalPaid;
  const deletions = [];
  for (const p of ranked) {
    if (paid <= totalDue + TOL) break;
    const without = round2(paid - Number(p.amount));
    // Only delete if we remain at/above due (don't create underpayment)
    if (without + TOL >= totalDue) {
      deletions.push({
        payment_id: p.id,
        amount: Number(p.amount),
        receipt_number: p.receipt_number,
        payment_date: p.payment_date,
        notes: p.notes,
        instalment_id: p.instalment_id,
        reason: String(p.receipt_number || "").startsWith("REQ-")
          ? "stale_or_excess_req"
          : amountCounts.get(round2(p.amount)) >= 2
            ? "duplicate_amount"
            : Math.abs(Number(p.amount) - totalDue) < 1
              ? "full_due_lump_duplicate"
              : "excess_newest_safe",
      });
      paid = without;
    }
  }
  return { deletions, paid_after: paid };
}

async function main() {
  console.log(apply ? "=== APPLY ===" : "=== DRY RUN ===");

  // Prefer list from prior SQL export if present & fresh; else scan
  let overpaid = [];
  const listPath = path.join(root, ".temp", "overpaid-apps.json");
  if (fs.existsSync(listPath) && process.argv.includes("--from-file")) {
    overpaid = JSON.parse(fs.readFileSync(listPath, "utf8"));
  } else {
    overpaid = await listOverpaidApps();
    fs.mkdirSync(path.join(root, ".temp"), { recursive: true });
    fs.writeFileSync(listPath, JSON.stringify(overpaid, null, 2));
  }
  console.log(`Overpaid applications: ${overpaid.length}`);

  // Enrich names
  const ids = overpaid.map((o) => o.application_id);
  const nameById = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data } = await supabase
      .from("student_applications")
      .select("id, status, student_id")
      .in("id", chunk);
    const sids = [...new Set((data ?? []).map((a) => a.student_id).filter(Boolean))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", sids);
    const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
    for (const a of data ?? []) {
      const p = pmap.get(a.student_id);
      nameById.set(
        a.id,
        p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : a.student_id
      );
      const row = overpaid.find((o) => o.application_id === a.id);
      if (row) row.status = a.status;
    }
  }

  const report = [];
  const allDeletions = [];

  for (const o of overpaid) {
    const { data: manuals, error } = await supabase
      .from("manual_payments")
      .select(
        "id, application_id, amount, payment_type, payment_date, receipt_number, notes, instalment_id, created_at"
      )
      .eq("application_id", o.application_id)
      .order("created_at", { ascending: true });
    if (error) {
      console.warn(`manuals fail ${o.application_id}: ${error.message}`);
      continue;
    }

    const { deletions, paid_after } = chooseDeletions(
      manuals ?? [],
      o.total_due,
      o.total_paid
    );
    if (!deletions.length) {
      report.push({
        ...o,
        student: nameById.get(o.application_id) || "",
        remove_count: 0,
        remove_sum: 0,
        paid_after: o.total_paid,
        remaining_after: round2(o.total_due - o.total_paid),
        unresolved: true,
        deletions: [],
      });
      continue;
    }

    const remove_sum = round2(deletions.reduce((s, d) => s + d.amount, 0));
    report.push({
      ...o,
      student: nameById.get(o.application_id) || "",
      remove_count: deletions.length,
      remove_sum,
      paid_after,
      remaining_after: round2(o.total_due - paid_after),
      unresolved: paid_after > o.total_due + TOL,
      deletions,
    });
    for (const d of deletions) {
      allDeletions.push({ application_id: o.application_id, ...d });
    }
  }

  const fixable = report.filter((r) => r.remove_count > 0);
  const unresolved = report.filter((r) => r.unresolved);
  console.log(`Fixable apps: ${fixable.length}`);
  console.log(`Payments to delete: ${allDeletions.length}`);
  console.log(
    `Amount to remove: £${round2(allDeletions.reduce((s, d) => s + d.amount, 0)).toFixed(2)}`
  );
  console.log(`Still unresolved after proposed deletes: ${unresolved.length}`);

  const out = path.join(root, ".temp", "overpay-fix-report.json");
  fs.writeFileSync(
    out,
    JSON.stringify(
      { generated_at: new Date().toISOString(), apply, report, allDeletions },
      null,
      2
    )
  );
  console.log(`Wrote ${out}`);

  for (const r of fixable.slice(0, 40)) {
    console.log(
      `${r.application_id.slice(0, 8)} | ${(r.student || "").padEnd(22).slice(0, 22)} | due ${r.total_due} paid ${r.total_paid} excess ${r.excess} | -${r.remove_count} (£${r.remove_sum}) → ${r.paid_after}`
    );
  }
  if (fixable.length > 40) console.log(`… +${fixable.length - 40} more`);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to delete.");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const d of allDeletions) {
    const { error } = await supabase.from("manual_payments").delete().eq("id", d.payment_id);
    if (error) {
      fail++;
      console.error(`FAIL ${d.payment_id}: ${error.message}`);
    } else ok++;
  }
  console.log(`Deleted ${ok}, failed ${fail}`);

  // verify
  let still = 0;
  for (const r of fixable) {
    const { data } = await supabase.rpc("get_payment_summary", {
      p_application_id: r.application_id,
    });
    const row = Array.isArray(data) ? data[0] : data;
    const due = Number(row?.total_due ?? 0);
    const paid = Number(row?.total_paid ?? 0);
    if (paid > due + TOL) {
      still++;
      console.warn(
        `STILL OVER ${r.student} ${r.application_id}: due ${due} paid ${paid} excess ${round2(paid - due)}`
      );
    }
  }
  console.log(`Still overpaid among fixable set: ${still}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
