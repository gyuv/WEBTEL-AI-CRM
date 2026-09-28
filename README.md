# Webtel AI Sales Assistant

> **New: [LeadForge](leadforge/README.md)** is a free lead-intelligence and sales-assist app for solo sellers, in `leadforge/`. It finds leads, enriches them, maps people, analyses pain points, writes pitches, and runs the call desk, inbox and pipeline. Run it with `cd leadforge && npm run setup && npm run dev`.

A personal CRM and AI sales assistant for a Senior Relationship Manager at a software/cloud sales company. It tracks a lead from its source all the way to post-sale revenue:

**Lead Source → Lead → Qualification → Demo → Quotation → Negotiation → Won/Lost → Customer → Sales**

Lead Source is a first-class entity. That makes it possible to report **Source → Leads → Demos → Quotations → Won → Revenue** for every source and campaign.

## Features

- **No login by default (personal mode):** the app opens straight to the dashboard and you act as a built-in `Owner` admin account. **Anyone who can reach the URL has full access**, so only run it on your own machine or a private network. Set `REQUIRE_LOGIN=true` to turn login back on.
- **Auth (when `REQUIRE_LOGIN=true`):** email/password (Auth.js credentials, bcrypt hashes, JWT session in an HttpOnly cookie). Roles are `ADMIN` and `USER`.
- **Leads:** create, edit, delete, assign, set status, and convert to a customer. You can search, filter by source, campaign, status, priority, city, salesperson, product and date, sort, and page through results. The lead page shows activities, meetings/demos, follow-ups, opportunities, quotations, sales, stage history and AI insights.
- **Lead source capture:** the source dropdown is loaded from the `lead_sources` table. The form then shows the field that fits the source: Referral Name, Event Name, Campaign Name, Partner Name, Employee Name or Source Details.
- **Lead source management (admin):** add, edit and disable sources, and see usage counts. A source that is already used cannot be deleted; you disable it instead.
- **Lead Source Analytics:** for each source it shows leads, contacted, interested, demos (scheduled and completed), quotations, won, lost, sales, pipeline value, conversion % and average deal value. It also has a funnel you can switch by source (Lead-to-Demo, Demo-to-Quotation, Quotation-to-Won and Lead-to-Won percentages), comparison charts and campaign performance.
- **Dashboard:** 12 KPIs and 7 charts, with filters for Today, This Week, This Month, Last Month or a custom range.
- **Reports:** filter by source, campaign, salesperson, product, status and date range, then export to **CSV** or **Excel (.xlsx)**.
- **Customers, opportunities (pipeline board), activities, meetings, follow-ups (today, overdue and upcoming, with notifications), products and sales.**
- **Quotations:** numbered by Indian financial year (`WT/Q/2026-27/0001`) with line and overall discounts and GST. They are printable and can be saved as PDF. Prices come from the product database or from what you type in.
- **AI Sales Assistant** on each lead or customer page: Analyze Lead, Analyze Lead Source, Recommend Products, Sales Pitch, WhatsApp, Email, Handle Objection, Discovery Questions, Demo Plan, Summarize Meeting and Next Best Action. The Next Best Action result has quick buttons for WhatsApp, Email and Create Follow-up.
- **AI Analytics:** ask questions in plain English, for example "Which source has many leads but low conversion?". Answers come from live data through fixed server-side analytics functions. The AI never writes SQL.
- **Global search** covers leads, customers, company names, phone numbers, email addresses, products, opportunities, quotation numbers, lead sources and campaigns.
- **Settings:** profile and password, company details, GST and quotation defaults, lead sources, products, users, AI settings with a usage audit log, and message templates.

## Architecture

```
src/
  auth.ts, auth.config.ts, middleware.ts   Auth.js setup; middleware protects every page (API → 401)
  lib/                                     pure helpers: validators (Zod), quotation-math, funnel, date-range, rate-limit
  server/
    session.ts                             getActor / requireActor / assertAdmin
    services/                              business logic (leads, lead-sources, crm, quotations, analytics, reports, search, settings)
      access.ts                            row-level scoping (ADMIN = all, USER = own + unassigned leads)
    ai/
      context.ts                           builds the fact sheet sent to the AI from the database, and lists missing data
      assistant.ts                         prompts, OpenAI calls, offline fallback, product filtering, audit log
      analytics-tools.ts                   whitelisted read-only analytics tools and question router
  app/
    actions/                               server actions (auth-checked, Zod-validated)
    api/                                   REST: ai/assist, ai/analytics, reports/export, search, notifications, leads
    (app)/…                                pages (App Router, server components)
  components/                              UI (shadcn-style primitives, charts, forms, AI panel)
prisma/schema.prisma, prisma/migrations, prisma/seed.ts
tests/                                     Vitest unit and integration tests (real PostgreSQL)
```

