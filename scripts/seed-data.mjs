#!/usr/bin/env node
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";
import process from "process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config();

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase credentials. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const gradeSpecs = [
  {
    name: "Silver",
    slug: "silver",
    displayOrder: 1,
    weeklyPrice: 165,
    shortDescription: "Compact 19-20m² studio with smart storage and private ensuite.",
    longDescription:
      "The Silver Studio delivers great value with dedicated study area, kitchenette, and private bathroom. Ideal for students seeking privacy with all essential comforts, plus access to Urban Hub amenities.",
  },
  {
    name: "Gold",
    slug: "gold",
    displayOrder: 2,
    weeklyPrice: 179,
    shortDescription: "Enhanced layout with larger workspace and premium finishes.",
    longDescription:
      "Gold Studios add extra floor space, upgraded finishes, and dual-aspect lighting. Balance productivity and downtime thanks to generous storage, contemporary design, and full access to community spaces.",
  },
  {
    name: "Platinum",
    slug: "platinum",
    displayOrder: 3,
    weeklyPrice: 205,
    shortDescription: "26m²+ open-plan studio with lounge seating and king-size bed.",
    longDescription:
      "Step up to a Platinum Studio for expansive living, featuring lounge seating, larger kitchen setup, and king-size bed. Enjoy views over Preston alongside the full Urban Hub amenity programme.",
  },
  {
    name: "Rhodium",
    slug: "rhodium",
    displayOrder: 4,
    weeklyPrice: 231,
    shortDescription: "Premium corner studio with panoramic glazing and dining zone.",
    longDescription:
      "Rhodium Studios maximise natural light, with floor-to-ceiling glazing, defined dining zone, and beautiful bespoke joinery. Perfect for residents wanting a statement space with hotel-inspired details.",
  },
  {
    name: "Rhodium Plus",
    slug: "rhodium-plus",
    displayOrder: 5,
    weeklyPrice: 247,
    shortDescription: "Flagship 30m² studio with lounge suite and elevated decor.",
    longDescription:
      "Rhodium Plus is our most generous studio category, combining a separate lounge suite, designer kitchenette, super-king bed, and spa-style ensuite. The true Urban Hub flagship experience.",
  },
];

const academicYearConfig = {
  name: "2026/2027",
  startDate: "2026-09-06",
  endDate: "2027-08-29",
};

const contractTemplates = [
  {
    key: "45",
    weeks: 45,
    slugSuffix: "45-week",
    endsOn: "2027-07-18",
    paymentPlanKey: "three",
    summary:
      "Secure a 45-week tenancy aligned to the standard academic year with three instalment payments.",
    displayOrder: 1,
  },
  {
    key: "51",
    weeks: 51,
    slugSuffix: "51-week",
    endsOn: "2027-08-29",
    paymentPlanKey: "four",
    summary:
      "Extend your stay through summer with a 51-week tenancy and four instalment payments.",
    displayOrder: 2,
  },
];

const paymentPlans = [
  {
    key: "three",
    name: "3 Instalments",
    deposit: 99,
    description:
      "Deposit on booking followed by three evenly split instalments across the tenancy.",
    instalmentOffsets: [90, 180, 270],
  },
  {
    key: "four",
    name: "4 Instalments",
    deposit: 99,
    description:
      "Deposit on booking and four quarterly instalments for longer stay tenancies.",
    instalmentOffsets: [90, 150, 210, 270],
  },
  {
    key: "ten",
    name: "10 Instalments",
    deposit: 99,
    description:
      "Deposit on booking followed by ten monthly instalments for maximum flexibility.",
    instalmentOffsets: [60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
  },
];

const statusMap = {
  vacant: "available",
  available: "available",
  occupied: "occupied",
  maintenance: "maintenance",
  reserved: "reserved",
};

const parseCsv = (csvText) => {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length);
  const headers = lines.shift().split(",").map((header) => header.trim());

  return lines.map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = cells[idx] ?? "";
    });
    return row;
  });
};

