# LeadForge

LeadForge is a free lead-intelligence and sales-assist app for a solo salesperson (it defaults to Chennai). It does six things:

- **Finds** leads from whatever you give it: a natural-language query, company names, URLs, Google Maps links or a CSV/Excel file.
- **Enriches** each lead: website, phones, emails, tech stack and a site audit.
- **Maps people**: finds the people at each company without scraping LinkedIn.
- **Analyses pain points** and **matches them to your products**. Every claim cites a source.
- **Writes** call scripts (English, Tamil, Tanglish), cold emails, follow-ups, WhatsApp and LinkedIn messages.
- **Tracks** calls, replies and pipeline status.

**Manual-first.** LeadForge prepares everything; you place the calls and send the emails yourself. It never auto-sends or auto-dials.

**100% free.** It runs on free tiers only, with local and open-source fallbacks. Anything that needs a card is optional and off by default.

---

## Quick start (no accounts, 2 minutes)

```bash
cd leadforge
npm run setup      # install, create the embedded database, seed demo data and process it
npm run dev        # http://localhost:3100
```

The app starts in **mock mode**, which uses realistic fake Chennai data and the rule-based AI engine, so every screen works right away. Switch to live data under **Settings → Data sources → Switch to live data**.

Requirements: Node 20 or later. No Docker, no Postgres install and no API keys. The database is [PGlite](https://pglite.dev), a real Postgres compiled to WASM, stored in `.data/`.

## Going live for free (cloud)

| Step | Service (free tier) | What to do |
|---|---|---|
| 1 | **Supabase** (database) | Create a project at supabase.com. Go to Project Settings → Database → *Connection string* and copy the **Transaction pooler** URI (port 6543). |
| 2 | **Vercel** (hosting) | Import the GitHub repo and set **Root Directory = `leadforge`**. Add the env vars `DATABASE_URL`, `APP_PASSWORD`, `APP_ENCRYPTION_KEY` and `CRON_SECRET`. Deploy. Migrations and row-level security (RLS) apply automatically on the first request, or run `npm run db:migrate` locally with `DATABASE_URL` set. |
| 3 | **Gemini** (default AI) | Get a key at aistudio.google.com/apikey (no card) and paste it in Settings → API keys, or set `GEMINI_API_KEY`. |
| 4 | Optional fallbacks | Groq key, OpenRouter key, or [Ollama](https://ollama.com) on your PC (`ollama pull llama3.1`; unlimited and offline). |
| 5 | Optional web search | Google Programmable Search (100/day), a self-hosted SearXNG (unlimited), or Brave. This enables people discovery (public search snippets) and "names → website" lookup. |
| 6 | Optional Gmail | See [Gmail](#gmail-optional). |
| 7 | Frequent background jobs | Vercel Hobby allows one cron per day (already configured in `vercel.json`). For 15-minute ticks, enable `.github/workflows/leadforge-cron.yml`: set repo secrets `LEADFORGE_URL` and `CRON_SECRET`, and repo variable `LEADFORGE_CRON_ENABLED=true`. Opening any page also processes pending jobs. |
| 8 | Phone | Open the site on your phone and choose *Add to Home Screen* (it's a PWA). The Call desk is built for one-handed use. |

For brochures to persist on Vercel, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and create a **public** Storage bucket named `brochures`.

### Free-tier limits and the guards LeadForge applies

| Service | Free allowance (approx.) | Card? | Default | Guard |
|---|---|---|---|---|
| Supabase | 500 MB DB, 1 GB storage; pauses after 7 idle days | No | optional | the daily cron keeps it awake |
| Vercel Hobby | 1 daily cron, about 60 s functions | No | optional | jobs are chunked and resumable |
| Gemini | about 250 requests/day on Flash | No | **default LLM** | DB cache, daily cap, fallback |
| Groq | about 1,000+ requests/day | No | fallback 1 | same |
| OpenRouter `:free` | 50 requests/day | No | fallback 2 | same |
| Ollama | unlimited (local) | No | fallback 3 | — |
| OSM Overpass / Nominatim | fair use, 1 request/s | No | **on** | throttle, 7–30 day cache |
| Google Programmable Search | 100/day | No | off | daily cap |
| Brave Search | about 2,000/month | maybe | off | daily cap |
| **Google Places** | billing required | **yes** | **off** | field mask, hard daily budget, confirmation dialog |
| Gmail API | very generous | No | off | read-only scope by default |

Live counters are under **Settings → Usage**, with warnings at 80%. Calls stop automatically at each limit.

## Features by phase

1. **Foundation**: design system (light and dark themes, glass cards, ⌘K command palette, `G`+key navigation), password gate, Settings, the DB schema with RLS, and mock mode.
2. **My products**: full CRUD, AI auto-fill from a URL, pasted text or a PDF brochure, per-product performance, and a **Gap finder** (common pain points none of your products cover).
3. **Discovery and enrichment**:
   - **Universal input**: auto-detects the input type and parses the intent.
   - **Pluggable providers**: OSM, Nominatim, Places, web search, CSV and more.
   - **Background enrichment**: a polite website crawl that respects robots.txt and sends an identified User-Agent.
   - **Contacts**: E.164 phones classified as mobile or landline; emails labelled **Found** or **Guessed (x%)** with an MX check.
   - **Site checks**: tech stack detection and a site audit.
   - **Data quality**: fuzzy dedupe, and a source record (provenance) for every field.
   - **Leads table**: virtualized, with bulk actions, CSV/XLSX export and a quick-view drawer.
4. **People**:
   - (A) public search-API snippets. LeadForge never fetches linkedin.com.
   - (B) people found on the company's own site, including schema.org Person data.
   - (C) one-click LinkedIn and Google X-ray deep links that open in *your* browser.
   - (D) a Chrome/Edge extension that captures only what you are viewing when you click, plus a paste box and LinkedIn CSV import.
   - A coverage indicator plus a "search this role next" hint.
   - For each person: a decision-maker score, a guessed email (clearly labelled), an icebreaker and a connection note under 300 characters.
5. **AI pitch engine**:
   - **Evidence**: an evidence list is built for each lead, and the LLM may only cite those evidence IDs; unsupported claims are stripped.
   - **Analysis**: pain points, buying signals, digital maturity, the top 3 products to pitch with reasoning, the best person to target, objections with rebuttals, and a score (Fit + Intent + Reach) with a "why now" line.
   - **Assets**: 30-second and 2-minute scripts in English, தமிழ் and Tanglish, a voicemail script, gatekeeper lines, 3 A/B emails with a spam and length check, Day 3/7/14 follow-ups plus a break-up email, WhatsApp and LinkedIn messages, and an objection sheet.
   - **Prep sheet**: a printable page per lead.
6. **Call desk and email**:
   - **Call desk**: a phone-first queue with a large Call button, WhatsApp, live script, 9 outcome shortcuts (1–9) and a timer.
   - **Notes**: voice-to-text (Web Speech API), AI next actions, and follow-ups scheduled automatically.
   - **Call-time help**: best time to call, a TRAI DND warning and a do-not-call list.
   - **Email**: templates with variables, mailto, Gmail compose or Gmail *draft*, an "I sent this" log that creates Day 3/7/14 reminders, mail-merge CSV export and a sending-hygiene guide.
7. **Inbox**:
   - **Getting replies in**: optional Gmail sync (read-only), or paste a reply.
   - **Classification**: 12 reply classes with confidence and a one-line summary.
   - **Status**: automatic pipeline status updates with an audit trail and manual override.
   - **Replies**: 2–3 draft replies (none for unsubscribes or bounces). Unsubscribes and bounces are suppressed automatically.
   - **Cold leads**: detected after N silent days, with re-engagement tasks.
8. **Pipeline and analytics**:
   - **Board**: drag-and-drop kanban with optimistic updates.
   - **Dashboard**: KPIs, funnel, 14-day trend, streaks and daily targets, plus a "Today's Focus" summary.
   - **Reports**: breakdowns by industry, template and call outcome, and a printable weekly report.
   - **Data**: backup and restore, and delete-all.

## Lead scraper tab

- **Quick search**:
  - Type a business type and a location, then press Search.
  - You get a table of company name, phone, email, website and address, which fills itself in.
  - Sort by new entries, popular/most visited (review count), top rated, phone first or has email.
  - Filter to companies with a phone, email or website.
  - Export to Excel/CSV, or go straight to the Call desk.
- **Area sweep**: many categories × many areas in one click.
- **Website / directory scraper**: paste any list page. It extracts every business on it and follows "Next" pages, respecting robots.txt.
- **Google Maps capture**: search Maps yourself, then one extension click saves every listing on screen.
- **Bulk paste**: any text containing phone numbers becomes leads.

Sources, in the order they are used:
1. **Google Places API**: Google's official data. Needs your own key with billing enabled. It is capped at 30 requests/day by default (about 900/month) to stay inside Google's free monthly allowance; check your usage in Google Cloud.
2. **OpenStreetMap**: always free, no key.
3. **Website finder**: when a lead has no website, free web search (Google Programmable Search, SearXNG or Brave) finds it, then the site's contact pages are read for emails and phones.

Google Maps pages are never scraped automatically.

## Architecture

```
Browser / PWA ─┬─ Next.js 15 (App Router, RSC + server actions) ── Vercel or local
Extension (MV3)┘        │
                        ├─ lib/db        Drizzle ORM → Postgres (Supabase)  |  PGlite (local, zero-setup)
                        ├─ lib/llm       Gemini → Groq → OpenRouter → Ollama → rule engine  (zod-validated, DB-cached)
                        ├─ lib/providers OSM Overpass, Nominatim, Places*, Brave/CSE/SearXNG, mock   (*off by default)
                        ├─ lib/compliance politeFetch: robots.txt, UA, per-host delay, blocked hosts, no captcha bypass
                        ├─ lib/server    leads, enrich, people, inbox, analytics, jobs (queue with retries/backoff)
                        └─ lib/ai        evidence builder, rule engine, sanitizer, prompts
Jobs table ◄── processed by: page loads (after()), /api/cron/tick (Vercel/GitHub Actions), worker/ (optional Playwright)
```

- `supabase/migrations/*.sql` holds the migrations, generated by `drizzle-kit` from `lib/db/schema.ts`.
- `supabase/policies/rls.sql` holds the RLS policies, which apply automatically on Supabase.
- Every table has `user_id`, and every query filters by it.

## Gmail (optional)

1. In console.cloud.google.com, create a project, enable the **Gmail API** and set up an OAuth consent screen (External). Add yourself as a *test user*; personal use needs no verification.
2. Go to Credentials → OAuth client ID → **Web application**. Set the redirect URI to `https://YOUR-APP/api/gmail/callback` (and `http://localhost:3100/api/gmail/callback` for local use).
3. Paste the client ID and secret into Settings → API keys, then go to Settings → Gmail → **Connect (read-only)**. Use **Connect with drafts** to also allow creating drafts.

## Browser extension

1. Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and select the `leadforge/extension` folder.
2. In LeadForge, go to Settings → Extension → **Generate token**. Paste the URL and token into the extension's options.
3. On a profile or company *People* page you are viewing, click the extension, then **Read this page** and **Send to LeadForge**.

The extension reads only what is on screen, only when you click. It does no scrolling, pagination or automation.

## Optional local worker (JS-heavy sites)

```bash
npm i -D playwright && npx playwright install chromium   # optional
npm run worker
```

The worker processes the same jobs table and renders JavaScript-only websites. robots.txt and the blocked-host list still apply.

## Compliance

- **Crawling**: robots.txt is respected and disallowed pages are logged. The crawler identifies itself with your contact details. There is no captcha or login bypass, and LinkedIn, Facebook, Instagram and Google are never fetched.
- **Data honesty**: guessed emails are never presented as verified. Every fact carries its source URL, collection date and confidence, and thin data is shown as "insufficient data".
- **Calls**: TRAI NCPR/DND warning, a manual "DND checked" flag, and a do-not-call list.
- **Emails**: an opt-out line in every template, and automatic suppression on unsubscribe or bounce replies.
- **Personal data**: only business contact data is stored (DPDP Act awareness). Export and delete-all are available, and `/legal` has a privacy and opt-out template.

## Development

```bash
npm run dev          # http://localhost:3100
npm test             # Vitest: parsers, dedupe, scoring, classification, rule engine
npm run e2e          # Playwright main flows (uses a fresh DB in .data/e2e)
npm run typecheck
npm run db:generate  # regenerate SQL migration after editing lib/db/schema.ts
npm run worker       # optional background worker
```
