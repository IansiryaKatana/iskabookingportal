import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { SUPABASE_DB_PASSWORD, SUPABASE_URL } = process.env;

if (!SUPABASE_DB_PASSWORD || !SUPABASE_URL) {
  console.error("Missing Supabase database credentials");
  process.exit(1);
}

const sql = process.argv.slice(2).join(" ").trim();

if (!sql) {
  console.error("No SQL provided. Usage: node scripts/run-sql.mjs \"<SQL>\"");
  process.exit(1);
}

const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
async function run() {
  const client = new pg.Client({
    host: "aws-1-ap-southeast-1.pooler.supabase.com",
    port: 6543,
    user: "postgres",
    password: SUPABASE_DB_PASSWORD,
    database: "postgres",
    ssl: { rejectUnauthorized: false, servername: "aws-1-ap-southeast-1.pooler.supabase.com" },
    options: `project=${projectRef}`,
  });

  try {
    await client.connect();
    const result = await client.query(sql);
    console.log(JSON.stringify(result.rows, null, 2));
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("Failed to execute SQL:", error);
  process.exit(1);
});


