import { auth } from "@/auth";
import { redirect } from "next/navigation";

export interface Actor {
  id: string;
  role: "USER" | "ADMIN";
  name?: string | null;
}

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id, role: session.user.role, name: session.user.name };
}

/** For server components/pages: redirect to login when unauthenticated. */
export async function requirePageActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect("/login");
  return a;
}

/** For server actions / route handlers. */
export async function requireActor(): Promise<Actor> {
  const a = await getActor();
  if (!a) throw new AuthError(401, "Not authenticated");
  return a;
}

export function assertAdmin(actor: Actor) {
  if (actor.role !== "ADMIN") throw new AuthError(403, "Admin access required");
}
