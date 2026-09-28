import { LayoutDashboard, Radar, Building2, Users, Sparkles, Phone, Mail, Inbox, KanbanSquare, Package, BarChart3, Settings } from "lucide-react";

export const NAV = [
  { href: "/dashboard", label: "Today", short: "Today", key: "t", icon: LayoutDashboard, mobile: true },
  { href: "/discover", label: "Discover", short: "Find", key: "d", icon: Radar, mobile: true },
  { href: "/leads", label: "Leads", key: "l", icon: Building2, mobile: true },
  { href: "/people", label: "People", key: "p", icon: Users },
  { href: "/calls", label: "Call desk", short: "Calls", key: "c", icon: Phone, mobile: true },
  { href: "/email", label: "Email", key: "e", icon: Mail },
  { href: "/inbox", label: "Inbox", short: "Inbox", key: "i", icon: Inbox, mobile: true },
  { href: "/pipeline", label: "Pipeline", key: "k", icon: KanbanSquare },
  { href: "/products", label: "My products", key: "o", icon: Package },
  { href: "/insights", label: "Insights", key: "n", icon: Sparkles },
  { href: "/reports", label: "Reports", key: "r", icon: BarChart3 },
  { href: "/settings", label: "Settings", key: "s", icon: Settings },
];
