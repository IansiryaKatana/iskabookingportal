import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const url = `${SUPABASE_URL}/rest/v1/pg_meta/schemas?select=*`;

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
};

fetch(url, { headers })
  .then(async (res) => {
    console.log(res.status, res.statusText);
    console.log(await res.text());
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


