import type { Category } from "@finance-radar/shared";
import type { CSSProperties } from "react";

/**
 * Barevný gradient každé oblasti. Odstíny jsou zvolené tak, aby byly dobře čitelné
 * na tmavém pozadí a od sebe odlišitelné (úvěry teplé, pojištění růžové, investice zelené…).
 */
export const CATEGORY_THEME: Record<Category, { from: string; to: string }> = {
  cnb: { from: "#6366f1", to: "#a78bfa" },
  mortgages: { from: "#0ea5e9", to: "#22d3ee" },
  consumer_loans: { from: "#f97316", to: "#facc15" },
  real_estate: { from: "#10b981", to: "#6ee7b7" },
  insurance: { from: "#f43f5e", to: "#fb7185" },
  markets: { from: "#65a30d", to: "#4ade80" },
  legislation: { from: "#c026d3", to: "#f0abfc" },
  banks: { from: "#3b82f6", to: "#93c5fd" },
  // Obecná oblast bez vlastní sekce – neutrální ocelová, aby se nepletla se zelenými.
  economy: { from: "#64748b", to: "#cbd5e1" },
};

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha})`;
}

/**
 * Přepíše akcentové CSS proměnné pro podstrom – všechny prvky, které používají
 * `accent-from` / `accent-to` / `--accent-glow`, se přebarví do barev oblasti.
 */
export function themeVars(category: Category | null | undefined): CSSProperties | undefined {
  if (!category) return undefined;
  const t = CATEGORY_THEME[category];
  return {
    "--accent-from": t.from,
    "--accent-to": t.to,
    "--accent-glow": rgba(t.from, 0.55),
  } as CSSProperties;
}
