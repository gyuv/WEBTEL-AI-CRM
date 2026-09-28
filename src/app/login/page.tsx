"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Button, Card, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const [error, action, pending] = useActionState(loginAction, null);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold">Webtel AI Sales Assistant</h1>
        <p className="mb-4 text-sm text-muted-foreground">Sign in to continue</p>
        <form action={action} className="space-y-3">
          <Field label="Email">
            <Input name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" required autoComplete="current-password" />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
