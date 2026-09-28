// Seeds demo data (idempotent) and processes queued enrichment jobs. Usage: npm run db:seed
import { getDb } from "../lib/db/client";
import { ensureSeed } from "../lib/seed";
import { runJobs } from "../lib/server/jobs";

(async () => {
  const db = await getDb();
  await ensureSeed(db as never);
  const r = await runJobs(120000);
  console.log(`✔ Seed complete, processed ${r.processed} job(s)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
