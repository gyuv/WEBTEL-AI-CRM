import { NextResponse } from "next/server";
import { getApiKey } from "@/lib/server/core";
import { saveGmailRefresh } from "@/lib/server/inbox";
import { verify } from "@/lib/crypto";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = verify(url.searchParams.get("state"));
  if (!state) return NextResponse.redirect(new URL("/settings?gmail=bad-state#gmail", url));
  const [userId, ts] = state.split(":");
  if (Date.now() - Number(ts) > 15 * 60 * 1000) return NextResponse.redirect(new URL("/settings?gmail=expired#gmail", url));
  const code = url.searchParams.get("code");
  const cid = await getApiKey("gmail_client_id", userId), secret = await getApiKey("gmail_client_secret", userId);
  if (!code || !cid || !secret) return NextResponse.redirect(new URL("/settings?gmail=error#gmail", url));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: cid, client_secret: secret, redirect_uri: `${url.origin}/api/gmail/callback`, grant_type: "authorization_code" }),
  });
  const j = (await r.json()) as { refresh_token?: string; scope?: string };
  if (!r.ok || !j.refresh_token) return NextResponse.redirect(new URL("/settings?gmail=no-refresh#gmail", url));
  await saveGmailRefresh(userId, j.refresh_token, j.scope ?? "");
  return NextResponse.redirect(new URL("/settings?gmail=connected#gmail", url));
}
