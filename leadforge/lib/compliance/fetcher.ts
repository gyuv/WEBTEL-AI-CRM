import "server-only";
import robotsParser from "robots-parser";
import { cacheGet, cacheSet } from "../server/core";
import { sleep } from "../utils";

export const USER_AGENT_BASE = "LeadForgeBot/1.0 (personal B2B research; respects robots.txt)";
const BLOCKED_HOSTS = [/(^|\.)linkedin\.com$/i, /(^|\.)facebook\.com$/i, /(^|\.)instagram\.com$/i, /(^|\.)google\.[a-z.]+$/i];
const lastHit = new Map<string, number>();

export function userAgent(contact?: string) {
  return contact ? `${USER_AGENT_BASE}; contact: ${contact}` : USER_AGENT_BASE;
}

export function isBlockedHost(url: string) {
  try { return BLOCKED_HOSTS.some((re) => re.test(new URL(url).hostname)); } catch { return true; }
}

async function robotsFor(origin: string, ua: string) {
  const key = `robots:${origin}`;
  let txt = await cacheGet<string>(key);
  if (txt === null) {
    try {
      const r = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": ua }, signal: AbortSignal.timeout(6000) });
      txt = r.ok ? await r.text() : "";
    } catch { txt = ""; }
    await cacheSet("robots", key, txt, 60 * 60 * 24);
  }
  return robotsParser(`${origin}/robots.txt`, txt);
}

export interface PoliteResult { ok: boolean; url: string; status: number; html?: string; headers?: Record<string, string>; ms?: number; reason?: string }

/** Fetch that enforces: blocked hosts, robots.txt, identified UA, per-host delay, size + time limits. */
export async function politeFetch(url: string, opts: { contact?: string; minDelayMs?: number } = {}): Promise<PoliteResult> {
  if (isBlockedHost(url)) return { ok: false, url, status: 0, reason: "host is never fetched (ToS)" };
  const ua = userAgent(opts.contact);
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, url, status: 0, reason: "invalid url" }; }
  const robots = await robotsFor(u.origin, ua);
  if (robots.isDisallowed(url, "LeadForgeBot")) return { ok: false, url, status: 0, reason: "disallowed by robots.txt" };
  const delay = Math.max(opts.minDelayMs ?? 1000, (robots.getCrawlDelay("LeadForgeBot") ?? 0) * 1000);
  const wait = (lastHit.get(u.host) ?? 0) + delay - Date.now();
  if (wait > 0) await sleep(Math.min(wait, 10000));
  lastHit.set(u.host, Date.now());
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml,application/xml" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
    const ms = Date.now() - t0;
    const ct = r.headers.get("content-type") ?? "";
    if (!r.ok) return { ok: false, url: r.url, status: r.status, ms, reason: `HTTP ${r.status}` };
    if (!/html|xml|text/i.test(ct)) return { ok: false, url: r.url, status: r.status, ms, reason: `skipped content-type ${ct}` };
    const html = (await r.text()).slice(0, 1_500_000);
    if (/captcha|cf-challenge|are you a robot/i.test(html.slice(0, 5000)) && html.length < 20000) return { ok: false, url: r.url, status: r.status, ms, reason: "bot challenge — skipped (no bypass)" };
    const render = (globalThis as { __lfRender?: (u: string, ua: string) => Promise<string | null> }).__lfRender;
    const visibleText = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (render && visibleText.length < 400) {
      // JS-rendered page: the optional local Playwright worker renders it (same robots/UA rules already applied).
      const rendered = await render(r.url, ua).catch(() => null);
      if (rendered) return { ok: true, url: r.url, status: r.status, html: rendered, ms: Date.now() - t0, headers: Object.fromEntries(r.headers.entries()) };
    }
    return { ok: true, url: r.url, status: r.status, html, ms, headers: Object.fromEntries(r.headers.entries()) };
  } catch (e) {
    return { ok: false, url, status: 0, reason: (e as Error).message.slice(0, 100) };
  }
}
