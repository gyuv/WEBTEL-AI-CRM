"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Input, Select } from "@/components/ui";

export function DateFilter() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const [range, setRange] = useState(sp.get("range") ?? "all");
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");
  const apply = (r: string, f = from, t = to) => {
    const p = new URLSearchParams(sp);
    p.set("range", r);
    if (r === "custom") {
      if (f) p.set("from", f); else p.delete("from");
      if (t) p.set("to", t); else p.delete("to");
    } else {
      p.delete("from");
      p.delete("to");
    }
    router.push(`${path}?${p.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        className="w-40"
        value={range}
        onChange={(e) => {
          setRange(e.target.value);
          if (e.target.value !== "custom") apply(e.target.value);
        }}
      >
        <option value="all">All time</option>
        <option value="today">Today</option>
        <option value="week">This Week</option>
        <option value="month">This Month</option>
        <option value="last_month">Last Month</option>
        <option value="custom">Custom Range</option>
      </Select>
      {range === "custom" && (
        <>
          <Input type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
          <Button size="sm" onClick={() => apply("custom")}>Apply</Button>
        </>
      )}
    </div>
  );
}
