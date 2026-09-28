import { NextResponse } from "next/server";
import { ctx, getApiKey } from "@/lib/server/core";
import { GMAIL_SCOPES } from "@/lib/server/inbox";
import { sign } from "@/lib/crypto";

export async function GET(req: Request) {
  const { userId } = await ctx();
  const url = new URL(req.url);
  const clientId = await getApiKey("gmail_client_id", userId);
  if (!clientId) return NextResponse.redirect(new URL("/settings?gmail=missing-client#gmail", url));
  const scopes = [GMAIL_SCOPES.readonly, ...(url.searchParams.get("compose") ? [GMAIL_SCOPES.compose] : [])].join(" ");
  const redirect = `${url.origin}/api/gmail/callback`;
  const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope: scopes, access_type: "offline", prompt: "consent", state: sign(`${userId}:${Date.now()}`) });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}
