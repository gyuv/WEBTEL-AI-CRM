import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, requireActor, type Actor } from "@/server/session";

export function errorResponse(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status === 403 && /rate limit/i.test(e.message) ? 429 : e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: "Validation failed", issues: e.flatten() }, { status: 400 });
  if (e instanceof Error && !/prisma/i.test(e.constructor.name)) return NextResponse.json({ error: e.message }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/** Wraps a route handler with authentication and uniform error handling. */
export function withActor<T extends unknown[]>(fn: (actor: Actor, ...args: T) => Promise<Response>) {
  return async (...args: T) => {
    try {
      const actor = await requireActor();
      return await fn(actor, ...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
