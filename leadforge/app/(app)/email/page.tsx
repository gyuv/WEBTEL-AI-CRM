import { desc, eq, and } from "drizzle-orm";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { Card, CardBody, CardHeader, PageHeader, Badge, buttonClass } from "@/components/ui";
import { Tabs } from "@/components/client";
import { Composer, TemplateEditor, SpamChecker } from "./email-client";
import { fmtDateTime } from "@/lib/utils";
import { Download, ShieldCheck } from "lucide-react";

export const metadata = { title: "Email" };

const HYGIENE = [
  ["Use a separate sending domain or subdomain", "e.g. mail.yourco.in — protects your main domain's reputation."],
  ["SPF record", "TXT on your domain: v=spf1 include:_spf.google.com ~all (Google Workspace)."],
  ["DKIM", "Generate in Google Admin → Apps → Gmail → Authenticate email, publish the TXT record, then Start authentication."],
  ["DMARC", "TXT _dmarc.yourco.in: v=DMARC1; p=none; rua=mailto:you@yourco.in — move to quarantine after 2–4 weeks."],
  ["Warm up for 2–4 weeks", "Start at 5–10/day, add ~5/day. Reply to real conversations; ask colleagues to reply/star."],
  ["Daily limit", "New domain: stay around 30–40 cold emails/day. Established: ≤ 80–100/day per inbox."],
  ["Plain-text friendly", "No images, at most 1 link, no attachments on first touch, no tracking pixels needed."],
  ["Personalise every email", "Reference a real, sourced observation (pain point). Never claim facts you can't back up."],
  ["Always offer an opt-out", "Every template includes a 'Reply STOP' line; unsubscribes are auto-suppressed."],
  ["Check bounces weekly", "Bounced addresses are auto-suppressed; keep bounce rate < 2%."],
];

export default async function EmailPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const sp = await searchParams;
  const { db, userId } = await ctx();
  const [templates, leads, products, sent] = await Promise.all([
    db.select().from(schema.templates).where(eq(schema.templates.userId, userId)).orderBy(schema.templates.name),
    db.select({ id: schema.leads.id, name: schema.leads.name }).from(schema.leads).where(eq(schema.leads.userId, userId)).orderBy(desc(schema.leads.score)).limit(1000),
    db.select({ id: schema.products.id, name: schema.products.name }).from(schema.products).where(and(eq(schema.products.userId, userId), eq(schema.products.active, true))),
    db.select({ o: schema.outreachLog, lead: schema.leads.name }).from(schema.outreachLog).innerJoin(schema.leads, eq(schema.leads.id, schema.outreachLog.leadId)).where(eq(schema.outreachLog.userId, userId)).orderBy(desc(schema.outreachLog.sentAt)).limit(50),
  ]);
  return (
    <>
      <PageHeader title="Email assistant" description="LeadForge prepares; you send. Nothing is ever sent automatically." actions={<a className={buttonClass("outline")} href="/api/export?kind=mailmerge&format=csv"><Download className="h-4 w-4" /> Mail-merge CSV (all)</a>} />
      <Tabs storageKey="lf:emailtab" tabs={[
        { id: "compose", label: "Compose", content: <Composer templates={templates.map((t) => ({ id: t.id, name: t.name }))} leads={leads} products={products} initialLead={sp.lead} /> },
        { id: "templates", label: <>Templates <Badge>{templates.length}</Badge></>, content: <TemplateEditor templates={templates.map((t) => ({ id: t.id, name: t.name, channel: t.channel, subject: t.subject ?? "", body: t.body }))} /> },
        { id: "check", label: "Spam checker", content: <SpamChecker /> },
        { id: "hygiene", label: "Sending hygiene", content: (
          <Card><CardHeader title="Deliverability checklist" description="Free steps that keep you out of spam." />
            <CardBody className="grid gap-3 md:grid-cols-2">{HYGIENE.map(([t, d]) => <div key={t} className="flex gap-3 rounded-md border border-border p-3"><ShieldCheck className="h-5 w-5 shrink-0 text-success" /><div><p className="text-sm font-medium">{t}</p><p className="text-xs text-muted-fg">{d}</p></div></div>)}</CardBody></Card>
        ) },
        { id: "log", label: "Sent log", content: (
          <Card><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-xs text-muted-fg"><tr><th className="p-3">When</th><th className="p-3">Lead</th><th className="p-3">To</th><th className="p-3">Subject</th><th className="p-3">Variant</th></tr></thead>
            <tbody className="divide-y divide-border">{sent.map(({ o, lead }) => <tr key={o.id}><td className="p-3 text-xs">{fmtDateTime(o.sentAt)}</td><td className="p-3"><a className="hover:underline" href={`/leads/${o.leadId}`}>{lead}</a></td><td className="p-3 font-mono text-xs">{o.toAddress}</td><td className="p-3">{o.subject}</td><td className="p-3"><Badge>{o.variant ?? o.channel}</Badge></td></tr>)}
            {!sent.length && <tr><td colSpan={5} className="p-6 text-center text-muted-fg">Nothing logged yet. Press “I sent this” after sending.</td></tr>}</tbody></table></div></Card>
        ) },
      ]} />
    </>
  );
}
