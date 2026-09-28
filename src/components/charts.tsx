"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const PALETTE = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#475569"];
const inr = (v: number) => "₹" + new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const inrFull = (v: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

type Row = Record<string, string | number>;

export function MoneyBarChart({ data, x, y, height = 240, color = PALETTE[0] }: { data: Row[]; x: string; y: string; height?: number; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={x} fontSize={11} interval={0} angle={data.length > 6 ? -30 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 60 : 30} />
        <YAxis fontSize={11} tickFormatter={inr} width={60} />
        <Tooltip formatter={(v) => inrFull(Number(v))} />
        <Bar dataKey={y} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MultiBarChart({ data, x, bars, height = 260, percent = false }: { data: Row[]; x: string; bars: { key: string; label: string }[]; height?: number; percent?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey={x} fontSize={11} interval={0} angle={-30} textAnchor="end" height={70} />
        <YAxis fontSize={11} allowDecimals={false} tickFormatter={percent ? (v) => `${v}%` : undefined} />
        <Tooltip formatter={percent ? (v) => `${v}%` : undefined} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {bars.map((b, i) => (
          <Bar key={b.key} dataKey={b.key} name={b.label} fill={PALETTE[i % PALETTE.length]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, nameKey, valueKey, height = 240 }: { data: Row[]; nameKey: string; valueKey: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius={50} outerRadius={85} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ActivityLineChart({ data, height = 240 }: { data: Row[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" fontSize={11} interval={4} />
        <YAxis fontSize={11} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="activities" name="Activities" stroke={PALETTE[0]} dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="followupsDone" name="Follow-ups completed" stroke={PALETTE[1]} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Horizontal funnel bars with stage-to-stage percentages. */
export function Funnel({ stages }: { stages: { label: string; count: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <div className="space-y-1.5">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1].count : null;
        return (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <div className="w-24 shrink-0 text-muted-foreground">{s.label}</div>
            <div className="h-7 flex-1 rounded bg-muted">
              <div className="flex h-7 items-center rounded px-2 text-xs font-medium text-white" style={{ width: `${Math.max(4, (s.count / max) * 100)}%`, background: PALETTE[i % PALETTE.length] }}>
                {s.count}
              </div>
            </div>
            <div className="w-16 shrink-0 text-right text-xs text-muted-foreground">{prev !== null ? (prev ? `${Math.round((s.count / prev) * 100)}%` : "—") : ""}</div>
          </div>
        );
      })}
    </div>
  );
}
