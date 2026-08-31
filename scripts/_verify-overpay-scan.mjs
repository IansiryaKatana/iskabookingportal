import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false },
});
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const { data: apps } = await supabase
  .from("student_applications")
  .select("id, student_id, status");
const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name");
const pmap = new Map((profiles || []).map((p) => [p.id, p]));
const { data: cbs } = await supabase
  .from("application_cashbacks")
  .select("application_id, cashback_amount");
const { data: dcs } = await supabase
  .from("application_discounts")
  .select("application_id, discount_amount");
const cbMap = new Map();
const dcMap = new Map();
for (const r of cbs || [])
  cbMap.set(r.application_id, (cbMap.get(r.application_id) || 0) + Number(r.cashback_amount || 0));
for (const r of dcs || [])
  dcMap.set(r.application_id, (dcMap.get(r.application_id) || 0) + Number(r.discount_amount || 0));

const out = [];
for (const a of apps || []) {
  const { data } = await supabase.rpc("get_payment_summary", { p_application_id: a.id });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) continue;
  const due = Number(row.total_due || 0);
  const paid = Number(row.total_paid || 0);
  if (paid <= due + 1) continue;
  const incentive = round2((cbMap.get(a.id) || 0) + (dcMap.get(a.id) || 0));
  const excess = round2(paid - due);
  const unexplained = round2(excess - incentive);
  if (unexplained <= 1) continue;
  const p = pmap.get(a.student_id);
  const student = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : "";
  out.push({
    student,
    status: a.status,
    due,
    paid,
    excess,
    incentive,
    unexplained,
    id: a.id,
  });
}
out.sort((a, b) => b.unexplained - a.unexplained);
console.log(
  JSON.stringify(
    {
      count: out.length,
      sum: round2(out.reduce((s, x) => s + x.unexplained, 0)),
      rows: out,
    },
    null,
    2
  )
);