Stack: Next.js 15 (App Router), React 19, strict TypeScript, Tailwind with shadcn-style components, PostgreSQL, Prisma 6, Auth.js v5, Zod, React Hook Form, Recharts, OpenAI SDK, ExcelJS and Vitest.

## Database structure

| Table | Purpose |
|---|---|
| `users` | Salespeople and admins (`role` USER/ADMIN, `active`) |
| `lead_sources` | Master list of sources (`name` unique, `active`) |
| `leads` | Lead with `leadSourceId` FK, `leadSourceDetails`, `campaignName`, `referralName`, `status`, `priority`, `estimatedValue`, `highestStageRank` |
| `lead_status_history` | Audit trail of every stage change |
| `customers` | Linked 1:1 to the originating lead (`leadId`), so source history is kept |
| `opportunities` | Pipeline records, many-to-many with `products` |
| `activities`, `meetings`, `followups` | Interaction history and reminders |
| `products` | Catalog. The AI may only recommend products from here |
| `quotations`, `quotation_items` | GST quotations |
| `sales` | Revenue. Stores `leadId`, so revenue can be split by source |
| `ai_interactions` | Audit log of every AI prompt and response |
| `settings`, `message_templates` | App settings (JSON) and templates |

There are indexes on the analytics and search columns (`leads.leadSourceId`, `status`, `createdAt`, `assignedUserId`, `city`, `campaignName`; composite indexes on `(leadSourceId,status)`, `(leadSourceId,createdAt)` and `(assignedUserId,status)`; `customers.companyName/phone/email`; `opportunities.stage`; `quotations.status`; `sales.saleDate/productId`; `followups (status, followupDate)`).

### How lead sources are modelled

- `leads.leadSourceId → lead_sources.id` uses `ON DELETE RESTRICT`. A source that has leads can only be **disabled**. Disabled sources are hidden from new leads, but existing leads keep them.
- `highestStageRank` records the furthest funnel stage a lead has reached (NEW 0 … WON 7). It never goes down, so a lead that was LOST after a demo still counts toward that source's demo numbers. It moves up automatically when you log activities or demos, send quotations or record sales.
- When a lead becomes a customer, the customer keeps `leadId`. Sales store `leadId`, taking it from the customer when needed. This means source, campaign, referral details and the lead's creation date stay available for revenue analysis.

## Installation

Requirements: Node 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env         # then edit values
```

### PostgreSQL setup

```bash
createdb webtel_crm
createdb webtel_crm_test     # used by the test suite
# or: psql -c "CREATE DATABASE webtel_crm;"
```

### Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | Separate database for `npm test` (its tables are truncated) |
| `REQUIRE_LOGIN` | `false` (default) = no login page, single owner account. `true` = email/password login with roles |
| `AUTH_SECRET` | Random secret, for example `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | `true` when running behind a proxy or on your own host |
| `OPENAI_API_KEY` | Optional. Enables full AI output. Only read on the server |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |
| `AI_RATE_LIMIT_PER_MINUTE` | AI requests allowed per user per minute (default 20) |

### Migrations, seed and dev server

```bash
npx prisma migrate dev       # development (creates and applies migrations)
npm run db:deploy            # production: prisma migrate deploy
npm run db:seed              # default lead sources, products, demo users and DEMO DATA records
npm run dev                  # http://localhost:3000
```

Demo logins created by the seed. These are only used when `REQUIRE_LOGIN=true` (**change these passwords or disable these accounts in production**):

- Admin: `admin@webtel.demo` / `Admin@12345`
- User: `rm@webtel.demo` / `Sales@12345`

