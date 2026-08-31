/**
 * Find and optionally fix overpaid applications caused by approving stale
 * manual_payment_requests (REQ-* receipts) after rent was already covered.
 *
 * Usage:
 *   node scripts/fix-stale-req-overpayments.mjs --dry-run
 *   node scripts/fix-stale-req-overpayments.mjs --apply
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
const dryRun = !apply;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const TOL = 0.05;

async function fetchAll(table, select, filters = {}) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    let q = supabase.from(table).select(select).range(from, from + pageSize - 1);
    for (const [k, v] of Object.entries(filters)) {
      if (k === "in") {
        for (const [col, vals] of Object.entries(v)) q = q.in(col, vals);
      } else if (k === "eq") {
        for (const [col, val] of Object.entries(v)) q = q.eq(col, val);
      } else if (k === "like") {
        for (const [col, val] of Object.entries(v)) q = q.like(col, val);
      } else if (k === "order") {
        q = q.order(v.col, { ascending: v.asc ?? true });
      }
    }
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

async function main() {
  console.log(dryRun ? "=== DRY RUN ===" : "=== APPLY MODE ===");

  // 1) All REQ-* instalment manuals (from approved student requests)
  const reqPayments = await fetchAll(
    "manual_payments",
    "id, application_id, amount, payment_date, payment_type, receipt_number, notes, instalment_id, created_at",
    { like: { receipt_number: "REQ-%" }, order: { col: "created_at", asc: true } }
  );
  console.log(`REQ manual payments: ${reqPayments.length}`);

  const appIds = [...new Set(reqPayments.map((p) => p.application_id).filter(Boolean))];
  console.log(`Applications with REQ payments: ${appIds.length}`);

  // 2) All instalment (+ deposit) manuals for those apps
  const allManuals = [];
  for (let i = 0; i < appIds.length; i += 50) {
    const chunk = appIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from("manual_payments")
      .select(
        "id, application_id, amount, payment_date, payment_type, receipt_number, notes, instalment_id, created_at"
      )
      .in("application_id", chunk)
      .order("payment_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    allManuals.push(...(data ?? []));
  }

  // 3) Stripe succeeded for those apps (instalment only via metadata)
  const stripeRows = [];
  for (let i = 0; i < appIds.length; i += 50) {
    const chunk = appIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from("stripe_payments")
      .select("id, student_application_id, amount, status, metadata, created_at")
      .in("student_application_id", chunk)
      .in("status", ["succeeded", "completed"]);
    if (error) throw error;
    stripeRows.push(...(data ?? []));
  }

  // 4) Payment summaries
  const summaries = new Map();
  for (const appId of appIds) {
    const { data, error } = await supabase.rpc("get_payment_summary", {
      p_application_id: appId,
    });
    if (error) {
      console.warn(`summary failed ${appId}: ${error.message}`);
      continue;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) summaries.set(appId, row);
  }

  // 5) App meta
  const { data: apps, error: appsErr } = await supabase
    .from("student_applications")
    .select(
      "id, status, total_contract_value, student_id, contract_id, profiles:profiles!student_applications_student_id_fkey(first_name,last_name), contracts:contracts!contract_id(name, academic_year_id, academic_years:academic_years(name))"
    )
    .in("id", appIds);
  if (appsErr) {
    // fallback simpler select
    const { data: apps2, error: e2 } = await supabase
      .from("student_applications")
      .select("id, status, total_contract_value, student_id, contract_id")
      .in("id", appIds);
    if (e2) throw e2;
    var appMeta = new Map((apps2 ?? []).map((a) => [a.id, a]));
  } else {
    var appMeta = new Map((apps ?? []).map((a) => [a.id, a]));
  }

  const deletions = []; // payments to delete
  const report = [];

  for (const appId of appIds) {
    const summary = summaries.get(appId);
    if (!summary) continue;
    const totalDue = Number(summary.total_due ?? 0);
    const totalPaid = Number(summary.total_paid ?? 0);
    if (totalDue <= 0) continue;
    if (totalPaid <= totalDue + TOL) continue; // not overpaid on rent summary

    const manuals = allManuals
      .filter((p) => p.application_id === appId && p.payment_type !== "deposit")
      .sort((a, b) => {
        const da = `${a.payment_date}|${a.created_at}`;
        const db = `${b.payment_date}|${b.created_at}`;
        return da.localeCompare(db);
      });

    const stripes = stripeRows
      .filter((p) => p.student_application_id === appId)
      .filter((p) => {
        const meta = p.metadata;
        if (!meta || typeof meta !== "object") return false;
        // count as rent if instalment_id present OR type instalment; exclude deposit
        const t = meta.type;
        if (t === "deposit") return false;
        return Boolean(meta.instalment_id) || t === "instalment" || t === "installment";
      });

    // Build chronological rent ledger events
    const events = [
      ...manuals.map((p) => ({
        kind: "manual",
        id: p.id,
        amount: Number(p.amount),
        at: p.created_at || p.payment_date,
        payment_date: p.payment_date,
        isReq: String(p.receipt_number || "").startsWith("REQ-"),
        receipt_number: p.receipt_number,
        notes: p.notes,
        raw: p,
      })),
      ...stripes.map((p) => ({
        kind: "stripe",
        id: p.id,
        amount: Number(p.amount),
        at: p.created_at,
        payment_date: (p.created_at || "").slice(0, 10),
        isReq: false,
        receipt_number: null,
        notes: null,
        raw: p,
      })),
    ].sort((a, b) => String(a.at).localeCompare(String(b.at)));

    // Walk ledger: any REQ payment that arrives when cumulative already >= due is stale/excess.
    // Also: REQ payment that pushes over due — trim only the excess portion by deleting whole payment
    // if the payment is entirely excess (running before >= due), or if deleting it brings paid closer to due
    // without going under due - 0.05.
    let running = 0;
    const staleIds = [];
    for (const ev of events) {
      const before = running;
      const after = round2(before + ev.amount);
      if (ev.isReq && before >= totalDue - TOL) {
        // entire payment is excess after already fully paid
        staleIds.push({
          paymentId: ev.id,
          amount: ev.amount,
          reason: "approved_after_fully_paid",
          before,
          receipt_number: ev.receipt_number,
          payment_date: ev.payment_date,
          notes: ev.notes,
        });
        // do not add to running (as if reversed)
        continue;
      }
      if (ev.isReq && after > totalDue + TOL && before < totalDue - TOL) {
        // partial excess — still delete whole REQ row only if remaining without it is still >= due
        // i.e. other payments alone cover due. Safer: mark for review if removing would undershoot.
        const paidWithout = round2(totalPaid - ev.amount);
        if (paidWithout >= totalDue - TOL) {
          staleIds.push({
            paymentId: ev.id,
            amount: ev.amount,
            reason: "req_causes_overpay_others_cover_due",
            before,
            receipt_number: ev.receipt_number,
            payment_date: ev.payment_date,
            notes: ev.notes,
          });
          continue;
        }
      }
      running = after;
    }

    // If still overpaid after removing "after fully paid", greedily remove latest REQ payments
    // while paidWithout still covers due.
    let simulatedPaid = totalPaid;
    const selected = [...staleIds];
    const selectedSet = new Set(selected.map((s) => s.paymentId));
    simulatedPaid = round2(
      simulatedPaid - selected.reduce((s, x) => s + x.amount, 0)
    );

    if (simulatedPaid > totalDue + TOL) {
      const reqEventsNewestFirst = events
        .filter((e) => e.isReq && !selectedSet.has(e.id))
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
      for (const ev of reqEventsNewestFirst) {
        if (simulatedPaid <= totalDue + TOL) break;
        const without = round2(simulatedPaid - ev.amount);
        if (without >= totalDue - TOL) {
          selected.push({
            paymentId: ev.id,
            amount: ev.amount,
            reason: "latest_req_removed_to_clear_overpay",
            before: null,
            receipt_number: ev.receipt_number,
            payment_date: ev.payment_date,
            notes: ev.notes,
          });
          selectedSet.add(ev.id);
          simulatedPaid = without;
        }
      }
    }

    if (selected.length === 0) continue;

    const meta = appMeta.get(appId) || {};
    const name =
      meta.profiles
        ? `${meta.profiles.first_name || ""} ${meta.profiles.last_name || ""}`.trim()
        : meta.student_id || "";

    const excessBefore = round2(totalPaid - totalDue);
    const removeSum = round2(selected.reduce((s, x) => s + x.amount, 0));
    const paidAfter = round2(totalPaid - removeSum);

    report.push({
      application_id: appId,
      student: name,
      status: meta.status,
      total_due: totalDue,
      total_paid: totalPaid,
      excess_before: excessBefore,
      remove_count: selected.length,
      remove_sum: removeSum,
      paid_after: paidAfter,
      remaining_after: round2(totalDue - paidAfter),
      deletions: selected,
    });

    for (const s of selected) {
      deletions.push({
        application_id: appId,
        payment_id: s.paymentId,
        amount: s.amount,
        reason: s.reason,
        receipt_number: s.receipt_number,
      });
    }
  }

  console.log(`\nOverpaid apps with removable REQ payments: ${report.length}`);
  console.log(`Payments to delete: ${deletions.length}`);
  console.log(
    `Total amount to remove: £${round2(deletions.reduce((s, d) => s + d.amount, 0)).toFixed(2)}`
  );

  const outDir = path.join(root, ".temp");
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "stale-req-overpay-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ generated_at: new Date().toISOString(), dryRun, report, deletions }, null, 2)
  );
  console.log(`Wrote ${reportPath}`);

  // Print compact table
  for (const r of report.sort((a, b) => b.excess_before - a.excess_before)) {
    console.log(
      `${r.application_id.slice(0, 8)}… | ${String(r.student).padEnd(24).slice(0, 24)} | due ${r.total_due} paid ${r.total_paid} excess ${r.excess_before} | remove ${r.remove_count} (£${r.remove_sum}) → paid ${r.paid_after}`
    );
  }

  if (dryRun) {
    console.log("\nDry run only. Re-run with --apply to delete these manual_payments.");
    return;
  }

  // Apply deletions
  let ok = 0;
  let fail = 0;
  for (const d of deletions) {
    const { error } = await supabase.from("manual_payments").delete().eq("id", d.payment_id);
    if (error) {
      fail++;
      console.error(`FAIL delete ${d.payment_id}: ${error.message}`);
    } else {
      ok++;
    }
  }
  console.log(`Deleted ${ok}, failed ${fail}`);

  // Mark related requests? optional note in activity - skip for now

  // Re-verify summaries for affected apps
  let stillOver = 0;
  for (const r of report) {
    const { data, error } = await supabase.rpc("get_payment_summary", {
      p_application_id: r.application_id,
    });
    if (error) continue;
    const row = Array.isArray(data) ? data[0] : data;
    const due = Number(row?.total_due ?? 0);
    const paid = Number(row?.total_paid ?? 0);
    if (paid > due + TOL) {
      stillOver++;
      console.warn(
        `STILL OVER ${r.application_id} ${r.student}: due ${due} paid ${paid} excess ${round2(paid - due)}`
      );
    }
  }
  console.log(`Still overpaid after fix: ${stillOver}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
