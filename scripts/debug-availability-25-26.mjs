#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Load environment variables (matches seed-data.mjs behaviour)
dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config();

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase credentials. Ensure SUPABASE_URL (or VITE_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are set.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const logSection = (title) => {
  console.log("\n=== " + title + " ===");
};

async function main() {
  console.log("Debugging studio availability for academic year 2025/2026…");

  // 1) Find the academic_year_id for 2025/2026 (or 25/26)
  logSection("1. Academic year lookup");
  const { data: years, error: yearError } = await supabase
    .from("academic_years")
    .select("id, name, start_date, end_date, is_active")
    .in("name", ["2025/2026", "25/26"]);

  if (yearError) {
    console.error("Error loading academic_years:", yearError);
    process.exit(1);
  }

  if (!years || years.length === 0) {
    console.log('No academic_year with name "2025/2026" or "25/26" found.');
    process.exit(0);
  }

  const year = years[0];
  console.log("Using academic year:", year);

  // 2) Pull availability per room grade for that academic year (what homepage uses)
  logSection("2. Availability by grade from studio_grade_availability_by_year");
  const { data: availability, error: availError } = await supabase
    .from("studio_grade_availability_by_year")
    .select(
      "studio_grade_id, studio_grade_name, academic_year_id, total_capacity, available_count, reserved_count, occupied_count, maintenance_count, availability_percentage",
    )
    .eq("academic_year_id", year.id)
    .order("studio_grade_name", { ascending: true });

  if (availError) {
    console.error("Error loading studio_grade_availability_by_year:", availError);
    process.exit(1);
  }

  if (!availability || availability.length === 0) {
    console.log("No availability rows found for this academic year.");
  } else {
    console.table(availability);
  }

  const fullyBooked = (availability ?? []).filter(
    (row) => row.available_count === 0,
  );

  if (!fullyBooked.length) {
    console.log(
      "No grades have available_count = 0 for this academic year based on the view.",
    );
    process.exit(0);
  }

  console.log(
    "Grades with available_count = 0:",
    fullyBooked.map((r) => r.studio_grade_name),
  );

  // 3) For those grades, inspect underlying studios (status/allocation)
  const gradeIds = fullyBooked.map((r) => r.studio_grade_id).filter(Boolean);

  if (!gradeIds.length) {
    console.log(
      "No studio_grade_ids found for fully booked grades; nothing more to inspect.",
    );
    process.exit(0);
  }

  logSection("3. Studio status/allocation for fully booked grades");
  const { data: studios, error: studiosError } = await supabase
    .from("studios")
    .select(
      `
        id,
        studio_number,
        studio_grade_id,
        status,
        allocation,
        is_active,
        reservation_expires_at
      `,
    )
    .in("studio_grade_id", gradeIds)
    .order("studio_grade_id", { ascending: true })
    .order("studio_number", { ascending: true });

  if (studiosError) {
    console.error("Error loading studios for fully booked grades:", studiosError);
  } else if (!studios || studios.length === 0) {
    console.log("No studios found for the fully booked grades.");
  } else {
    console.table(studios);
  }

  // 4) Check if any 2025/2026 applications exist that could be blocking capacity
  logSection("4. Applications for this academic year (any status that blocks availability)");
  const { data: apps, error: appsError } = await supabase
    .from("student_applications")
    .select(
      `
        id,
        status,
        assigned_studio_id,
        reserved_studio_expires_at,
        contract:contracts (
          id,
          name,
          academic_year_id
        )
      `,
    )
    .in("status", [
      "draft",
      "awaiting_deposit",
      "awaiting_signature",
      "awaiting_verification",
      "confirmed",
    ]);

  if (appsError) {
    console.error("Error loading student_applications:", appsError);
  } else if (!apps || apps.length === 0) {
    console.log("No student_applications found in blocking statuses.");
  } else {
    const blockingForYear = apps.filter(
      (a) => a.contract && a.contract.academic_year_id === year.id,
    );
    if (!blockingForYear.length) {
      console.log(
        "No applications with blocking statuses found for academic year",
        year.name,
      );
    } else {
      console.log(
        `Found ${blockingForYear.length} applications in blocking statuses for academic year ${year.name}.`,
      );
      console.table(
        blockingForYear.map((a) => ({
          id: a.id,
          status: a.status,
          assigned_studio_id: a.assigned_studio_id,
          reserved_studio_expires_at: a.reserved_studio_expires_at,
          contract_id: a.contract?.id,
          contract_name: a.contract?.name,
        })),
      );
    }
  }

  console.log("\nDebug script completed.");
}

main().catch((err) => {
  console.error("Debug run failed:", err);
  process.exit(1);
});

