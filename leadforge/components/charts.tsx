"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, FunnelChart, Funnel, LabelList, Cell } from "recharts";

const axis = { stroke: "hsl(var(--muted-fg))", fontSize: 11, tickLine: false, axisLine: false };
const tip = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "hsl(var(--fg))" } };

export function TrendChart({ data, keys }: { data: Record<string, string | number>[]; keys: { key: string; label: string; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <defs>{keys.map((k) => <linearGradient key={k.key} id={`g-${k.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={k.color} stopOpacity={0.35} /><stop offset="1" stopColor={k.color} stopOpacity={0} /></linearGradient>)}</defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="day" {...axis} /><YAxis allowDecimals={false} {...axis} /><Tooltip {...tip} />
        {keys.map((k) => <Area key={k.key} type="monotone" dataKey={k.key} name={k.label} stroke={k.color} fill={`url(#g-${k.key})`} strokeWidth={2} />)}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Bars({ data, x, y, color = "hsl(var(--primary))", height = 220, layout = "horizontal" }: { data: Record<string, string | number>[]; x: string; y: string; color?: string; height?: number; layout?: "horizontal" | "vertical" }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={layout} margin={{ left: layout === "vertical" ? 40 : -20, right: 8, top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={layout === "vertical"} horizontal={layout === "horizontal"} />
        {layout === "horizontal" ? <><XAxis dataKey={x} {...axis} /><YAxis allowDecimals={false} {...axis} /></> : <><XAxis type="number" allowDecimals={false} {...axis} /><YAxis type="category" dataKey={x} width={110} {...axis} /></>}
        <Tooltip {...tip} cursor={{ fill: "hsl(var(--muted))" }} />
        <Bar dataKey={y} fill={color} radius={4} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const FUNNEL_COLORS = ["#6366f1", "#7c6cf2", "#8b5cf6", "#a855f7", "#c026d3", "#db2777", "#16a34a"];
export function Funnel7({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <FunnelChart>
        <Tooltip {...tip} />
        <Funnel dataKey="value" data={data} isAnimationActive>
          {data.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />)}
          <LabelList position="right" fill="hsl(var(--fg))" stroke="none" dataKey="name" fontSize={11} />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}
