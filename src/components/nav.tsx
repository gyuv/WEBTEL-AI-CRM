"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BarChart3, Bell, Bot, Briefcase, CalendarClock, FileText, Gauge, IndianRupee, LineChart, Search, Settings, Users, UserSquare } from "lucide-react";

const items = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/customers", label: "Customers", icon: UserSquare },
  { href: "/opportunities", label: "Opportunities", icon: Briefcase },
  { href: "/followups", label: "Follow-ups", icon: CalendarClock },
  { href: "/quotations", label: "Quotations", icon: FileText },
  { href: "/sales", label: "Sales", icon: IndianRupee },
  { href: "/analytics/sources", label: "Source Analytics", icon: BarChart3 },
  { href: "/reports", label: "Reports", icon: LineChart },
  { href: "/ai", label: "AI Analytics", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href} className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", active ? "bg-primary text-primary-foreground" : "text-slate-200 hover:bg-white/10")}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      className="relative w-full max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search leads, customers, phone, email, quotation #, source, campaign…"
        className="h-9 w-full rounded-md border bg-white pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </form>
  );
}

interface Notif { id: string; name: string; message: string | null; overdue: boolean; href: string; date: string }

export function Notifications() {
  const [data, setData] = useState<{ count: number; items: Notif[] } | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch("/api/notifications").then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => {});
  }, []);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-md p-2 hover:bg-muted" aria-label="Notifications">
        <Bell className="h-5 w-5" />
        {!!data?.count && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-destructive px-1.5 text-[10px] text-white">{data.count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-80 rounded-md border bg-white shadow-lg">
          <div className="border-b px-3 py-2 text-xs font-semibold">Follow-ups due</div>
          {!data?.items.length && <div className="p-3 text-sm text-muted-foreground">Nothing due today 🎉</div>}
          {data?.items.map((n) => (
            <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className="block border-b px-3 py-2 text-sm hover:bg-muted">
              <div className="font-medium">{n.name} {n.overdue && <span className="text-xs text-destructive">overdue</span>}</div>
              <div className="text-xs text-muted-foreground">{n.message}</div>
            </Link>
          ))}
          <Link href="/followups" className="block px-3 py-2 text-xs text-primary" onClick={() => setOpen(false)}>View all follow-ups →</Link>
        </div>
      )}
    </div>
  );
}
