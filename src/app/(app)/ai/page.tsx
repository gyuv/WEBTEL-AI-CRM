import { requirePageActor } from "@/server/session";
import { aiConfigured } from "@/server/ai/assistant";
import { AnalyticsChat } from "@/components/analytics-chat";
import { PageHeader } from "@/components/ui";

export default async function AiAnalyticsPage() {
  await requirePageActor();
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="AI Analytics Assistant"
        description={`Ask questions about your CRM. Answers come from controlled server-side analytics functions over live data — no AI-generated SQL. ${aiConfigured() ? "" : "(OPENAI_API_KEY not set: using built-in question router.)"}`}
      />
      <AnalyticsChat />
    </div>
  );
}
