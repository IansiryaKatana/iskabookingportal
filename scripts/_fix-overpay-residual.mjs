import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false },
});
const apply = process.argv.includes("--apply");
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const targets = JSON.parse(fs.readFileSync(".temp/overpay-verify-scan.json", "utf8")).rows;

const deletions = [];
const report = [];

for (const t of targets) {
  const { data: manuals } = await supabase
    .from("manual_payments")
    .select("id, amount, payment_date, receipt_number, notes, created_at")
    .eq("application_id", t.id)
    .eq("payment_type", "instalment")
    .order("created_at", { ascending: true });

  const rows = manuals || [];
  const unexplained = t.unexplained;
  const due = t.due;
  let need = round2(unexplained);
  const selected = [];

  // Prefer REQ after paid / oversized REQ first
  for (const m of [...rows].reverse()) {
    if (need <= 1) break;
    const isReq = String(m.receipt_number || "").startsWith("REQ-");
    const amt = round2(m.amount);
    if (isReq && amt <= need + 0.05) {
      selected.push({ ...m, reason: "req_excess" });
      need = round2(need - amt);
    }
  }

  // Then exact-amount duplicates matching remaining need
  if (need > 1) {
    const byAmt = new Map();
    for (const m of rows) {
      if (selected.some((s) => s.id === m.id)) continue;
      const k = round2(m.amount);
      if (!byAmt.has(k)) byAmt.set(k, []);
      byAmt.get(k).push(m);
    }
    // Prefer removing one payment whose amount equals remaining need
    for (const [amt, list] of byAmt) {
      if (need <= 1) break;
      if (Math.abs(amt - need) <= 0.05 && list.length >= 1) {
        // remove latest
        const m = list[list.length - 1];
        selected.push({ ...m, reason: "exact_excess_match" });
        need = round2(need - amt);
      }
    }
  }

  // Then remove latest payments that don't drop below due
  if (need > 1) {
    let paid = t.paid;
    const already = new Set(selected.map((s) => s.id));
    for (const m of [...rows].reverse()) {
      if (need <= 1) break;
      if (already.has(m.id)) continue;
      const amt = round2(m.amount);
      if (paid - amt + 0.05 >= due && amt <= need + 50) {
        // only if removing shrinks excess toward zero without undershoot
        const newPaid = round2(paid - amt);
        if (newPaid + 0.05 >= due) {
          selected.push({ ...m, reason: "trim_latest" });
          already.add(m.id);
          paid = newPaid;
          need = round2(paid - due - t.incentive);
          if (need < 0) need = 0;
        }
      }
    }
  }

  const removeSum = round2(selected.reduce((s, x) => s + Number(x.amount), 0));
  const paidAfter = round2(t.paid - removeSum);
  report.push({
    student: t.student,
    id: t.id,
    due: t.due,
    paid: t.paid,
    unexplained: t.unexplained,
    remove_count: selected.length,
    remove_sum: removeSum,
    paid_after: paidAfter,
    remaining_after: round2(paidAfter - t.due - t.incentive),
    selected: selected.map((s) => ({
      id: s.id,
      amount: Number(s.amount),
      receipt: s.receipt_number,
      date: s.payment_date,
      reason: s.reason,
      notes: s.notes,
    })),
  });
  for (const s of selected) deletions.push({ application_id: t.id, payment_id: s.id, amount: s.amount });
}

console.log(JSON.stringify({ apply, report, deletion_count: deletions.length }, null, 2));
fs.writeFileSync(".temp/overpay-residual-plan.json", JSON.stringify({ apply, report, deletions }, null, 2));

if (apply && deletions.length) {
  let ok = 0;
  let fail = 0;
  for (const d of deletions) {
    const { error } = await supabase.from("manual_payments").delete().eq("id", d.payment_id);
    if (error) {
      fail++;
      console.error("FAIL", d.payment_id, error.message);
    } else ok++;
  }
  console.log("DELETED", ok, "FAILED", fail);
}
