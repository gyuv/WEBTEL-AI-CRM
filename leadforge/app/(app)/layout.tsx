import { after } from "next/server";
import { and, eq, isNull, count } from "drizzle-orm";
import { Bell, FlaskConical } from "lucide-react";
import { CommandPalette, MobileNav, NavLinks, SearchTrigger, ThemeToggle } from "@/components/client";
import { Badge } from "@/components/ui";
import { ctx, getSettings } from "@/lib/server/core";
import { schema } from "@/lib/db/client";
import { runJobs } from "@/lib/server/jobs";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { db, userId } = await ctx();
  const settings = await getSettings(userId);
  const [{ n }] = await db.select({ n: count() }).from(schema.notifications).where(and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)));
  // Opportunistically process background jobs after the response is sent (free "worker").
  after(() => runJobs(25000).catch(() => undefined));
  return (
    <div className="min-h-dvh">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card/60 backdrop-blur-xl lg:flex">
        <a href="/dashboard" className="flex h-14 items-center gap-2 px-4">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <span className="font-semibold tracking-tight">LeadForge</span>
        </a>
        <div className="flex-1 overflow-y-auto px-2 py-2"><NavLinks /></div>
        <div className="border-t border-border p-3 text-[11px] text-muted-fg">
          <p className="flex items-center gap-1"><span className="kbd">⌘K</span> command · <span className="kbd">G</span>+key to jump</p>
          <p className="mt-1">100% free tier · <a className="underline" href="/legal">Privacy &amp; opt-out</a></p>
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur-xl">
          <a href="/dashboard" className="flex items-center gap-2 lg:hidden"><img src="/icon.svg" alt="" className="h-7 w-7" /></a>
          <SearchTrigger />
          <div className="ml-auto flex items-center gap-1">
            {settings.mockMode && (
              <a href="/settings"><Badge tone="warning" className="gap-1"><FlaskConical className="h-3 w-3" /> Mock mode</Badge></a>
            )}
            <a href="/notifications" className="relative grid h-9 w-9 place-items-center rounded-md hover:bg-muted" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {n > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">{n > 99 ? "99+" : n}</span>}
            </a>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-5 lg:px-6 lg:pb-10">{children}</main>
      </div>
      <MobileNav />
      <CommandPalette />
    </div>
  );
}
