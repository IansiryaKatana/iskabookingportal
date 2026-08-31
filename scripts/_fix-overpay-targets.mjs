import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false },
  global: { fetch: (...args) => fetch(...args) },
});
const TOL = 0.05;
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const apply = process.argv.includes("--apply");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpcSummary(id) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabase.rpc("get_payment_summary", {
      p_application_id: id,
    });
    if (!error) return Array.isArray(data) ? data[0] : data;
    await sleep(300 * (attempt + 1));
  }
  return null;
}

async function main() {
  const ids = JSON.parse(fs.readFileSync(".temp/overpaid-ids.json", "utf8"));
  console.log(apply ? "APPLY" : "DRY-RUN", "apps", ids.length);

  const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name");
  const pmap = new Map((profiles || []).map((p) => [p.id, p]));

  const { data: appRows } = await supabase
    .from("student_applications")
    .select("id, student_id, status")
    .in("id", ids);

  const { data: cbs } = await supabase
    .from("application_cashbacks")
    .select("application_id, cashback_amount")
    .in("application_id", ids);
  const { data: dcs } = await supabase
    .from("application_discounts")
    .select("application_id, discount_amount")
    .in("application_id", ids);

  const cbMap = new Map();
  for (const r of cbs || [])
    cbMap.set(r.application_id, (cbMap.get(r.application_id) || 0) + Number(r.cashback_amount || 0));
  const dcMap = new Map();
  for (const r of dcs || [])
    dcMap.set(r.application_id, (dcMap.get(r.application_id) || 0) + Number(r.discount_amount || 0));

  const report = [];
  const deletions = [];

  for (const a of appRows || []) {
    const row = await rpcSummary(a.id);
    if (!row) continue;
    const due = Number(row.total_due || 0);
    const paid = Number(row.total_paid || 0);
    if (due <= 0 || paid <= due + TOL) continue;

    const cashback = cbMap.get(a.id) || 0;
    const discount = dcMap.get(a.id) || 0;
    const incentive = round2(cashback + discount);
    const excess = round2(paid - due);
    const unexplained = round2(excess - incentive);
    const p = pmap.get(a.student_id);
    const student = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "";

    // Skip incentive-only "overpay" (paid sticker price)
    if (unexplained <= 1 && Math.abs(paid - 2 * due) >= 1) {
      report.push({
        application_id: a.id,
        student,
        skip: true,
        reason: "incentive_explains_excess",
        excess,
        incentive,
      });
      continue;
    }

    const { data: manuals } = await supabase
      .from("manual_payments")
      .select(
        "id, amount, payment_type, payment_date, receipt_number, notes, instalment_id, created_at"
      )
      .eq("application_id", a.id)
      .eq("payment_type", "instalment")
      .order("created_at", { ascending: true });

    const instalments = manuals || [];
    const amountCounts = new Map();
    for (const m of instalments) {
      const k = round2(m.amount);
      amountCounts.set(k, (amountCounts.get(k) || 0) + 1);
    }

    const selected = [];
    const selectedSet = new Set();
    let running = 0;
    for (const m of instalments) {
      const isReq = String(m.receipt_number || "").startsWith("REQ-");
      const amt = Number(m.amount);
      if (isReq && running >= due - TOL) {
        selected.push({
          payment_id: m.id,
          amount: amt,
          reason: "req_after_fully_paid",
          receipt_number: m.receipt_number,
        });
        selectedSet.add(m.id);
        continue;
      }
      running = round2(running + amt);
    }

    let curPaid = round2(paid - selected.reduce((s, x) => s + x.amount, 0));
    const sticker = round2(due + incentive);

    const ranked = instalments
      .filter((m) => !selectedSet.has(m.id))
      .map((m) => {
        const isReq = String(m.receipt_number || "").startsWith("REQ-");
        let score = 0;
        if (isReq) score += 1000;
        if ((amountCounts.get(round2(m.amount)) || 0) >= 2) score += 500;
        if (Math.abs(Number(m.amount) - due) < 1) score += 400;
        if (Math.abs(Number(m.amount) - sticker) < 1) score += 350;
        if (!m.instalment_id) score += 150;
        score += Date.parse(m.created_at || 0) / 1e13;
        return { m, score, isReq };
      })
      .sort((x, y) => y.score - x.score);

    // REQ rows can be trimmed down to net due; other rows only down to sticker
    // (due + cashback/discount) so legitimate full-price payments are kept.
    for (const { m, isReq } of ranked) {
      const keep = isReq ? due : sticker;
      if (curPaid <= keep + TOL) continue;
      const without = round2(curPaid - Number(m.amount));
      if (without + TOL >= keep) {
        selected.push({
          payment_id: m.id,
          amount: Number(m.amount),
          reason: isReq ? "req_excess" : "duplicate_or_lump",
          receipt_number: m.receipt_number,
        });
        selectedSet.add(m.id);
        curPaid = without;
      }
    }

    // If still above sticker, trim non-selected newest lumps to sticker
    if (curPaid > sticker + TOL) {
      for (const { m, isReq } of ranked) {
        if (selectedSet.has(m.id)) continue;
        if (curPaid <= sticker + TOL) break;
        const without = round2(curPaid - Number(m.amount));
        if (without + TOL >= sticker) {
          selected.push({
            payment_id: m.id,
            amount: Number(m.amount),
            reason: isReq ? "req_trim_sticker" : "trim_to_sticker",
            receipt_number: m.receipt_number,
          });
          selectedSet.add(m.id);
          curPaid = without;
        }
      }
    }

    // Double-paid special case: paid ≈ 2*due and incentive 0 — remove one due-sized payment
    if (selected.length === 0 && Math.abs(paid - 2 * due) < 1) {
      const lump = [...instalments].reverse().find((m) => Math.abs(Number(m.amount) - due) < 1);
      if (lump) {
        selected.push({
          payment_id: lump.id,
          amount: Number(lump.amount),
          reason: "exact_double_due_lump",
          receipt_number: lump.receipt_number,
        });
        curPaid = round2(paid - Number(lump.amount));
      }
    }

    const remove_sum = round2(selected.reduce((s, x) => s + x.amount, 0));
    const paid_after = round2(paid - remove_sum);
    const entry = {
      application_id: a.id,
      student,
      status: a.status,
      total_due: due,
      total_paid: paid,
      excess,
      incentive,
      unexplained,
      remove_count: selected.length,
      remove_sum,
      paid_after,
      remaining_after: round2(due - paid_after),
      unresolved: paid_after > sticker + 1,
      deletions: selected,
    };
    report.push(entry);
    for (const d of selected) deletions.push({ application_id: a.id, student, ...d });
  }

  const fixable = report.filter((r) => r.remove_count > 0);
  console.log(
    `Fixable ${fixable.length}; delete ${deletions.length}; £${round2(
      deletions.reduce((s, d) => s + d.amount, 0)
    )}`
  );
  console.log(
    `Skipped incentive-only: ${report.filter((r) => r.skip).length}; unresolved ${
      report.filter((r) => r.unresolved).length
    }`
  );

  fs.writeFileSync(
    ".temp/overpay-fix-report.json",
    JSON.stringify({ apply, report, deletions }, null, 2)
  );

  for (const r of fixable) {
    console.log(
      `${(r.student || "").padEnd(24).slice(0, 24)} | due ${r.total_due} paid ${r.total_paid} unexpl ${r.unexplained} | -${r.remove_count} (£${r.remove_sum}) → ${r.paid_after}`
    );
  }

  if (!apply) {
    console.log("Dry run only.");
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const d of deletions) {
    const { error } = await supabase.from("manual_payments").delete().eq("id", d.payment_id);
    if (error) {
      fail++;
      console.error("FAIL", d.payment_id, error.message);
    } else ok++;
  }
  console.log(`Deleted ${ok}, failed ${fail}`);

  let still = 0;
  for (const r of fixable) {
    const row = await rpcSummary(r.application_id);
    const due = Number(row?.total_due || 0);
    const paidNow = Number(row?.total_paid || 0);
    const incentive = r.incentive || 0;
    if (paidNow > due + incentive + 1) {
      still++;
      console.warn(`STILL ${r.student}: due ${due} paid ${paidNow}`);
    }
  }
  console.log(`Still unexplained overpay: ${still}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
