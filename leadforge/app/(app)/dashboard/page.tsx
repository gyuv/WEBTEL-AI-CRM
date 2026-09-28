import { Phone, Mail, Target, Flame, CalendarCheck, IndianRupee, Radar, Reply, CheckCircle2, Clock } from "lucide-react";
import { ctx, getSettings, getProfile } from "@/lib/server/core";
import { dashboardStats, todaysFocus } from "@/lib/server/analytics";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, ScoreRing, Stat, buttonClass } from "@/components/ui";
import { TrendChart, Funnel7 } from "@/components/charts";
import { ActionButton } from "@/components/client";
import { completeTaskAction } from "@/app/actions";
import { inr, fmtDateTime, statusLabel, timeAgo } from "@/lib/utils";

export const metadata = { title: "Today" };

export default async function Dashboard() {
  const { userId } = await ctx();
  const [s, focus, settings, profile] = await Promise.all([dashboardStats(userId), todaysFocus(userId), getSettings(userId), getProfile(userId)]);
  const hour = new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });
  const greet = Number(hour) < 12 ? "Good morning" : Number(hour) < 17 ? "Good afternoon" : "Good evening";
  const callPct = Math.min(100, Math.round((s.calls_today / settings.targets.callsPerDay) * 100));
  const emailPct = Math.min(100, Math.round((s.emails_today / settings.targets.emailsPerDay) * 100));
  const summary = [
    focus.callFirst[0] && `Call ${focus.callFirst[0].name} first (score ${focus.callFirst[0].score})`,
    focus.tasks.length && `${focus.tasks.length} follow-up${focus.tasks.length > 1 ? "s" : ""} due`,
    focus.replies.length && `${focus.replies.length} new repl${focus.replies.length > 1 ? "ies" : "y"}`,
    focus.hot.length && `${focus.hot.length} lead${focus.hot.length > 1 ? "s" : ""} got hotter`,
  ].filter(Boolean).join(" · ");
  return (
    <>
      <PageHeader title={`${greet}${profile.displayName && profile.displayName !== "Your Name" ? `, ${profile.displayName.split(" ")[0]}` : ""} 👋`} description={summary || "Nothing urgent. Find new leads to fill your pipeline."}
        actions={<><a href="/discover" className={buttonClass("outline")}><Radar className="h-4 w-4" /> Find leads</a><a href="/calls" className={buttonClass("primary")}><Phone className="h-4 w-4" /> Start calling</a></>} />

      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <Card className="relative overflow-hidden p-4">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
          <div className="relative flex items-center justify-between">
            <div><p className="text-xs text-muted-fg">Today&apos;s calls</p><p className="text-2xl font-semibold tabular-nums">{s.calls_today}<span className="text-sm text-muted-fg"> / {settings.targets.callsPerDay}</span></p></div>
            <div className="text-right"><p className="text-xs text-muted-fg">Streak</p><p className="flex items-center gap-1 text-2xl font-semibold"><Flame className="h-5 w-5 text-warning" />{s.streak}d</p></div>
          </div>
          <div className="relative mt-3 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${callPct}%` }} /></div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between"><div><p className="text-xs text-muted-fg">Emails sent today</p><p className="text-2xl font-semibold tabular-nums">{s.emails_today}<span className="text-sm text-muted-fg"> / {settings.targets.emailsPerDay}</span></p></div><Mail className="h-5 w-5 text-muted-fg" /></div>
          <div className="mt-3 h-2 rounded-full bg-muted"><div className={`h-full rounded-full ${emailPct >= 100 ? "bg-warning" : "bg-info"}`} style={{ width: `${emailPct}%` }} /></div>
          {emailPct >= 100 && <p className="mt-1 text-[11px] text-warning">Daily limit reached — protect your domain reputation.</p>}
        </Card>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Leads" value={s.leads} sub={`${s.new_leads} new (30d)`} />
        <Stat label="Enriched" value={`${s.enrichedPct}%`} sub={`${s.enriched} leads`} />
        <Stat label="Calls (30d)" value={s.calls} icon={<Phone className="h-3.5 w-3.5" />} />
        <Stat label="Connect rate" value={`${s.connectRate}%`} />
        <Stat label="Emails (30d)" value={s.emails} icon={<Mail className="h-3.5 w-3.5" />} />
        <Stat label="Reply rate" value={`${s.replyRate}%`} icon={<Reply className="h-3.5 w-3.5" />} />
        <Stat label="Meetings" value={s.meetings} icon={<CalendarCheck className="h-3.5 w-3.5" />} />
        <Stat label="Pipeline" value={inr(s.pipeline_value)} icon={<IndianRupee className="h-3.5 w-3.5" />} sub={`${s.won} won`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Call these first" description="Highest score, not yet contacted, not on do-not-call" action={<a href="/calls" className={buttonClass("ghost", "sm")}>Open call desk →</a>} />
          <CardBody className="p-0">
            {focus.callFirst.length ? (
              <ul className="divide-y divide-border">
                {focus.callFirst.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                    <ScoreRing value={l.score} size={34} />
                    <a href={`/leads/${l.id}`} className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{l.name}</p><p className="truncate text-xs text-muted-fg">{l.category} · {l.area ?? l.city}</p></a>
                    <Badge>{statusLabel(l.status)}</Badge>
                    <a href={`/calls?lead=${l.id}`} className={buttonClass("outline", "sm")}><Phone className="h-3.5 w-3.5" /></a>
                  </li>
                ))}
              </ul>
            ) : <div className="p-4"><EmptyState icon={<Target />} title="No uncontacted leads" description="Discover new leads to fill your call list." action={<a className={buttonClass()} href="/discover">Find leads</a>} /></div>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Follow-ups due" description="Overdue and today" />
          <CardBody className="p-0">
            {focus.tasks.length ? (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {focus.tasks.map(({ t, lead }) => (
                  <li key={t.id} className="flex items-start gap-2 px-4 py-2.5">
                    <Clock className={`mt-0.5 h-4 w-4 shrink-0 ${t.dueAt < new Date(Date.now() - 86400000) ? "text-danger" : "text-muted-fg"}`} />
                    <div className="min-w-0 flex-1">
                      <a href={lead?.id ? `/leads/${lead.id}` : "#"} className="text-sm leading-tight hover:underline">{t.title}</a>
                      <p className="text-[11px] text-muted-fg">{fmtDateTime(t.dueAt)}</p>
                    </div>
                    <ActionButton variant="ghost" action={completeTaskAction.bind(null, t.id)} success="Done"><CheckCircle2 className="h-4 w-4" /></ActionButton>
                  </li>
                ))}
              </ul>
            ) : <p className="p-4 text-sm text-muted-fg">All caught up 🎉</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="New replies" action={<a href="/inbox" className={buttonClass("ghost", "sm")}>Inbox →</a>} />
          <CardBody className="p-0">
            {focus.replies.length ? <ul className="divide-y divide-border">{focus.replies.map(({ m, lead }) => (
              <li key={m.id} className="px-4 py-2.5"><div className="flex items-center justify-between gap-2"><a href={lead ? `/leads/${lead.id}` : "/inbox"} className="truncate text-sm font-medium">{lead?.name ?? m.fromAddress}</a><Badge tone={m.classification?.includes("interest") || m.classification === "meeting_request" ? "success" : m.classification?.startsWith("objection") ? "warning" : "default"}>{statusLabel(m.classification ?? "")}</Badge></div><p className="truncate text-xs text-muted-fg">{m.summary}</p></li>
            ))}</ul> : <p className="p-4 text-sm text-muted-fg">No replies in the last 3 days.</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Got hotter" description="Status improvements, last 3 days" />
          <CardBody className="p-0">
            {focus.hot.length ? <ul className="divide-y divide-border">{focus.hot.map(({ h, lead }) => (
              <li key={h.id} className="px-4 py-2.5"><a href={`/leads/${lead.id}`} className="text-sm font-medium">{lead.name}</a><p className="text-xs text-muted-fg">{statusLabel(h.fromStatus ?? "")} → <span className="text-success">{statusLabel(h.toStatus)}</span> · {timeAgo(h.createdAt)}</p></li>
            ))}</ul> : <p className="p-4 text-sm text-muted-fg">No movement yet.</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Conversion funnel" />
          <CardBody><Funnel7 data={s.funnel} /></CardBody>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Activity — last 14 days" />
          <CardBody><TrendChart data={s.trend} keys={[{ key: "calls", label: "Calls", color: "#6366f1" }, { key: "emails", label: "Emails", color: "#0ea5e9" }, { key: "replies", label: "Replies", color: "#16a34a" }]} /></CardBody>
        </Card>
      </div>
    </>
  );
}
