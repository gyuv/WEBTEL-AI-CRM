import Link from "next/link";
import { requirePageActor } from "@/server/session";
import { globalSearch } from "@/server/services/search";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requirePageActor();
  const { q = "" } = await searchParams;
  const hits = await globalSearch(actor, q);
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Search: “${q}”`} description={`${hits.length} result(s)`} />
      <Card>
        {hits.map((h) => (
          <Link key={h.type + h.id} href={h.href} className="flex items-center gap-3 border-b px-4 py-2 hover:bg-muted/50">
            <Badge tone="x">{h.type}</Badge>
            <div><div className="text-sm font-medium">{h.title}</div>{h.subtitle && <div className="text-xs text-muted-foreground">{h.subtitle}</div>}</div>
          </Link>
        ))}
        {!hits.length && <Empty>No results. Try a name, phone, email, quotation number, source or campaign.</Empty>}
      </Card>
    </div>
  );
}
