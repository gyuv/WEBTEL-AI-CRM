"use client";
import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster, toast } from "sonner";
import { Command } from "cmdk";
import { Check, Copy, Moon, Sun, Search, Loader2 } from "lucide-react";
import { Button, buttonClass } from "./ui";
import { cn } from "@/lib/utils";
import { NAV } from "./nav-items";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster richColors position="top-right" closeButton />
    </ThemeProvider>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
    </Button>
  );
}

export function CopyButton({ text, label = "Copy", className, size = "sm" }: { text: string; label?: string; className?: string; size?: "sm" | "md" }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      className={buttonClass("outline", size, className)}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
        setDone(true); toast.success("Copied to clipboard");
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {label}
    </button>
  );
}

export function Tabs({ tabs, initial, storageKey }: { tabs: { id: string; label: React.ReactNode; content: React.ReactNode }[]; initial?: string; storageKey?: string }) {
  const [active, setActive] = React.useState(initial ?? tabs[0]?.id);
  React.useEffect(() => {
    if (!storageKey) return;
    try { const v = localStorage.getItem(storageKey); if (v && tabs.some((t) => t.id === v)) setActive(v); } catch { /* ignore */ }
  }, [storageKey, tabs]);
  return (
    <div>
      <div role="tablist" className="no-print -mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border px-1">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={active === t.id}
            onClick={() => { setActive(t.id); try { if (storageKey) localStorage.setItem(storageKey, t.id); } catch { /* ignore */ } }}
            className={cn("relative whitespace-nowrap px-3 py-2 text-sm text-muted-fg transition-colors hover:text-fg", active === t.id && "text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary")}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => <div key={t.id} role="tabpanel" hidden={active !== t.id} className="animate-fade-in">{active === t.id && t.content}</div>)}
    </div>
  );
}

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [leads, setLeads] = React.useState<{ id: string; name: string; city: string | null }[]>([]);
  const router = useRouter();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); setOpen(true); }
      const g = NAV.find((n) => n.key === e.key && e.shiftKey === false);
      if (g && (window as unknown as { __lfG?: number }).__lfG && Date.now() - (window as unknown as { __lfG: number }).__lfG < 800) router.push(g.href);
      (window as unknown as { __lfG?: number }).__lfG = e.key === "g" ? Date.now() : 0;
    };
    const openEv = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("lf:cmdk", openEv);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("lf:cmdk", openEv); };
  }, [router]);
  React.useEffect(() => {
    if (!open || q.length < 2) { setLeads([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (r.ok) setLeads(await r.json());
    }, 150);
    return () => clearTimeout(t);
  }, [q, open]);
  if (!open) return null;
  const go = (href: string) => { setOpen(false); setQ(""); router.push(href); };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <Command className="glass w-full max-w-xl overflow-hidden rounded-xl" onClick={(e) => e.stopPropagation()} shouldFilter={true}>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-muted-fg" />
          <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Search leads, jump to a page, run an action…" className="h-12 w-full bg-transparent text-sm outline-none" />
          <span className="kbd">Esc</span>
        </div>
        <Command.List className="max-h-[50vh] overflow-y-auto p-2" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <Command.Empty className="p-6 text-center text-sm text-muted-fg">No results.</Command.Empty>
          {leads.length > 0 && (
            <Command.Group heading="Leads" className="text-xs text-muted-fg [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
              {leads.map((l) => (
                <Command.Item key={l.id} value={`lead ${l.name} ${l.city ?? ""}`} onSelect={() => go(`/leads/${l.id}`)} className="flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-sm text-fg aria-selected:bg-muted">
                  {l.name}<span className="text-xs text-muted-fg">{l.city}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          <Command.Group heading="Go to" className="text-xs text-muted-fg [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            {NAV.map((n) => (
              <Command.Item key={n.href} value={`go ${n.label}`} onSelect={() => go(n.href)} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-fg aria-selected:bg-muted">
                <n.icon className="h-4 w-4 text-muted-fg" /> {n.label}
                <span className="ml-auto flex gap-1"><span className="kbd">G</span><span className="kbd">{n.key.toUpperCase()}</span></span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading="Actions" className="text-xs text-muted-fg [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            <Command.Item value="action find new leads discover" onSelect={() => go("/discover")} className="cursor-pointer rounded-md px-2 py-2 text-sm text-fg aria-selected:bg-muted">Find new leads…</Command.Item>
            <Command.Item value="action add product" onSelect={() => go("/products/new")} className="cursor-pointer rounded-md px-2 py-2 text-sm text-fg aria-selected:bg-muted">Add a product</Command.Item>
            <Command.Item value="action start calling" onSelect={() => go("/calls")} className="cursor-pointer rounded-md px-2 py-2 text-sm text-fg aria-selected:bg-muted">Start today&apos;s calls</Command.Item>
            <Command.Item value="action paste reply inbox" onSelect={() => go("/inbox")} className="cursor-pointer rounded-md px-2 py-2 text-sm text-fg aria-selected:bg-muted">Paste a reply</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

export function NavLinks({ onNavigate, compact }: { onNavigate?: () => void; compact?: boolean }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = path === n.href || (n.href !== "/" && path.startsWith(n.href));
        return (
          <a key={n.href} href={n.href} onClick={onNavigate}
            className={cn("group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-fg transition-colors hover:bg-muted hover:text-fg", active && "bg-muted font-medium text-fg")}>
            <n.icon className={cn("h-4 w-4", active && "text-primary")} />
            {!compact && <span className="flex-1">{n.label}</span>}
            {!compact && <span className="kbd opacity-0 transition-opacity group-hover:opacity-100">{n.key.toUpperCase()}</span>}
          </a>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  const items = NAV.filter((n) => n.mobile);
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      {items.map((n) => {
        const active = path.startsWith(n.href);
        return (
          <a key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px] text-muted-fg", active && "text-primary")}>
            <n.icon className="h-5 w-5" />{n.short ?? n.label}
          </a>
        );
      })}
    </nav>
  );
}

export function SearchTrigger() {
  return (
    <button onClick={() => window.dispatchEvent(new Event("lf:cmdk"))} className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-fg hover:bg-muted">
      <Search className="h-4 w-4" /> <span className="flex-1 text-left">Search or jump…</span>
      <span className="kbd">⌘</span><span className="kbd">K</span>
    </button>
  );
}

/** Polls a job and refreshes the page when done. */
export function JobProgress({ jobId, onDoneHref, label }: { jobId: string; onDoneHref?: string; label?: string }) {
  const [job, setJob] = React.useState<{ status: string; progress: number; progressMsg: string | null; error: string | null; result?: Record<string, unknown> } | null>(null);
  const router = useRouter();
  React.useEffect(() => {
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/jobs/${jobId}?run=1`);
      if (!r.ok) return;
      const j = await r.json();
      if (stop) return;
      setJob(j);
      if (j.status === "done") { toast.success(label ? `${label} finished` : "Done"); if (onDoneHref) router.push(onDoneHref); else router.refresh(); return; }
      if (j.status === "failed") { toast.error(j.error ?? "Job failed"); return; }
      setTimeout(tick, 1200);
    };
    tick();
    return () => { stop = true; };
  }, [jobId, onDoneHref, router, label]);
  if (!job) return <div className="flex items-center gap-2 text-sm text-muted-fg"><Loader2 className="h-4 w-4 animate-spin" /> Starting…</div>;
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-xs text-muted-fg">
        <span className="flex items-center gap-1.5">{job.status === "running" || job.status === "queued" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{job.progressMsg ?? job.status}</span>
        <span className="tabular-nums">{job.progress}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${job.progress}%` }} /></div>
      {job.error && <p className="mt-1 text-xs text-danger">{job.error}</p>}
    </div>
  );
}

export function ActionButton({ action, children, variant = "outline", size = "sm", confirm: confirmMsg, className, success }: {
  action: () => Promise<unknown>; children: React.ReactNode; variant?: "primary" | "outline" | "ghost" | "danger" | "secondary" | "success"; size?: "sm" | "md" | "lg"; confirm?: string; className?: string; success?: string;
}) {
  const [pending, start] = React.useTransition();
  const router = useRouter();
  return (
    <Button variant={variant} size={size} className={className} disabled={pending} onClick={() => {
      if (confirmMsg && !window.confirm(confirmMsg)) return;
      start(async () => {
        try {
          const r = (await action()) as { error?: string; redirect?: string } | undefined;
          if (r?.error) toast.error(r.error); else if (success) toast.success(success);
          if (r?.redirect) router.push(r.redirect); else router.refresh();
        } catch (e) { toast.error((e as Error).message); }
      });
    }}>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{children}
    </Button>
  );
}
