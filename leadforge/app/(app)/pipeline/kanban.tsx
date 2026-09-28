"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ScoreRing } from "@/components/ui";
import { setStatusAction } from "@/app/actions";
import { cn, inr, statusLabel } from "@/lib/utils";

const COLS = ["researched", "contacted", "replied", "interested", "meeting_booked", "proposal", "won", "lost", "unsubscribed"];
const COLOR: Record<string, string> = { researched: "bg-info", contacted: "bg-primary", replied: "bg-accent", interested: "bg-success", meeting_booked: "bg-success", proposal: "bg-warning", won: "bg-success", lost: "bg-danger", unsubscribed: "bg-danger" };
type L = { id: string; name: string; status: string; score: number; category: string | null; dealValue: number | null; nextFollowUpAt: string | null };

export function Kanban({ leads: initial }: { leads: L[] }) {
  const [leads, setLeads] = React.useState(initial);
  React.useEffect(() => setLeads(initial), [initial]);
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }));
  const onEnd = async (e: DragEndEvent) => {
    const to = e.over?.id as string | undefined;
    const lead = leads.find((l) => l.id === e.active.id);
    if (!to || !lead || lead.status === to) return;
    const prev = leads;
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, status: to } : l))); // optimistic
    const r = await setStatusAction(lead.id, to, "Moved on pipeline board");
    if ("error" in r && r.error) { setLeads(prev); toast.error(r.error); } else { toast.success(`${lead.name} → ${statusLabel(to)}`); router.refresh(); }
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onEnd}>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4">
        {COLS.map((c) => {
          const items = leads.filter((l) => l.status === c);
          return <Column key={c} id={c} items={items} total={items.reduce((s, l) => s + (l.dealValue ?? 0), 0)} />;
        })}
      </div>
    </DndContext>
  );
}

function Column({ id, items, total }: { id: string; items: L[]; total: number }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("flex w-64 shrink-0 flex-col rounded-lg border border-border bg-muted/40 transition-colors", isOver && "border-primary bg-primary/5")}>
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium"><span className={cn("h-2 w-2 rounded-full", COLOR[id])} />{statusLabel(id)}<span className="text-muted-fg">{items.length}</span><span className="ml-auto text-muted-fg">{total ? inr(total) : ""}</span></div>
      <div className="flex max-h-[calc(100dvh-230px)] min-h-[120px] flex-col gap-2 overflow-y-auto p-2">{items.map((l) => <CardItem key={l.id} l={l} />)}</div>
    </div>
  );
}

function CardItem({ l }: { l: L }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: l.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn("cursor-grab touch-none rounded-md border border-border bg-card p-2.5 shadow-sm active:cursor-grabbing", isDragging && "z-50 rotate-2 shadow-xl")}>
      <div className="flex items-start gap-2">
        <ScoreRing value={l.score} size={26} />
        <div className="min-w-0 flex-1"><a href={`/leads/${l.id}`} onPointerDown={(e) => e.stopPropagation()} className="block truncate text-sm font-medium hover:underline">{l.name}</a><p className="truncate text-[11px] text-muted-fg">{l.category}</p></div>
      </div>
      {(l.dealValue || l.nextFollowUpAt) ? <div className="mt-1.5 flex justify-between text-[11px] text-muted-fg"><span>{l.dealValue ? inr(l.dealValue) : ""}</span><span>{l.nextFollowUpAt ? `⏰ ${new Date(l.nextFollowUpAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</span></div> : null}
    </div>
  );
}
