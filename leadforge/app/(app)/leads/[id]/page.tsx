import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Globe, MapPin, Phone, FileText, ExternalLink, AlertTriangle, Linkedin, Search, Users, Info, Printer, MessageCircle, Clock, StickyNote, ArrowRight, PhoneCall, Send, Inbox as InboxIcon } from "lucide-react";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { getLeadBundle } from "@/lib/server/leads";
import { Badge, Card, CardBody, CardHeader, ConfidenceBadge, ScoreRing, buttonClass } from "@/components/ui";
import { Tabs } from "@/components/client";
import { AddContact, AssetsPanel, EnrichButtons, FlagToggles, NotesBox, PeopleTools, PersonActions, StatusControl, TaskAdder } from "./lead-client";
import { STATUS_TONE } from "../leads-table";
import { linkedinDeepLinks } from "@/lib/people/deeplinks";
import { suggestNextRole } from "@/lib/people/roles";
import { fmtDate, fmtDateTime, statusLabel, timeAgo } from "@/lib/utils";
import { waLink } from "@/lib/leadgen/phones";
import type { Analysis, Assets, Evidence } from "@/lib/ai/schemas";
import type { ScoreResult } from "@/lib/leadgen/scoring";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, userId } = await ctx();
  const b = await getLeadBundle(userId, id);
  if (!b) notFound();
  const { lead } = b;
  const products = await db.select({ id: schema.products.id, name: schema.products.name }).from(schema.products).where(and(eq(schema.products.userId, userId), eq(schema.products.active, true)));
  const suppressed = (await db.select().from(schema.suppressionList).where(eq(schema.suppressionList.userId, userId))).map((s) => s.value);
  const analysis = b.insights.analysis?.payload as (Analysis & { evidence: Evidence[]; warnings?: string[] }) | undefined;
  const assets = b.insights.assets ? { ...(b.insights.assets.payload as unknown as Assets), model: b.insights.assets.model ?? undefined } : null;
  const score = b.insights.score?.payload as unknown as ScoreResult | undefined;
  const evidence = new Map((analysis?.evidence ?? []).map((e) => [e.id, e]));
  const audit = (b.enrichment?.audit ?? {}) as Record<string, unknown>;
  const dms = b.people.filter((p) => p.dmScore >= 70).length;
  const nextRole = suggestNextRole(b.people.map((p) => p.roleGroup ?? ""));
  const links = linkedinDeepLinks(lead.name, lead.city, lead.socials?.linkedin?.includes("/company/") ? lead.socials.linkedin : null);
  const mobile = b.phones.find((p) => p.kind === "mobile") ?? b.phones[0];
  const isMock = lead.primarySource === "mock" || Boolean(audit.mock);

  const timeline = [
    ...b.history.map((h) => ({ at: h.createdAt, icon: ArrowRight, title: `Status: ${statusLabel(h.fromStatus ?? "—")} → ${statusLabel(h.toStatus)}`, body: `${h.reason ?? ""} (${h.actor})` })),
    ...b.calls.map((c) => ({ at: c.startedAt, icon: PhoneCall, title: `Call · ${statusLabel(c.outcome)}${c.durationS ? ` · ${Math.round(c.durationS / 60)}m` : ""}`, body: c.notes ?? "" })),
    ...b.outreach.map((o) => ({ at: o.sentAt, icon: Send, title: `${o.channel} sent${o.variant ? ` (${o.variant})` : ""}: ${o.subject ?? ""}`, body: `To ${o.toAddress ?? ""}` })),
    ...b.msgs.map((m) => ({ at: m.receivedAt, icon: InboxIcon, title: `Reply · ${statusLabel(m.classification ?? "")} (${m.confidence}%)`, body: m.summary ?? m.body.slice(0, 200) })),
    ...b.notes.map((n) => ({ at: n.createdAt, icon: StickyNote, title: "Note", body: n.body })),
  ].sort((a, c) => c.at.getTime() - a.at.getTime());

  const SourceChip = ({ field }: { field: string }) => {
    const s = b.sources.find((x) => x.field === field);
    if (!s) return null;
    return <span title={`${s.provider} · ${fmtDate(s.collectedAt)}${s.snippet ? ` · ${s.snippet}` : ""}`} className="ml-1 cursor-help rounded bg-muted px-1 text-[10px] text-muted-fg">{s.provider}</span>;
  };

  return (
    <>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <ScoreRing value={lead.score} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold tracking-tight">{lead.name}</h1><Badge tone={STATUS_TONE[lead.status]}>{statusLabel(lead.status)}</Badge>{isMock && <Badge tone="warning">mock data</Badge>}{lead.doNotCall && <Badge tone="danger">Do-not-call</Badge>}</div>
            <p className="mt-0.5 text-sm text-muted-fg">{[lead.category, lead.area, lead.city].filter(Boolean).join(" · ")}{lead.rating ? ` · ★ ${lead.rating} (${lead.reviewsCount ?? 0})` : ""}</p>
            {score && <p className="mt-1 text-xs text-muted-fg">Fit {score.fit} · Intent {score.intent} · Reach {score.reach} — <span className="text-fg">{score.whyNow}</span></p>}
          </div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <StatusControl leadId={lead.id} status={lead.status} />
          <a href={`/calls?lead=${lead.id}`} className={buttonClass("primary")}><Phone className="h-4 w-4" /> Call</a>
          <a href={`/leads/${lead.id}/brief`} className={buttonClass("outline")}><Printer className="h-4 w-4" /> Prep sheet</a>
        </div>
      </div>

      <Tabs storageKey="lf:leadtab" tabs={[
        { id: "overview", label: "Overview", content: (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Company" action={<EnrichButtons leadId={lead.id} />} />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 text-sm">
                  {lead.website ? <p className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-fg" /><a className="truncate text-primary hover:underline" href={lead.website} target="_blank" rel="noreferrer">{lead.domain}</a><SourceChip field="website" /></p> : <p className="flex items-center gap-2 text-muted-fg"><Globe className="h-4 w-4" /> No website found</p>}
                  {lead.address && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-fg" /><span>{lead.address}<SourceChip field="address" /></span></p>}
                  {lead.mapsUrl && <a className="flex items-center gap-2 text-xs text-primary hover:underline" href={lead.mapsUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Map listing</a>}
                  <div className="flex flex-wrap gap-1.5 pt-1">{Object.entries(lead.socials ?? {}).map(([k, v]) => <a key={k} href={v} target="_blank" rel="noreferrer"><Badge>{k}</Badge></a>)}</div>
                  <p className="text-xs text-muted-fg">Est. {lead.yearEst ?? "?"} · Size {lead.sizeEstimate ?? "unknown"} · Enriched {timeAgo(lead.lastEnrichedAt)}</p>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-fg">Phones</p>
                    {b.phones.length ? b.phones.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 py-0.5 text-sm">
                        <a href={`tel:${p.e164}`} className="font-mono hover:text-primary">{p.e164}</a><Badge>{p.kind}</Badge>{p.dndChecked ? <Badge tone="success">DND ✓</Badge> : <Badge tone="warning">DND?</Badge>}
                        {p.kind === "mobile" && <a href={waLink(p.e164)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle className="h-4 w-4 text-success" /></a>}
                      </div>)) : <p className="text-sm text-muted-fg">None found</p>}
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-fg">Emails</p>
                    {b.emails.length ? b.emails.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 py-0.5 text-sm">
                        <span className={`truncate font-mono text-xs ${suppressed.includes(e.email) ? "line-through opacity-50" : ""}`}>{e.email}</span>
                        {e.kind === "found" ? <Badge tone="success" title={e.sourceUrl ?? ""}>Found</Badge> : <Badge tone="warning" title="Pattern guess — NOT verified">Guessed {e.confidence}%</Badge>}
                        {e.mxOk === false && <Badge tone="danger">no MX</Badge>}
                      </div>)) : <p className="text-sm text-muted-fg">None found</p>}
                  </div>
                  <AddContact leadId={lead.id} />
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Compliance" />
              <CardBody className="space-y-3">
                <div className="flex gap-2 rounded-md bg-warning/10 p-2 text-xs text-warning"><AlertTriangle className="h-4 w-4 shrink-0" />Check numbers on the TRAI NCPR (DND) registry before telemarketing calls. Business-to-business calls to registered numbers may still be restricted.</div>
                <FlagToggles leadId={lead.id} starred={lead.starred} dndChecked={lead.dndChecked} doNotCall={lead.doNotCall} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Website & tech" description={b.enrichment?.pages.length ? `${b.enrichment.pages.filter((p) => p.status === "ok").length} pages read, ${b.enrichment.pages.filter((p) => p.status !== "ok").length} skipped` : undefined} />
              <CardBody className="space-y-3 text-sm">
                {b.enrichment ? <>
                  <div className="flex flex-wrap gap-1">{b.enrichment.techStack.length ? b.enrichment.techStack.map((t) => <Badge key={t} tone="info">{t}</Badge>) : <span className="text-muted-fg">No known tech detected</span>}</div>
                  {lead.website && <ul className="grid grid-cols-2 gap-1 text-xs">
                    {([["SSL", audit.ssl], ["Mobile-ready", audit.mobileViewport], ["Meta description", audit.metaDescription], ["Booking/enquiry form", audit.hasBookingOrForm], ["Chat / WhatsApp", audit.hasChat || audit.hasWhatsappWidget], ["Blog", audit.hasBlog]] as [string, unknown][]).map(([k, v]) => <li key={k} className={v ? "text-success" : "text-muted-fg"}>{v ? "✓" : "✗"} {k}</li>)}
                    {typeof audit.responseMs === "number" && <li>⏱ {(audit.responseMs / 1000).toFixed(1)}s</li>}
                    {typeof audit.copyrightYear === "number" && <li>© {audit.copyrightYear}</li>}
                  </ul>}
                  <details className="text-xs text-muted-fg"><summary className="cursor-pointer">Crawl log</summary><ul className="mt-1 space-y-0.5">{b.enrichment.pages.map((p) => <li key={p.url} className="truncate">{p.status === "ok" ? "✓" : "⤫"} {p.url} {p.note && `— ${p.note}`}</li>)}</ul></details>
                </> : <p className="text-muted-fg">Not enriched yet.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Score breakdown" />
              <CardBody>{score ? <ul className="space-y-1 text-xs">{score.explanation.map((e) => <li key={e}>• {e}</li>)}</ul> : <p className="text-sm text-muted-fg">Run analysis to score.</p>}</CardBody>
            </Card>
            <Card>
              <CardHeader title="Notes & reminders" />
              <CardBody className="space-y-3"><NotesBox leadId={lead.id} /><TaskAdder leadId={lead.id} />
                {b.tasks.filter((t) => !t.doneAt).map((t) => <p key={t.id} className="flex items-center gap-2 text-xs"><Clock className="h-3.5 w-3.5 text-muted-fg" />{t.title} · {fmtDateTime(t.dueAt)}</p>)}
              </CardBody>
            </Card>
          </div>
        ) },
        { id: "people", label: <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />People <Badge>{b.people.length}</Badge></span>, content: (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-sm font-medium">{b.people.length} people found ({dms} decision-maker{dms === 1 ? "" : "s"})</p><p className="text-xs text-muted-fg">Suggestion: search for <b className="text-fg">{nextRole}</b> next.</p></div>
                <PeopleTools leadId={lead.id} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Open in your LinkedIn" description="These open in YOUR browser, logged in as you. LeadForge never visits LinkedIn. Use the extension's 'Send to LeadForge' button to capture what you see." />
              <CardBody className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {links.filter((l) => l.kind === "linkedin").map((l) => <a key={l.key} href={l.url} target="_blank" rel="noreferrer" className={buttonClass("outline", "sm", "justify-start")}><Linkedin className="h-3.5 w-3.5 text-info" />{l.label}</a>)}
              </CardBody>
              <CardBody className="grid grid-cols-2 gap-2 border-t border-border sm:grid-cols-4">
                {links.filter((l) => l.kind === "google").map((l) => <a key={l.key} href={l.url} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm", "justify-start")}><Search className="h-3.5 w-3.5" />{l.label}</a>)}
              </CardBody>
            </Card>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {b.people.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-sm font-semibold">{p.fullName.split(" ").map((x) => x[0]).slice(0, 2).join("")}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.fullName}</p>
                      <p className="truncate text-xs text-muted-fg">{p.title ?? p.headline ?? "Role unknown"}</p>
                      <div className="mt-1 flex flex-wrap gap-1"><Badge tone={p.dmScore >= 70 ? "success" : "default"}>DM {p.dmScore}</Badge>{p.seniority && <Badge>{p.seniority}</Badge>}<Badge tone="info" title={p.sourceUrl ?? ""}>{p.source}</Badge></div>
                    </div>
                  </div>
                  {p.guessedEmail && <p className="mt-2 text-xs"><span className="font-mono">{p.guessedEmail}</span> <Badge tone="warning">Guess — unverified</Badge></p>}
                  {p.location && <p className="mt-1 text-xs text-muted-fg">{p.location}</p>}
                  {p.icebreaker && <p className="mt-2 rounded-md bg-muted p-2 text-xs"><b>Icebreaker:</b> {p.icebreaker}</p>}
                  {p.connectionNote && <p className="mt-1 rounded-md bg-muted p-2 text-xs"><b>Note:</b> {p.connectionNote}</p>}
                  <div className="mt-3"><PersonActions personId={p.id} email={p.guessedEmail} connectionNote={p.connectionNote} profileUrl={p.profileUrl} /></div>
                </Card>
              ))}
            </div>
          </div>
        ) },
        { id: "insights", label: "Pain points & pitch", content: analysis ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-3">
              <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1"><p className="text-sm">{analysis.summary}</p><p className="mt-1 text-xs text-muted-fg">Industry: {analysis.industry} · Size: {analysis.sizeEstimate} · Digital maturity <b className="text-fg">{analysis.digitalMaturity}/100</b> · Model: {b.insights.analysis?.model}</p></div>
                <Badge tone={analysis.dataQuality === "good" ? "success" : analysis.dataQuality === "thin" ? "warning" : "danger"}>{analysis.dataQuality === "insufficient" ? "Insufficient data" : `Data: ${analysis.dataQuality}`}</Badge>
              </CardBody>
              {analysis.warnings?.length ? <p className="px-4 pb-3 text-[11px] text-muted-fg">⚠ {analysis.warnings.join(" · ")}</p> : null}
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Pain points" description="Every point cites its evidence. Hover a source for details." />
              <CardBody className="space-y-3">
                {analysis.pains.length ? analysis.pains.map((p, i) => (
                  <div key={i} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{p.title}</p><ConfidenceBadge value={p.confidence} /></div>
                    <p className="mt-0.5 text-sm text-muted-fg">{p.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-1">{p.evidenceIds.map((eid) => { const e = evidence.get(eid); return e ? <a key={eid} href={e.sourceUrl ?? "#"} target="_blank" rel="noreferrer" title={e.fact} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-fg hover:text-fg"><Info className="h-3 w-3" />{e.provider}{e.collectedAt ? ` · ${fmtDate(e.collectedAt)}` : ""}</a> : null; })}</div>
                  </div>)) : <p className="text-sm text-muted-fg">Insufficient data — no evidence-backed pain points yet. Try re-enriching or add notes after a call.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Buying signals" />
              <CardBody className="space-y-2">{analysis.signals.length ? analysis.signals.map((s, i) => <div key={i} className="flex items-center justify-between gap-2 text-sm"><span>{s.title}</span><ConfidenceBadge value={s.confidence} /></div>) : <p className="text-sm text-muted-fg">No signals found.</p>}
                <p className="border-t border-border pt-2 text-xs"><b>Why now:</b> {analysis.whyNow}</p></CardBody>
            </Card>
            <Card className="lg:col-span-3">
              <CardHeader title="What to pitch" description="Ranked against your product catalog." action={<a className={buttonClass("ghost", "sm")} href="/products">Edit catalog →</a>} />
              <CardBody className="grid gap-3 md:grid-cols-3">
                {analysis.matches.map((m, i) => (
                  <div key={m.productId} className={`rounded-lg border p-3 ${i === 0 ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center justify-between"><p className="font-medium">{i + 1}. {m.productName}</p><Badge tone={m.fitPct >= 60 ? "success" : m.fitPct >= 35 ? "warning" : "default"}>{m.fitPct}% fit</Badge></div>
                    <p className="mt-1 text-xs text-muted-fg">{m.reasoning}</p>
                    <p className="mt-2 text-xs"><b>Target:</b> {m.targetRole}</p>
                    <p className="mt-2 rounded-md bg-muted p-2 text-xs"><b>Opening line:</b> {m.openingLine}</p>
                    <details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-fg">Objections &amp; rebuttals ({m.objections.length})</summary>{m.objections.map((o, j) => <p key={j} className="mt-1"><b>“{o.objection}”</b> — {o.rebuttal}</p>)}</details>
                  </div>
                ))}
                {!analysis.matches.length && <p className="text-sm text-muted-fg">Add products to your catalog to get recommendations.</p>}
              </CardBody>
            </Card>
          </div>
        ) : <Card className="p-6 text-center"><p className="mb-3 text-sm text-muted-fg">No analysis yet.</p><div className="flex justify-center"><EnrichButtons leadId={lead.id} /></div></Card> },
        { id: "assets", label: "Scripts & emails", content: (
          <AssetsPanel leadId={lead.id} assets={assets} products={products.map((p) => ({ id: p.id, label: p.name }))}
            people={b.people.map((p) => ({ id: p.id, label: `${p.fullName}${p.title ? ` — ${p.title}` : ""}` }))}
            emails={[...b.emails.map((e) => e.email), ...b.people.map((p) => p.guessedEmail).filter(Boolean) as string[]]} phone={mobile?.e164 ?? null} suppressed={suppressed} />
        ) },
        { id: "timeline", label: <span className="flex items-center gap-1.5">Timeline <Badge>{timeline.length}</Badge></span>, content: (
          <Card><CardBody>
            {timeline.length ? <ol className="relative space-y-4 border-l border-border pl-5">{timeline.map((t, i) => (
              <li key={i} className="relative"><span className="absolute -left-[27px] grid h-5 w-5 place-items-center rounded-full border border-border bg-card"><t.icon className="h-3 w-3 text-muted-fg" /></span>
                <p className="text-sm font-medium">{t.title}</p>{t.body && <p className="whitespace-pre-wrap text-xs text-muted-fg">{t.body}</p>}<p className="text-[11px] text-muted-fg">{fmtDateTime(t.at)}</p></li>
            ))}</ol> : <p className="text-sm text-muted-fg">No activity yet.</p>}
          </CardBody></Card>
        ) },
        { id: "sources", label: <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Sources</span>, content: (
          <Card><div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-left text-muted-fg"><tr><th className="p-2">Field</th><th className="p-2">Value</th><th className="p-2">Method</th><th className="p-2">Provider</th><th className="p-2">Source</th><th className="p-2">Collected</th></tr></thead>
            <tbody className="divide-y divide-border">{b.sources.map((s) => <tr key={s.id}><td className="p-2">{s.field}</td><td className="max-w-[240px] truncate p-2">{s.value}</td><td className="p-2"><ConfidenceBadge value={s.confidence} method={s.method} /></td><td className="p-2">{s.provider}</td><td className="max-w-[200px] truncate p-2">{s.sourceUrl ? <a className="text-primary hover:underline" href={s.sourceUrl} target="_blank" rel="noreferrer">{s.sourceUrl}</a> : "—"}</td><td className="p-2">{fmtDate(s.collectedAt)}</td></tr>)}</tbody></table></div></Card>
        ) },
      ]} />
      {mobile && <a href={`tel:${mobile.e164}`} className="no-print fixed bottom-20 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-success text-white shadow-lg lg:hidden" aria-label="Call"><Phone className="h-6 w-6" /></a>}
    </>
  );
}
