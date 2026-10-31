import type { Category, DashboardSnapshot } from "@finance-radar/shared";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Gauge } from "lucide-react";
import { IconBadge, INDICATOR_ICONS } from "@/components/icons";
import { formatNumber, formatPeriod } from "@/lib/format";

type Indicator = DashboardSnapshot["indicators"][number];

/** Ukazatele, které patří k jednotlivým sekcím (zobrazí se nad seznamem událostí). */
export const SECTION_INDICATORS: Partial<Record<Category, string[]>> = {
  cnb: ["repo_rate", "inflation", "eur_czk"],
  mortgages: ["mortgage_rate", "mortgage_volume", "repo_rate"],
  consumer_loans: ["consumer_loan_rate", "repo_rate", "inflation"],
  real_estate: ["mortgage_rate", "mortgage_volume"],
  markets: ["savings_rate", "inflation", "eur_czk"],
  economy: ["inflation", "eur_czk", "repo_rate"],
};

export function IndicatorCard({ ind }: { ind: Indicator }) {
  const ChangeIcon = ind.change === undefined || ind.change === 0 ? ArrowRight : ind.change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="glass group rounded-2xl p-4 transition hover:bg-surface-strong">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted">{ind.label}</p>
        <IconBadge icon={INDICATOR_ICONS[ind.id] ?? Gauge} size="sm" />
      </div>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
        {formatNumber(ind.value, ind.decimals)} <span className="text-base text-muted">{ind.unit}</span>
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
        {ind.change !== undefined && (
          <span className="inline-flex items-center gap-0.5 text-foreground/80">
            <ChangeIcon size={14} aria-hidden />
            {ind.change > 0 ? "+" : ""}
            {formatNumber(ind.change, ind.changeUnit === "%" ? 1 : 2)} {ind.changeUnit}
            {ind.changeLabel ? ` ${ind.changeLabel}` : ""}
          </span>
        )}
        <span>{formatPeriod(ind.asOf)}</span>
      </p>
    </div>
  );
}
