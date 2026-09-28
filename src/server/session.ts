import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginRequired } from "@/lib/login-mode";

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

const OWNER_EMAIL = "owner@local";

/**
 * Personal (no-login) mode: everyone using the app acts as one ADMIN owner account,
 * created on first use with an unusable random password.
 */
async function ownerActor(): Promise<Actor> {
  const u = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    create: { email: OWNER_EMAIL, name: "Owner", role: "ADMIN", passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10) },
    update: { active: true, role: "ADMIN" },
  });
  return { id: u.id, role: u.role, name: u.name };
}

export async function getActor(): Promise<Actor | null> {
  if (!loginRequired()) {
    await connection(); // mark the request as dynamic so nothing touching the DB is pre-rendered
    return ownerActor();
  }
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