If login is on and you see "Invalid email or password", the database usually has no users: run `npm run db:seed`, or create or reset an admin with `npm run create-admin -- you@example.com YourPassword123 "Your Name"`.

The seed adds 10 leads from 10 different sources, 5 customers, 10 activities, 5 opportunities, 5 quotations, 10 follow-ups and 5 sales. Every one of them is marked **DEMO DATA** and none are real customers. Demo product prices are placeholders marked "(DEMO)", so update them under Settings → Products.

## Testing

```bash
npm run typecheck
npm run lint
npm test          # unit + integration tests against TEST_DATABASE_URL
npm run build
```

The tests cover authentication, lead creation, lead source creation, disabling and deletion rules, filtering by source and campaign, row-level access, conversion to customer with source history kept, quotation and GST maths (₹10,000 at 18% gives GST ₹1,800 and a total of ₹11,800), quotation numbering, follow-up buckets, source-wise funnel, sales and pipeline analytics, dashboard totals, AI endpoint authorization (401 and 403), AI audit logging, product catalog filtering, and the natural-language analytics questions.

## AI setup

1. Set `OPENAI_API_KEY` (and `OPENAI_MODEL` if you like) in the server environment.
2. Under Settings → AI you can switch AI on or off, override the model and set the temperature.

How the AI is kept safe:

- The AI receives a structured fact sheet built from the database, plus a list of missing fields. The system prompt forbids making up customers, sources, campaigns, features, prices, sales figures or past interactions.
- Product recommendations are checked against the `products` table after the AI responds, and anything not in the catalog is dropped.
- WhatsApp and email drafts are editable. The Copy, WhatsApp and email-app buttons stay disabled until you tick "I have reviewed and approve". The app never sends anything itself and never changes prices.
- The analytics assistant can only call whitelisted, typed, read-only functions. Their arguments are validated with Zod and access-scoped to the user.
- Every AI call is written to `ai_interactions`. AI calls are rate-limited per user.
- Without an API key, the app falls back to built-in rules: next-action heuristics, template drafts and a question router. The analytics assistant still answers from live data in this mode.

## Deployment

### Vercel

Vercel runs the `vercel-build` script automatically: `prisma generate`, then `prisma migrate deploy` (creates or updates the tables), then loads the default lead sources and products (safe to repeat; existing rows are never changed), then `next build`.

1. In Vercel → Project → Settings → Environment Variables, set `DATABASE_URL` (for all environments, including Build), plus `AUTH_SECRET`. `OPENAI_API_KEY` is optional.
2. If your provider gives a *pooled* connection string (Supabase port 6543, PgBouncer), migrations need the *direct* connection. Use the direct string for `DATABASE_URL`, or run `npx prisma migrate deploy` once from your machine with the direct URL.
3. Optional demo records: run `DATABASE_URL=<vercel db url> npm run db:seed` once from your machine.

### Other hosts

1. Provision PostgreSQL and set the environment variables above. Use a strong `AUTH_SECRET`.
2. `npm ci && npm run db:deploy && npm run build && npm start`. You can also deploy to Vercel or a Node host with build command `npm run build` and run `prisma migrate deploy` during release.
3. Run `npm run db:seed` once to load the lead sources and products. Afterwards, change the demo passwords or disable those users.
4. Serve over HTTPS. Auth.js cookies are `Secure` automatically on HTTPS.
5. The AI rate limiter keeps its counts in memory for each server instance. If you run several instances, swap it for a Redis-backed limiter (`src/lib/rate-limit.ts`).

## Security

- Passwords are hashed with bcrypt (12 rounds). Hashes are never selected into responses.
- Middleware protects every page, and unauthenticated API calls get a 401. Every server action and API route checks the user again on the server.
- Access is checked row by row: a `USER` can only work with leads assigned to them or unassigned, and with records attached to those leads. Admin-only changes (sources, products, users, settings, reassignment) call `assertAdmin`.
- All input is validated with Zod. All database access goes through Prisma, and the raw analytics SQL uses parameterised `Prisma.sql` templates.
- Login attempts are rate-limited per email, and AI calls per user.
- CSV exports are protected against formula injection. Security headers set are `X-Frame-Options`, `nosniff` and `Referrer-Policy`.
- API keys stay on the server and are never exposed to the browser.
