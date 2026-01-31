/**
 * Optional script: Download featured images from CSV and upload to Supabase storage,
 * then update blog_posts.featured_image_url. Run from website directory with:
 *   node scripts/import-blog-images.mjs [path-to-website-blogs.csv]
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (or env).
 * The CSV should have columns: Slug, Image URL
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Papa from "papaparse";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
// Load .env and then .env.local (local overrides)
dotenv.config({ path: join(root, ".env") });
if (existsSync(join(root, ".env.local"))) {
  dotenv.config({ path: join(root, ".env.local") });
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_ variants) in .env or .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const csvPath = process.argv[2] || join(root, "website blogs.csv");
let csvText;
try {
  csvText = readFileSync(csvPath, "utf-8");
} catch (e) {
  console.error("Failed to read CSV:", csvPath, e.message);
  process.exit(1);
}

const parsed = Papa.parse(csvText, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim(),
  // Lenient: continue on quote/field errors so we still get rows that parsed
  delimitersToGuess: [",", "\t", "|"],
});
if (parsed.errors.length) {
  console.warn("CSV had some parse warnings (continuing with parsed rows):", parsed.errors.slice(0, 3).map((e) => e.message));
}

const allRows = parsed.data || [];
const rows = allRows.filter((r) => {
  if (!r || typeof r !== "object") return false;
  const slug = (r.Slug ?? r["Slug"] ?? "").toString().trim();
  const imageUrl = (r["Image URL"] ?? "").toString().trim();
  return slug && imageUrl && imageUrl.startsWith("http");
});
console.log(`Found ${rows.length} rows with Slug and Image URL (of ${allRows.length} total).`);

async function downloadAndUpload(imageUrl, slug, index) {
  if (!imageUrl || !imageUrl.startsWith("http")) return null;
  try {
    const res = await fetch(imageUrl, { redirect: "follow" });
    if (!res.ok) {
      console.warn(`  [${slug}] Fetch failed ${res.status}: ${imageUrl}`);
      return null;
    }
    const blob = await res.blob();
    const buf = Buffer.from(await blob.arrayBuffer());
    const contentType = blob.type || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : contentType.includes("gif") ? "gif" : "jpg";
    const path = `blog/${slug}-${index}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("website").upload(path, buf, {
      contentType,
      upsert: true,
    });
    if (error) {
      console.warn(`  [${slug}] Upload failed:`, error.message);
      return null;
    }
    const { data: urlData } = supabase.storage.from("website").getPublicUrl(path);
    return urlData.publicUrl;
  } catch (e) {
    console.warn(`  [${slug}] Error:`, e.message);
    return null;
  }
}

let updated = 0;
let failed = 0;
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const slug = (row.Slug || "").trim();
  const imageUrl = (row["Image URL"] || "").trim();
  if (!slug) continue;
  const publicUrl = await downloadAndUpload(imageUrl, slug, i);
  if (!publicUrl) {
    failed++;
    continue;
  }
  const { error } = await supabase.from("blog_posts").update({ featured_image_url: publicUrl }).eq("slug", slug);
  if (error) {
    console.warn(`  [${slug}] DB update failed:`, error.message);
    failed++;
  } else {
    updated++;
    console.log(`  [${slug}] OK -> ${publicUrl}`);
  }
}

console.log(`Done. Updated: ${updated}, failed/skipped: ${failed}.`);
