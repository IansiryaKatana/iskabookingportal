/**
 * Download all Supabase Storage buckets recursively to a local folder.
 * Uses service role key from .env.local — no database password required.
 *
 * Usage: node scripts/dump-storage.mjs [outputDir]
 */
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const envPath = join(ROOT, ".env.local");
const envText = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      const key = l.slice(0, i).trim();
      let val = l.slice(i + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return [key, val];
    }),
);

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const outDir = process.argv[2] || join(ROOT, "supabase-dump", "2026-06-02", "storage");
const supabase = createClient(url, key, { auth: { persistSession: false } });

const KNOWN_BUCKETS = ["branding", "studio-media", "documents", "contracts"];

async function listAll(prefix, bucket) {
  const files = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      files.push(...(await listAll(path, bucket)));
    } else {
      files.push(path);
    }
  }
  return files;
}

async function downloadFile(bucket, path, dest) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  await mkdir(dirname(dest), { recursive: true });
  const buf = Buffer.from(await data.arrayBuffer());
  await writeFile(dest, buf);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const manifest = { exported_at: new Date().toISOString(), buckets: {} };

  for (const bucket of KNOWN_BUCKETS) {
    console.log(`Listing bucket: ${bucket}`);
    try {
      const files = await listAll("", bucket);
      manifest.buckets[bucket] = { file_count: files.length, files };
      console.log(`  ${files.length} file(s)`);
      for (const file of files) {
        const dest = join(outDir, bucket, file);
        process.stdout.write(`  downloading ${file}\r`);
        await downloadFile(bucket, file, dest);
      }
      console.log(`  done: ${bucket}`);
    } catch (err) {
      console.warn(`  bucket ${bucket}: ${err.message}`);
      manifest.buckets[bucket] = { error: err.message };
    }
  }

  await writeFile(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nStorage dump complete → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
