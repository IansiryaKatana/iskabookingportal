import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
  auth: { persistSession: false },
});

const targets = JSON.parse(fs.readFileSync(".temp/overpay-verify-scan.json", "utf8")).rows;
const out = [];

for (const t of targets.slice(0, 10)) {
  const { data: manuals } = await supabase
    .from("manual_payments")
    .select("id, amount, payment_date, receipt_number, notes, created_at, instalment_id")
    .eq("application_id", t.id)
    .eq("payment_type", "instalment")
    .order("payment_date", { ascending: true });

  const { data: inst } = await supabase
    .from("instalments")
    .select("id, amount, due_date, sequence")
    .eq("application_id", t.id)
    .order("sequence", { ascending: true });

  out.push({
    student: t.student,
    due: t.due,
    paid: t.paid,
    excess: t.excess,
    unexplained: t.unexplained,
    payments: (manuals || []).map((m) => ({
      id: m.id,
      amount: Number(m.amount),
      date: m.payment_date,
      receipt: m.receipt_number,
      notes: m.notes,
      instalment_id: m.instalment_id,
    })),
    schedule: (inst || []).map((i) => ({
      id: i.id,
      amount: Number(i.amount),
      due: i.due_date,
      seq: i.sequence,
    })),
  });
}

fs.writeFileSync(".temp/overpay-residual-detail.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
