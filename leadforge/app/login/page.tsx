import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { Button, Card, Input } from "@/components/ui";
import { makeSessionValue, SESSION_COOKIE } from "@/lib/auth";

export const metadata = { title: "Sign in" };

async function login(form: FormData) {
  "use server";
  const pw = String(form.get("password") ?? "");
  const expected = process.env.APP_PASSWORD ?? "";
  const ok = expected && pw.length === expected.length && crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(expected));
  if (!ok) redirect("/login?error=1");
  (await cookies()).set(SESSION_COOKIE, makeSessionValue(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 30, path: "/" });
  const next = String(form.get("next") ?? "/dashboard");
  redirect(next.startsWith("/") ? next : "/dashboard");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  if (!process.env.APP_PASSWORD) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/.15),transparent_60%)] p-4">
      <Card className="glass w-full max-w-sm p-6">
        <div className="mb-6 flex items-center gap-2"><img src="/icon.svg" alt="" className="h-8 w-8" /><span className="text-lg font-semibold">LeadForge</span></div>
        <form action={login} className="space-y-3">
          <input type="hidden" name="next" value={sp.next ?? "/dashboard"} />
          <Input name="password" type="password" placeholder="App password" autoFocus required aria-label="App password" />
          {sp.error && <p className="text-xs text-danger">Wrong password.</p>}
          <Button className="w-full" type="submit">Sign in</Button>
        </form>
      </Card>
    </main>
  );
}
