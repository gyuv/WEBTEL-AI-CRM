import "server-only";
import { cookies } from "next/headers";
import { sign, verify } from "./crypto";

export const SESSION_COOKIE = "lf_session";
export const OWNER_ID = "owner";

export function loginRequired() {
  return Boolean(process.env.APP_PASSWORD);
}

/** Single-user app: when APP_PASSWORD is set, a signed cookie is required; otherwise personal mode. */
export async function currentUserId(): Promise<string> {
  if (!loginRequired()) return OWNER_ID;
  const c = (await cookies()).get(SESSION_COOKIE)?.value;
  const v = verify(c);
  if (!v) throw new Error("UNAUTHENTICATED");
  return v.split(":")[0] || OWNER_ID;
}

export function makeSessionValue() {
  return sign(`${OWNER_ID}:${Date.now()}`);
}
