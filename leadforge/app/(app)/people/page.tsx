import { desc, eq } from "drizzle-orm";
import { Users } from "lucide-react";
import { ctx } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { PeopleImport } from "./people-client";

export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  const { db, userId } = await ctx();
  const rows = await db.select({ p: schema.leadPeople, lead: { id: schema.leads.id, name: schema.leads.name } }).from(schema.leadPeople).innerJoin(schema.leads, eq(schema.leads.id, schema.leadPeople.leadId))
    .where(eq(schema.leadPeople.userId, userId)).orderBy(desc(schema.leadPeople.dmScore)).limit(1000);
  const list = role ? rows.filter((r) => r.p.roleGroup === role) : rows;
  const groups = [...new Set(rows.map((r) => r.p.roleGroup ?? "other"))];
  return (
    <>
      <PageHeader title="People" description={`${rows.length} people · ${rows.filter((r) => r.p.dmScore >= 70).length} decision-makers. Sourced only from public search snippets, company sites, and what you capture yourself.`} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-1.5"><a href="/people" className={`rounded-full border px-2.5 py-1 text-xs ${!role ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>All</a>{groups.map((g) => <a key={g} href={`/people?role=${g}`} className={`rounded-full border px-2.5 py-1 text-xs ${role === g ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>{g}</a>)}</div>
          {list.length ? (
            <Card className="divide-y divide-border">
              {list.map(({ p, lead }) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-xs font-semibold">{p.fullName.split(" ").map((x) => x[0]).slice(0, 2).join("")}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.fullName} <span className="font-normal text-muted-fg">· {p.title ?? p.headline}</span></p><a href={`/leads/${lead.id}`} className="truncate text-xs text-primary hover:underline">{lead.name}</a></div>
                  <Badge tone={p.dmScore >= 70 ? "success" : "default"}>DM {p.dmScore}</Badge>
                  <Badge tone="info" className="hidden sm:inline-flex">{p.source}</Badge>
                  {p.profileUrl && <a href={p.profileUrl} target="_blank" rel="noreferrer" className="text-xs text-primary">Profile</a>}
                </div>
              ))}
            </Card>
          ) : <EmptyState icon={<Users />} title="No people yet" description="Enrich leads, use the LinkedIn deep links on a lead, the browser extension, or import your LinkedIn connections CSV." />}
        </div>
        <div className="space-y-4">
          <Card><CardHeader title="Import" description="LinkedIn Connections.csv (Settings → Data privacy → Get a copy of your data), Sales Navigator/Recruiter exports you own, or any CSV with name + company." /><CardBody><PeopleImport /></CardBody></Card>
          <Card><CardHeader title="Browser extension" /><CardBody className="space-y-2 text-sm text-muted-fg"><p>Install the extension from the <code>/extension</code> folder (Chrome → Extensions → Developer mode → Load unpacked). While viewing a profile or company people page in your own browser, click <b>Send to LeadForge</b>. It reads only what&apos;s visible, only when you click.</p><a href="/settings#extension" className="text-primary">Get your extension token →</a></CardBody></Card>
        </div>
      </div>
    </>
  );
}
