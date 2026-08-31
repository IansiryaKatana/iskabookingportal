import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const supabase = createClient(url, key, { auth: { persistSession: false } });
const TOL = 0.05;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const apply = process.argv.includes("--apply");

async function main() {
  const { data: apps, error } = await supabase
    .from("student_applications")
    .select("id, status, student_id, total_contract_value")
    .not("status", "eq", "draft");
  if (error) throw error;

  const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name");
  const pmap = new Map((profiles || []).map((p) => [p.id, p]));

  const { data: cbs } = await supabase.from("application_cashbacks").select("application_id, cashback_amount");
  const { data: dcs } = await supabase.from("application_discounts").select("application_id, discount_amount");
  const cbMap = new Map();
  for (const r of cbs || []) cbMap.set(r.application_id, (cbMap.get(r.application_id) || 0) + Number(r.cashback_amount || 0));
  const dcMap = new Map();
  for (const r of dcs || []) dcMap.set(r.application_id, (dcMap.get(r.application_id) || 0) + Number(r.discount_amount || 0));

  const overpaid = [];
  for (let i = 0; i < apps.length; i++) {
    const a = apps[i];
    const { data } = await supabase.rpc("get_payment_summary", { p_application_id: a.id });
    const row = Array.isArray(data) ? data[0] : data;
    const due = Number(row?.total_due || 0);
    const paid = Number(row?.total_paid || 0);
    if (due <= 0 || paid <= due + TOL) continue;
    const cashback = cbMap.get(a.id) || 0;
    const discount = dcMap.get(a.id) || 0;
    const excess = round2(paid - due);
    const incentive = round2(cashback + discount);
    const unexplained = round2(excess - incentive);
    const p = pmap.get(a.student_id);
    overpaid.push({
      application_id: a.id,
      status: a.status,
      student: p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "",
      total_due: due,
      total_paid: paid,
      excess,
      cashback,
      discount,
      incentive,
      unexplained,
      skip_incentive_only: unexplained <= 1 && Math.abs(paid - 2 * due) >= 1,
    });
    if ((i + 1) % 200 === 0) console.log(`scanned ${i + 1}/${apps.length}`);
  }

  const targets = overpaid.filter((o) => !o.skip_incentive_only && o.unexplained > 1);
  console.log(`Overpaid total ${overpaid.length}; incentive-only skip ${overpaid.length - targets.length}; fix targets ${targets.length}`);

  const report = [];
  const deletions = [];

  for (const o of targets) {
    const { data: manuals } = await supabase
      .from("manual_payments")
      .select("id, amount, payment_type, payment_date, receipt_number, notes, instalment_id, created_at")
      .eq("application_id", o.application_id)
      .order("created_at", { ascending: true });

    const instalments = (manuals || []).filter((m) => m.payment_type === "instalment");
    const amountCounts = new Map();
    for (const m of instalments) {
      const k = round2(m.amount);
      amountCounts.set(k, (amountCounts.get(k) || 0) + 1);
    }

    // Chronological: drop REQ payments once running >= due
    let running = 0;
    const selected = [];
    const selectedSet = new Set();
    const events = [...instalments].sort((a, b) =>
      String(a.created_at || a.payment_date).localeCompare(String(b.created_at || b.payment_date))
    );
    for (const m of events) {
      const isReq = String(m.receipt_number || "").startsWith("REQ-");
      const amt = Number(m.amount);
      if (isReq && running >= o.total_due - TOL) {
        selected.push({ payment_id: m.id, amount: amt, reason: "req_after_fully_paid", receipt_number: m.receipt_number });
        selectedSet.add(m.id);
        continue;
      }
      running = round2(running + amt);
    }

    let paid = o.total_paid;
    paid = round2(paid - selected.reduce((s, x) => s + x.amount, 0));

    // Floor: keep up to sticker (due+incentives) when still above it; never go below due for non-REQ leftovers... 
    // After REQ cleanup, if still paid > due + incentive + TOL, remove newest duplicates safely down to sticker floor.
    const sticker = round2(o.total_due + o.incentive);
    const floor = sticker; // don't remove below full sticker price for non-stale leftovers

    const ranked = instalments
      .filter((m) => !selectedSet.has(m.id))
      .map((m) => {
        const isReq = String(m.receipt_number || "").startsWith("REQ-");
        let score = 0;
        if (isReq) score += 1000;
        if ((amountCounts.get(round2(m.amount)) || 0) >= 2) score += 500;
        if (Math.abs(Number(m.amount) - o.total_due) < 1) score += 400;
        if (Math.abs(Number(m.amount) - sticker) < 1) score += 350;
        if (!m.instalment_id) score += 150;
        score += Date.parse(m.created_at || 0) / 1e13;
        return { m, score, isReq };
      })
      .sort((a, b) => b.score - a.score);

    for (const { m, isReq } of ranked) {
      if (paid <= floor + TOL) break;
      // For REQ, allow going down toward due (stale). For others, keep >= floor (sticker).
      const minKeep = isReq ? o.total_due : floor;
      const without = round2(paid - Number(m.amount));
      if (without + TOL >= minKeep) {
        selected.push({
          payment_id: m.id,
          amount: Number(m.amount),
          reason: isReq ? "req_excess" : "duplicate_or_excess_lump",
          receipt_number: m.receipt_number,
        });
        selectedSet.add(m.id);
        paid = without;
      }
    }

    // If still above due+incentive because floor blocked, but unexplained remains and we have exact 2x due lump
    if (paid > floor + TOL) {
      for (const { m } of ranked) {
        if (selectedSet.has(m.id)) continue;
        if (paid <= floor + TOL) break;
        const without = round2(paid - Number(m.amount));
        if (without + TOL >= floor) {
          selected.push({ payment_id: m.id, amount: Number(m.amount), reason: "excess_to_sticker", receipt_number: m.receipt_number });
          selectedSet.add(m.id);
          paid = without;
        }
      }
    }

    if (!selected.length) {
      report.push({ ...o, remove_count: 0, paid_after: o.total_paid, unresolved: true, deletions: [] });
      continue;
    }

    const remove_sum = round2(selected.reduce((s, x) => s + x.amount, 0));
    const paid_after = round2(o.total_paid - remove_sum);
    report.push({
      ...o,
      remove_count: selected.length,
      remove_sum,
      paid_after,
      remaining_after: round2(o.total_due - paid_after),
      unresolved: paid_after > floor + TOL,
      deletions: selected,
    });
    for (const d of selected) deletions.push({ application_id: o.application_id, ...d });
  }

  const fixable = report.filter((r) => r.remove_count > 0);
  console.log(`Fixable: ${fixable.length}, deletions: ${deletions.length}, sum £${round2(deletions.reduce((s,d)=>s+d.amount,0))}`);
  console.log(`Unresolved: ${report.filter((r) => r.unresolved).length}`);

  fs.mkdirSync(".temp", { recursive: true });
  fs.writeFileSync(".temp/overpay-fix-report.json", JSON.stringify({ apply, report, deletions }, null, 2));

  for (const r of fixable.slice(0, 30)) {
    console.log(`${r.student.padEnd(24).slice(0,24)} | due ${r.total_due} paid ${r.total_paid} unexpl ${r.unexplained} | -${r.remove_count} (£${r.remove_sum}) → ${r.paid_after}`);
  }

  if (!apply) {
    console.log("Dry run only.");
    return;
  }

  let ok = 0, fail = 0;
  for (const d of deletions) {
    const { error } = await supabase.from("manual_payments").delete().eq("id", d.payment_id);
    if (error) { fail++; console.error(error.message); } else ok++;
  }
  console.log(`Deleted ${ok}, failed ${fail}`);

  // verify targets
  let still = 0;
  for (const r of fixable) {
    const { data } = await supabase.rpc("get_payment_summary", { p_application_id: r.application_id });
    const row = Array.isArray(data) ? data[0] : data;
    const due = Number(row?.total_due || 0);
    const paid = Number(row?.total_paid || 0);
    const incentive = r.incentive || 0;
    if (paid > due + incentive + 1) {
      still++;
      console.warn(`STILL ${r.student}: due ${due} paid ${paid}`);
    }
  }
  console.log(`Still unexplained overpay: ${still}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
