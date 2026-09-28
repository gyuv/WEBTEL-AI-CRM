import * as React from "react";
import { cn } from "@/lib/utils";

type BtnVariant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "success";
type BtnSize = "sm" | "md" | "lg" | "icon" | "xl";

export function buttonClass(variant: BtnVariant = "primary", size: BtnSize = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all active:scale-[.98] disabled:pointer-events-none disabled:opacity-50",
    {
      primary: "bg-primary text-primary-fg shadow-sm hover:bg-primary/90",
      secondary: "bg-muted text-fg hover:bg-muted/70",
      ghost: "text-fg hover:bg-muted",
      outline: "border border-border bg-card hover:bg-muted",
      danger: "bg-danger text-white hover:bg-danger/90",
      success: "bg-success text-white hover:bg-success/90",
    }[variant],
    { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-sm", lg: "h-11 px-5 text-base", xl: "h-16 px-8 text-lg", icon: "h-9 w-9" }[size],
    className,
  );
}

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }>(
  ({ className, variant, size, ...p }, ref) => <button ref={ref} className={buttonClass(variant, size, className)} {...p} />,
);
Button.displayName = "Button";

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-border bg-card shadow-sm", className)} {...p} />;
}
export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-fg">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function CardBody({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...p} />;
}

const field = "w-full rounded-md border border-border bg-card px-3 text-sm placeholder:text-muted-fg/70 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, "h-9", className)} {...p} />
));
Input.displayName = "Input";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, "min-h-[80px] py-2", className)} {...p} />
));
Textarea.displayName = "Textarea";
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(field, "h-9 pr-8", className)} {...p} />
));
Select.displayName = "Select";

export function Label({ className, ...p }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-xs font-medium text-muted-fg", className)} {...p} />;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-fg">{hint}</p>}
    </div>
  );
}

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "info" | "accent";
const tones: Record<Tone, string> = {
  default: "bg-muted text-muted-fg border-border",
  primary: "bg-primary/10 text-primary border-primary/20",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-danger/10 text-danger border-danger/20",
  info: "bg-info/10 text-info border-info/20",
  accent: "bg-accent/10 text-accent border-accent/20",
};
export function Badge({ tone = "default", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)} {...p} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} />;
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 text-primary">{icon}</div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs text-muted-fg">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-fg">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-fg">{label}{icon}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-fg">{sub}</div>}
    </Card>
  );
}

export function ScoreRing({ value, size = 40 }: { value: number; size?: number }) {
  const r = size / 2 - 3, c = 2 * Math.PI * r;
  const color = value >= 70 ? "hsl(var(--success))" : value >= 45 ? "hsl(var(--warning))" : "hsl(var(--muted-fg))";
  return (
    <svg width={size} height={size} className="shrink-0" role="img" aria-label={`Score ${value}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={c} strokeDashoffset={c - (c * value) / 100} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" className="fill-fg text-[11px] font-semibold">{value}</text>
    </svg>
  );
}

export function ConfidenceBadge({ value, method }: { value: number; method?: string }) {
  const tone: Tone = method === "guessed" ? "warning" : value >= 80 ? "success" : value >= 55 ? "info" : "default";
  return <Badge tone={tone}>{method === "guessed" ? `Guessed ${value}%` : `${value}%`}</Badge>;
}
