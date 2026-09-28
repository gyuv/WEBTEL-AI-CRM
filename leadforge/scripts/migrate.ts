// Applies migrations (and RLS on Supabase) + seeds demo data. Usage: npm run db:migrate
import { getDbWithMode } from "../lib/db/client";

getDbWithMode().then(({ mode }) => {
  console.log(`✔ Database ready (${mode === "postgres" ? "Postgres/Supabase via DATABASE_URL" : "embedded PGlite in .data/pglite"})`);
  process.exit(0);
}).catch((e) => { console.error(e); process.exit(1); });
