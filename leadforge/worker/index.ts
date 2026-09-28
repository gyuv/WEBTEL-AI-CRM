/**
 * Optional local worker (free). Processes the same `jobs` table as the web app, and — if Playwright is
 * installed — renders JavaScript-heavy company websites that plain fetch can't read.
 *
 *   npm run worker                 # uses DATABASE_URL (Supabase) or the local embedded DB
 *   npm i -D playwright && npx playwright install chromium   # optional, enables JS rendering
 *
 * It never logs in anywhere, never solves captchas, and never visits LinkedIn (blocked in politeFetch).
 */
import { runJobs } from "../lib/server/jobs";
import { detectCold } from "../lib/server/inbox";

async function setupRenderer() {
  try {
    const mod = "playwright";
    const { chromium } = await import(/* webpackIgnore: true */ mod);
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    (globalThis as { __lfRender?: (u: string, ua: string) => Promise<string | null> }).__lfRender = async (url: string, ua: string) => {
      const ctx = await browser.newContext({ userAgent: ua });
      const page = await ctx.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
        return await page.content();
      } finally { await ctx.close(); }
    };
    console.log("✔ Playwright renderer enabled");
  } catch {
    console.log("ℹ Playwright not installed — static fetch only (that's fine).");
  }
}

async function main() {
  await setupRenderer();
  let lastCold = 0;
  console.log("LeadForge worker running. Ctrl+C to stop.");
  for (;;) {
    const r = await runJobs(55000).catch((e) => { console.error(e); return { processed: 0 }; });
    if (r.processed) console.log(`${new Date().toLocaleTimeString()} processed ${r.processed} job(s)`);
    if (Date.now() - lastCold > 6 * 3600_000) { await detectCold("owner").catch(() => undefined); lastCold = Date.now(); }
    await new Promise((res) => setTimeout(res, r.processed ? 500 : 5000));
  }
}

main();