const currency = (amount) =>
  Math.round((amount + Number.EPSILON) * 100) / 100;

const upsertAcademicYear = async () => {
  const { data, error } = await supabase
    .from("academic_years")
    .upsert(
      {
        name: academicYearConfig.name,
        start_date: academicYearConfig.startDate,
        end_date: academicYearConfig.endDate,
        is_active: true,
      },
      { onConflict: "name" },
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
};

const upsertStudioGrades = async () => {
  const { data, error } = await supabase
    .from("studio_grades")
    .upsert(
      gradeSpecs.map((grade) => ({
        slug: grade.slug,
        name: grade.name,
        short_description: grade.shortDescription,
        long_description: grade.longDescription,
        display_order: grade.displayOrder,
        max_occupancy: 1,
        is_active: true,
      })),
      { onConflict: "slug" },
    )
    .select("id, slug");

  if (error) throw error;

  return data.reduce((acc, row) => {
    acc[row.slug] = row.id;
    return acc;
  }, {});
};

const upsertStudioGradePrices = async (academicYearId, gradeIds) => {
  const records = gradeSpecs.map((grade) => ({
    academic_year_id: academicYearId,
    studio_grade_id: gradeIds[grade.slug],
    weekly_price: grade.weeklyPrice,
    deposit_amount_override: 99,
    currency_code: "GBP",
    is_active: true,
  }));

  const { error } = await supabase
    .from("studio_grade_prices")
    .upsert(records, { onConflict: "academic_year_id,studio_grade_id" });

  if (error) throw error;
};

const upsertPaymentPlans = async (academicYearId) => {
  const { data: existingPlans, error: existingError } = await supabase
    .from("payment_plans")
    .select("id, name")
    .eq("academic_year_id", academicYearId);

  if (existingError) throw existingError;

  const planIds = {};

  for (const plan of paymentPlans) {
    const existing = existingPlans?.find((item) => item.name === plan.name);
    if (existing) {
      const { error: updateError } = await supabase
        .from("payment_plans")
        .update({
          description: plan.description,
          deposit_amount: plan.deposit,
          is_active: true,
        })
        .eq("id", existing.id);

      if (updateError) throw updateError;
      planIds[plan.key] = existing.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("payment_plans")
        .insert({
          academic_year_id: academicYearId,
          name: plan.name,
          description: plan.description,
          deposit_amount: plan.deposit,
          is_active: true,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;
      planIds[plan.key] = inserted.id;
    }
  }

  for (const plan of paymentPlans) {
    const planId = planIds[plan.key];
    if (!planId) continue;

    await supabase
      .from("payment_plan_installments")
      .delete()
      .eq("payment_plan_id", planId);

    const entries = [
      {
        payment_plan_id: planId,
        sequence: 1,
        label: "Deposit",
        due_date_offset_days: 0,
        amount_type: "fixed",
        amount_value: plan.deposit,
      },
      ...plan.instalmentOffsets.map((offset, idx) => ({
        payment_plan_id: planId,
        sequence: idx + 2,
        label: `Instalment ${idx + 1}`,
        due_date_offset_days: offset,
        amount_type: "percentage",
        amount_value: parseFloat(
          (100 / plan.instalmentOffsets.length).toFixed(4),
        ),
      })),
    ];

    const { error: installmentError } = await supabase
      .from("payment_plan_installments")
      .insert(entries);

    if (installmentError) throw installmentError;
  }

  return planIds;
};

const upsertContracts = async (
  academicYearId,
  gradeIds,
  planIds,
) => {
  const records = [];
  for (const grade of gradeSpecs) {
    for (const template of contractTemplates) {
      const slug = `${grade.slug}-${template.slugSuffix}-2026-2027`;
      const name = `${grade.name} Studio · ${template.weeks} Weeks`;
      records.push({
        slug,
        name,
        academic_year_id: academicYearId,
        studio_grade_id: gradeIds[grade.slug],
        payment_plan_id: planIds[template.paymentPlanKey] ?? null,
        contract_start: academicYearConfig.startDate,
        contract_end: template.endsOn,
        weeks: template.weeks,
        weekly_price_override: grade.weeklyPrice,
        deposit_override: 99,
        summary: template.summary,
        cta_label: "Enquire",
        display_order: template.displayOrder,
        is_active: true,
      });
    }
  }

  const { data, error } = await supabase
    .from("contracts")
    .upsert(records, { onConflict: "slug" })
    .select("id, slug, academic_year_id, studio_grade_id, weeks, weekly_price_override, deposit_override, contract_start, payment_plan_id");

  if (error) throw error;

  for (const contract of data) {
    await supabase
      .from("contract_payment_schedule")
      .delete()
      .eq("contract_id", contract.id);

    const weeklyPrice = contract.weekly_price_override ?? 0;
    const totalRent = weeklyPrice * contract.weeks;
    const deposit = contract.deposit_override ?? 0;
    // Deposit is separate: installments cover full totalRent (not totalRent - deposit)
    const installmentTotal = totalRent;
    const planConfig = paymentPlans.find(
      (plan) => planIds[plan.key] === contract.payment_plan_id,
    );
    const offsets = planConfig?.instalmentOffsets ?? [];

    const schedule = [];
    if (deposit > 0) {
      schedule.push({
        contract_id: contract.id,
        sequence: 1,
        label: "Deposit",
        due_date: contract.contract_start,
        amount: deposit,
      });
    }

    if (installmentTotal > 0 && offsets.length) {
      const count = offsets.length;
      let distributed = 0;
      offsets.forEach((offset, idx) => {
        let amount = installmentTotal / count;
        amount = currency(amount);
        distributed += amount;

        if (idx === count - 1) {
          amount = currency(installmentTotal - (distributed - amount));
        }

        const dueDate = new Date(contract.contract_start);
        dueDate.setDate(dueDate.getDate() + offset);

        schedule.push({
          contract_id: contract.id,
          sequence: schedule.length + 1,
          label: `Instalment ${idx + 1}`,
          due_date: dueDate.toISOString().slice(0, 10),
          amount,
        });
      });
    }

    if (schedule.length) {
      const { error: scheduleError } = await supabase
        .from("contract_payment_schedule")
        .insert(schedule);

      if (scheduleError) throw scheduleError;
    }
  }
};

const upsertStudios = async (rows, gradeIds) => {
  const payload = rows
    .map((row) => {
      const gradeKey = row.room_grade_name?.toLowerCase().replace(/\s+/g, "-");
      const studioGradeId = gradeIds[gradeKey];
      if (!studioGradeId) return null;

      const statusKey = row.status?.toLowerCase();
      const status = statusMap[statusKey] ?? "available";

      return {
        studio_number: row.studio_number,
        studio_grade_id: studioGradeId,
        floor: row.floor,
        status,
        allocation: row.allocation || null,
        is_active: /^true$/i.test(row["is active"]),
      };
    })
    .filter(Boolean);

  if (!payload.length) return;

  const { error } = await supabase
    .from("studios")
    .upsert(payload, { onConflict: "studio_number" });

  if (error) throw error;
};

const main = async () => {
  try {
    console.log("Seeding Supabase with Urban Hub data…");

    const csvPath = path.join(projectRoot, "studios-data.csv");
    const csvContent = await readFile(csvPath, "utf8");
    const studioRows = parseCsv(csvContent);

    const academicYearId = await upsertAcademicYear();
    console.log("✔ Academic year seeded");

    const gradeIds = await upsertStudioGrades();
    console.log("✔ Studio grades seeded");

    await upsertStudioGradePrices(academicYearId, gradeIds);
    console.log("✔ Studio grade prices seeded");

    const planIds = await upsertPaymentPlans(academicYearId);
    console.log("✔ Payment plans seeded");

    await upsertContracts(academicYearId, gradeIds, planIds);
    console.log("✔ Contracts seeded");

    await upsertStudios(studioRows, gradeIds);
    console.log(`✔ ${studioRows.length} studios seeded from CSV`);

    console.log("Seed completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
};

main();

