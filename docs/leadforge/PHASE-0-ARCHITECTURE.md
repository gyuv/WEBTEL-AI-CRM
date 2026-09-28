# LeadForge — Phase 0: Architecture, Structure, Schema, Free-Tier Limits

Status: **Proposal, waiting for approval.** No app code written yet.

## 0. Repo situation (decision needed)

This repo already contains the "Webtel AI Sales Assistant" CRM (Next.js 15, Prisma, Auth.js, SQLite/Postgres). LeadForge overlaps with it (leads, products, pipeline) but has a different data model (people, provenance, jobs, enrichment).

**Recommendation:** build LeadForge as a separate app in `/leadforge` in this repo (a small npm-workspaces monorepo), so the working CRM keeps running and deploying unchanged. Existing product/lead data can be imported later with a one-off script.
Alternatives: (b) replace the existing app, (c) evolve the existing app in place (you'd keep Prisma instead of Drizzle).

Stack note: the spec says Next.js 14+. I'll use **Next.js 15 + React 19** (same as the existing app, current, free).

## 1. Architecture

```
                         ┌──────────────────────────────────────────────┐
  Browser / PWA (phone)  │  Next.js 15 App Router (Vercel free / local)  │
  Chrome ext (MV3) ────► │  UI: Tailwind + shadcn/ui + Framer + TanStack │
                         │  Route handlers /api/*  (zod-validated)       │
                         │  Server actions                               │
                         └───────┬───────────────┬───────────────┬──────┘
                                 │               │               │
                 ┌───────────────▼──┐   ┌────────▼────────┐  ┌───▼──────────────┐
                 │ Data layer        │   │ LLM layer        │  │ Providers        │
                 │ Drizzle ORM       │   │ /lib/llm         │  │ /lib/providers   │
                 │  ├ Postgres       │   │  Gemini (default)│  │  OSM Overpass    │
                 │  │ (Supabase, RLS)│   │  Groq            │  │  Nominatim       │
                 │  └ SQLite (local) │   │  OpenRouter free │  │  Brave/CSE/SearXNG│
                 │ Repos per entity  │   │  Ollama (local)  │  │  Google Places*  │
                 │ source_records    │   │  Mock            │  │  Website crawler │
                 │ (field provenance)│   │ zod JSON, retry, │  │  Directories*    │
                 └────────┬──────────┘   │ fallback, cache  │  │  Public data/RSS │
                          │              └──────────────────┘  │  CSV/paste/manual│
                          │                                    │  Mock            │
                 ┌────────▼───────────────────────────┐        └──────────────────┘
                 │ jobs table (queue)                  │   * off by default
                 │ enrich / discover / people / insight│
                 │ / inbox-sync; idempotency key,      │
                 │ attempts, backoff, progress         │
                 └────────┬──────────────┬─────────────┘
                          │              │
            ┌─────────────▼───┐   ┌──────▼──────────────────┐
            │ In-app runner    │   │ /worker (Node+Playwright)│
            │ (cron route +    │   │ optional, local, polls   │
            │ on-demand tick)  │   │ same jobs table          │
            └──────────────────┘   └──────────────────────────┘
   Cron: Vercel Cron (daily, free) / GitHub Actions (every 15 min) / pg_cron → /api/cron/*
   Realtime progress: Supabase Realtime on jobs; local mode = SSE polling.
```

Key principles:
- **Mode switch**: `DATA_MODE=local|supabase`, `MOCK_MODE=true` → mock LLM + mock providers + seeded fake Chennai leads. Zero keys needed.
- **Provider interface**: `{ id, enabled, rateLimit, search(intent)|enrich(lead), usage }`; each call goes through a shared limiter, retry-with-backoff, response cache (`provider_cache`), and `api_usage` counter.
- **LLM interface**: `generate<T>(task, prompt, zodSchema)` → tries providers in configured order, falls back on 429/5xx/invalid JSON, caches by hash(task+input+model) in `llm_cache`.
- **Provenance**: every enriched value writes a `source_records` row (entity, field, value, source_url, snippet, method found/guessed/inferred, confidence, collected_at). UI shows source badge + confidence; empty → "insufficient data".
- **Compliance guard** module: robots.txt check (robots-parser, cached), identified User-Agent `LeadForgeBot/1.0 (+contact URL)`, per-host delay, hard block list for `linkedin.com` fetching, suppression list checked before any outreach asset is shown as "ready".
- **Manual-first**: no SMTP, no dialer. Only `tel:`, `wa.me`, `mailto:`, Gmail compose links, optional Gmail *draft* creation.
- **Secrets**: API keys stored AES-256-GCM encrypted with `APP_ENCRYPTION_KEY`, only decrypted server-side.

## 2. Folder structure

```
/leadforge
  app/
    (auth)/login
    (app)/
      dashboard/            Today's Focus, KPIs, charts
      discover/             universal input + results table
      leads/ [id]/          drawer + full page: overview, people, insights, assets, timeline
      people/
      pipeline/             kanban (dnd-kit)
      calls/                telecalling desk (mobile-first)
      email/                composer, templates, hygiene guide
      inbox/                replies, classification
      products/ [id]/       catalog, performance, gap finder
      lists/  reports/  settings/ (profile, providers, llm, keys, usage, compliance, data)
    api/
      jobs/ cron/ extension/ import/ export/ llm/ gmail/ ...
    legal/                  privacy + opt-out template
  components/ ui/ (shadcn) layout/ leads/ people/ calls/ ...
  lib/
    db/ schema.pg.ts schema.sqlite.ts client.ts repos/
    llm/ index.ts adapters/{gemini,groq,openrouter,ollama,mock}.ts prompts/ schemas/
    providers/ {osm,nominatim,brave,cse,searxng,places,directory,website,publicdata,csv,mock}.ts
    enrich/ pipeline.ts phones.ts emails.ts techstack.ts dedupe.ts
    people/ search-discovery.ts deeplinks.ts match.ts
    scoring/ lead-score.ts decision-maker.ts
    compliance/ robots.ts useragent.ts suppression.ts dnd.ts
    jobs/ queue.ts runner.ts handlers/
    crypto.ts rate-limit.ts cache.ts usage.ts env.ts
  supabase/migrations/*.sql  supabase/seed.sql
  drizzle/ (sqlite migrations)
  mock/ fixtures (Chennai leads, people, replies)
  tests/ unit (vitest)  e2e (playwright)
  public/ manifest.webmanifest, icons, sw.js
/extension   manifest.json (MV3), content.js (LinkedIn visible-DOM reader on click), popup, options
/worker      index.ts (Playwright job consumer, optional)
```

## 3. Database schema (Postgres; SQLite mirrors it via Drizzle)

All tables: `id uuid pk`, `user_id uuid` (RLS: `user_id = auth.uid()`), `created_at`, `updated_at`.

| Table | Key columns | Constraints / indexes |
|---|---|---|
| profiles | company_name, services, tone, languages[], signature, meeting_link, targets jsonb, settings jsonb (provider toggles, llm order, compliance) | pk = auth user id |
| api_keys | provider, ciphertext, iv, tag, last4 | unique(user_id, provider) |
| products | name, category, short_desc, long_desc, target_industries[], icp, problems_solved[], benefits[], pricing jsonb, usps[], competitors[], case_studies jsonb, objections jsonb, brochure_path, images[], active | unique(user_id, name) |
| searches | raw_input, input_type, parsed_intent jsonb, filters jsonb, result_count | idx(user_id, created_at) |
| leads | name, normalized_name, domain, website, address, area, city, pincode, lat, lng, category, rating, reviews_count, maps_url, socials jsonb, whatsapp, gstin, cin, year_est, size_estimate, status, score, fit/intent/reach scores, starred, owner_notes, dnd_checked, do_not_call, last_enriched_at, search_id | unique(user_id, domain) where domain not null; idx(user_id, status), (user_id, score desc), trigram idx on normalized_name |
| lead_phones | lead_id, person_id?, e164, type mobile/landline, source, dnd_checked | unique(user_id, e164) |
| lead_emails | lead_id, person_id?, email, kind found/guessed, confidence, mx_ok, source_url | unique(lead_id, email) |
| lead_people | lead_id, full_name, normalized_name, title, seniority, role_group, dm_score, profile_url, location, headline, about, activity, source (search/site/extension/paste/csv), priority, icebreaker, connection_note, notes | unique(user_id, profile_url); idx(lead_id) |
| lead_enrichment | lead_id, tech_stack jsonb, site_audit jsonb (ssl, speed, mobile, seo), pages_crawled jsonb, status, error | unique(lead_id) |
| lead_insights | lead_id, kind (summary/pains/signals/match/score/assets/brief), payload jsonb, sources jsonb, model, prompt_hash, stale | unique(lead_id, kind) |
| source_records | entity_type, entity_id, field, value, source_url, snippet, method, confidence, collected_at | idx(entity_type, entity_id) |
| lists / list_leads / tags / lead_tags | name; (list_id, lead_id) | unique pairs |
| saved_views | name, filters jsonb | |
| templates | name, channel email/call/whatsapp/linkedin, subject, body, variables[], is_default | |
| outreach_log | lead_id, person_id, product_id, template_id, channel, subject, body, variant, sent_at (manually logged), gmail_thread_id, message_id | idx(lead_id), idx(gmail_thread_id) |
| messages | lead_id, direction in/out, from, to, subject, body, thread_id, in_reply_to, received_at, classification, confidence, summary, source gmail/paste | unique(user_id, provider_message_id) |
| call_logs | lead_id, person_id, phone, started_at, duration_s, outcome, notes, ai_summary, next_action | idx(lead_id), idx(user_id, started_at) |
| tasks | lead_id, type (call/email/follow_up), due_at, done_at, title, source (manual/auto day3/7/14) | idx(user_id, due_at) where done_at null |
| notes | lead_id, body, voice bool | |
| status_history | lead_id, from_status, to_status, reason, actor (user/ai-suggest-accepted), evidence_id | idx(lead_id) |
| suppression_list | kind email/phone/domain, value, reason (unsubscribe/bounce/DND/manual) | unique(user_id, kind, value) |
| jobs | type, payload jsonb, status queued/running/done/failed/cancelled, attempts, max_attempts, run_after, error, progress 0-100, progress_msg, idempotency_key, locked_by, locked_at | unique(user_id, idempotency_key); idx(status, run_after) |
| api_usage | provider, day, calls, tokens, cost_units | unique(user_id, provider, day) |
| llm_cache / provider_cache | key hash, response jsonb, expires_at | unique(key) |
| audit_log | action, entity, entity_id, diff jsonb, ip | idx(user_id, created_at) |
| notifications | kind, title, body, read_at, lead_id | |

Pipeline statuses (enum): `new, researched, contacted, replied, interested, meeting_booked, proposal, won, lost, unsubscribed`.
Call outcomes (enum): `not_reachable, busy_callback, gatekeeper, interested, send_details, meeting_booked, not_interested, wrong_number, dnd`.

## 4. Free-tier limits (to verify at build time; providers change these often)

| Service | Free allowance (approx.) | Card needed? | Default | How LeadForge protects quota |
|---|---|---|---|---|
| Supabase | 500 MB DB, 1 GB storage, 50k MAU, 2 projects; pauses after 7 days idle | No | Optional (local SQLite otherwise) | Pagination, cache, storage size check |
| Vercel Hobby | 100 GB bandwidth, function timeout ~60s, cron once/day | No | Optional | Long jobs chunked; GitHub Actions cron for frequent ticks |
| GitHub Actions | 2,000 min/month private (unlimited public) | No | Optional cron | 15-min schedule |
| Google Gemini API | Flash models: roughly 10–15 RPM, ~250–1,500 req/day depending on model | No | **Default LLM** | llm_cache, fallback, usage meter |
| Groq | ~30 RPM, ~1k–14k req/day per model | No | Fallback #1 | same |
| OpenRouter `:free` models | ~20 RPM, 50 req/day (1,000 if $10 credit ever bought) | No | Fallback #2 | same |
| Ollama | Unlimited, local, offline | No | Fallback #3 / offline | — |
| OSM Overpass | Fair use, ~10k queries/day, ≤2 concurrent | No | **On** | 1 req/s limiter, cache 7 days |
| Nominatim | 1 req/s, must set UA, no bulk | No | **On** | limiter + cache 30 days |
| Brave Search API | Free plan ~2,000 queries/month, 1 q/s (now asks for card for verification in some regions) | **Possibly** | Off, BYO key | ⚠ I'll confirm with you before relying on it |
| Google Programmable Search | 100 queries/day free | No | Off, BYO key | daily cap |
| SearXNG self-hosted | Unlimited (your Docker) | No | Off | — |
| Google Places API (New) | Monthly free usage credit per SKU; **requires billing account/card** | **Yes** | **Off** | Field mask, hard daily budget guard, confirmation dialog |
| Gmail API | Free, 1B quota units/day; OAuth app in "testing" works for your own account | No | Off | read-only + compose scopes only |
| Web Speech API | Free in Chrome/Edge | No | On | — |
| DNS MX check | Free (Node dns / DNS-over-HTTPS) | No | On | cache |

Card-required items (Google Places, possibly Brave) will ship as disabled toggles with a warning, per your rule.

## 5. Compliance summary
- No LinkedIn fetching or login automation; only search-API snippets, deep links that open in your browser, click-to-capture of visible DOM via the extension, and your own CSV exports.
- robots.txt respected and logged ("skipped: disallowed by robots.txt") per URL.
- Guessed emails always labelled "Guessed (xx%)", never "verified".
- TRAI DND/NDNC warning on every call card; manual "DND checked" flag; do-not-call list enforced.
- Opt-out line in every email template; unsubscribe replies auto-suppress and never get reply drafts.
- DPDP: business contact data only, purpose note, export + delete-all, /legal privacy + opt-out template.

## 6. Phase plan and tests
Each phase: build → `typecheck` + `lint` + `vitest` (+ Playwright from Phase 3) → run in mock mode → commit + push → summary + config checklist → wait for your go-ahead.

## 7. Questions for you
1. Repo layout: new `/leadforge` app alongside the existing CRM (recommended), replace it, or evolve it?
2. Next.js 15 instead of 14 OK?
3. Local mode first (SQLite, no accounts) as the primary dev path, with Supabase added in Phase 1 as the second mode — OK?
