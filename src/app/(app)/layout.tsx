import { requirePageActor } from "@/server/session";
import { GlobalSearch, Notifications, Sidebar } from "@/components/nav";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui";
import { loginRequired } from "@/lib/login-mode";

// Every page reads live CRM data; never pre-render at build time.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor();
  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-56 shrink-0 bg-slate-900 p-3 md:block">
        <div className="mb-4 px-2 text-sm font-bold text-white">Webtel AI Sales</div>
        <Sidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-3 border-b bg-white px-4 py-2">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <Notifications />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {actor.name} <span className="text-xs">({actor.role})</span>
            </span>
            {loginRequired() && (
              <form action={logoutAction}>
                <Button variant="outline" size="sm">Logout</Button>
              </form>
            )}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
