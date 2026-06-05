import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env.local") });
dotenv.config();

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error("Usage: node scripts/run-migration-file.mjs <migration-file>");
  process.exit(1);
}

const { SUPABASE_DB_PASSWORD, SUPABASE_URL } = process.env;
if (!SUPABASE_DB_PASSWORD || !SUPABASE_URL) {
  console.error("Missing SUPABASE_DB_PASSWORD or SUPABASE_URL");
  process.exit(1);
}

const sqlPath = path.isAbsolute(migrationFile)
  ? migrationFile
  : path.join(projectRoot, migrationFile);

const sql = fs.readFileSync(sqlPath, "utf8");
const version = path.basename(sqlPath).split("_")[0];
const name = path.basename(sqlPath, ".sql");
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];

const client = new pg.Client({
  host: "aws-1-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: `postgres.${projectRef}`,
  password: SUPABASE_DB_PASSWORD,
  database: "postgres",
  ssl: {
    rejectUnauthorized: false,
    servername: "aws-1-ap-southeast-1.pooler.supabase.com",
  },
});

try {
  await client.connect();
  console.log(`Running migration: ${name}`);
  await client.query(sql);
  await client.query(
    `INSERT INTO supabase_migrations.schema_migrations (version, name)
     VALUES ($1, $2)
     ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name`,
    [version, name],
  );
  console.log("Migration applied and recorded successfully.");
} catch (error) {
  console.error("Migration failed:", error.message);
  process.exit(1);
} finally {
  await client.end();
}
