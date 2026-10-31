import type { Category } from "@finance-radar/shared";
import {
  Banknote,
  Briefcase,
  Building2,
  CreditCard,
  Euro,
  Gavel,
  House,
  Landmark,
  PiggyBank,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { themeVars } from "@/lib/category-theme";

/** Jedna ikona na oblast – používá menu, radar, trendy i detail události. */
export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  cnb: Landmark,
  mortgages: House,
  consumer_loans: CreditCard,
  banks: Briefcase,
  real_estate: Building2,
  insurance: ShieldCheck,
  economy: TrendingUp,
  legislation: Gavel,
  markets: PiggyBank,
};

export const INDICATOR_ICONS: Record<string, LucideIcon> = {
  repo_rate: Landmark,
  mortgage_rate: House,
  mortgage_volume: Banknote,
  inflation: ShoppingCart,
  eur_czk: Euro,
  consumer_loan_rate: CreditCard,
  savings_rate: PiggyBank,
};

type Tone = "accent" | "critical" | "high" | "info" | "muted";

const TONES: Record<Tone, string> = {
  accent: "from-accent-from/25 to-accent-to/25 text-accent-to ring-accent-to/30",
  critical: "from-critical/25 to-critical/10 text-critical ring-critical/40",
  high: "from-high/25 to-high/10 text-high ring-high/40",
  info: "from-info/25 to-info/10 text-info ring-info/40",
  muted: "from-surface-strong to-surface text-muted ring-border",
};

/**
 * Ikona v jemně zbarveném kroužku s gradientem (karty, dlaždice, nadpisy).
 * S `category` má kroužek barvy dané oblasti (viz lib/category-theme.ts).
 */
export function IconBadge({
  icon: Icon,
  tone = "accent",
  size = "md",
  category,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md";
  category?: Category | null;
}) {
  const box = size === "sm" ? "size-7" : "size-9";
  const icon = size === "sm" ? 14 : 18;
  return (
    <span
      aria-hidden
      style={themeVars(category)}
      className={`inline-grid ${box} shrink-0 place-items-center rounded-xl bg-gradient-to-br ring-1 ${TONES[category ? "accent" : tone]}`}
    >
      <Icon size={icon} strokeWidth={2} />
    </span>
  );
}
