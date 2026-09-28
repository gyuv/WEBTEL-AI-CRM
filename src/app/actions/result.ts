import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AuthError } from "@/server/session";

export type ActionResult = { ok: true; message?: string; redirect?: string; id?: string } | { ok: false; error: string };

export function toActionError(e: unknown): ActionResult {
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return { ok: false, error: first ? `${first.path.join(".") || "Input"}: ${first.message}` : "Invalid input" };
  }
  if (e instanceof AuthError) return { ok: false, error: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return { ok: false, error: "A record with this value already exists" };
    if (e.code === "P2025") return { ok: false, error: "Record not found" };
    console.error(e);
    return { ok: false, error: "Database error" };
  }
  if (e instanceof Error) return { ok: false, error: e.message };
  return { ok: false, error: "Unexpected error" };
}

/** FormData → plain object; repeated keys become arrays; checkbox "on" → true. */
export function formToObject(fd: FormData, arrays: string[] = [], booleans: string[] = []): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (arrays.includes(k)) o[k] = [...((o[k] as unknown[]) ?? []), v];
    else o[k] = typeof v === "string" ? v : undefined;
  }
  for (const a of arrays) o[a] ??= [];
  for (const b of booleans) o[b] = fd.get(b) === "on" || fd.get(b) === "true";
  return o;
}
