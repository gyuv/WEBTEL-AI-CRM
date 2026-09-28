export type RangeKey = "today" | "week" | "month" | "last_month" | "custom" | "all";

export interface DateRange {
  from?: Date;
  to?: Date;
}

export function resolveRange(key: string | undefined, from?: string, to?: string, now = new Date()): DateRange {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (key) {
    case "today": {
      const f = start(now);
      return { from: f, to: new Date(f.getTime() + 86400000) };
    }
    case "week": {
      const f = start(now);
      const day = (f.getDay() + 6) % 7; // Monday start
      f.setDate(f.getDate() - day);
      return { from: f, to: new Date(f.getTime() + 7 * 86400000) };
    }
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
    case "last_month":
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
    case "custom": {
      const r: DateRange = {};
      if (from && !isNaN(Date.parse(from))) r.from = new Date(from);
      if (to && !isNaN(Date.parse(to))) r.to = new Date(new Date(to).getTime() + 86400000);
      return r;
    }
    default:
      return {};
  }
}

export function rangeWhere(r: DateRange): { gte?: Date; lt?: Date } | undefined {
  if (!r.from && !r.to) return undefined;
  return { ...(r.from ? { gte: r.from } : {}), ...(r.to ? { lt: r.to } : {}) };
}
