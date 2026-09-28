import { eq, and, desc } from "drizzle-orm";
import { ctx, getSettings, getProfile, keyStatus, getApiKey } from "@/lib/server/core";
import { getDbWithMode, schema } from "@/lib/db/client";
import { FREE_LIMITS } from "@/lib/settings-types";
import { PageHeader } from "@/components/ui";
import { Tabs } from "@/components/client";
import { ProfileForm, ProvidersForm, LlmForm, KeysForm, TargetsForm, SuppressionForm, ExtensionForm, GmailForm, DataForm, UsageMeter } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { db, userId } = await ctx();
  const [s, p, keys, mode] = await Promise.all([getSettings(userId), getProfile(userId), keyStatus(userId), getDbWithMode()]);
  const today = new Date().toISOString().slice(0, 10);
  const usage = await db.select().from(schema.apiUsage).where(and(eq(schema.apiUsage.userId, userId), eq(schema.apiUsage.day, today)));
  const sup = await db.select().from(schema.suppressionList).where(eq(schema.suppressionList.userId, userId)).orderBy(desc(schema.suppressionList.createdAt)).limit(500);
  const gmailScopes = await getApiKey("gmail_scopes", userId);
  const extToken = await getApiKey("extension_token", userId);
  const meters = Object.entries(FREE_LIMITS).map(([id, l]) => ({ id, label: l.label, note: l.note, limit: Number.isFinite(l.daily) ? l.daily : null, used: usage.find((u) => u.provider === id)?.calls ?? 0 }));
  return (
    <>
      <PageHeader title="Settings" description={`Database: ${mode.mode === "postgres" ? "Postgres (Supabase)" : "Embedded Postgres (local, no account)"} · Everything is free-tier by default.`} />
      <Tabs storageKey="lf:settingstab" tabs={[
        { id: "profile", label: "Business profile", content: <ProfileForm p={{ displayName: p.displayName ?? "", companyName: p.companyName ?? "", services: p.services ?? "", tone: p.tone ?? "", signature: p.signature ?? "", meetingLink: p.meetingLink ?? "", phone: p.phone ?? "", languages: p.languages ?? [] }} /> },
        { id: "providers", label: "Data sources", content: <ProvidersForm s={s} keys={keys} /> },
        { id: "llm", label: "AI models", content: <LlmForm s={s} keys={keys} /> },
        { id: "keys", label: "API keys", content: <KeysForm keys={keys} /> },
        { id: "usage", label: "Usage", content: <UsageMeter meters={meters} /> },
        { id: "targets", label: "Targets", content: <TargetsForm s={s} /> },
        { id: "gmail", label: "Gmail", content: <GmailForm connected={Boolean(gmailScopes)} compose={Boolean(gmailScopes?.includes("compose"))} hasClient={keys.gmail_client_id.set && keys.gmail_client_secret.set} /> },
        { id: "extension", label: "Extension", content: <ExtensionForm hasToken={Boolean(extToken)} /> },
        { id: "compliance", label: "Compliance", content: <SuppressionForm items={sup.map((x) => ({ kind: x.kind, value: x.value, reason: x.reason ?? "", at: x.createdAt.toISOString() }))} s={s} /> },
        { id: "data", label: "Data", content: <DataForm /> },
      ]} />
    </>
  );
}
