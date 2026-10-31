"use client";

import {
  Activity,
  CircleHelp,
  CreditCard,
  Building2,
  Gavel,
  House,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Radar,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, type ReactNode } from "react";
import { RadarMark, useUser } from "@/components/auth-gate";
import { CATEGORY_THEME, themeVars } from "@/lib/category-theme";
import { listenForegroundPush } from "@/lib/push";
import type { Category } from "@finance-radar/shared";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Oblast – ikona v menu má její barvu. */
  category?: Category;
}

/** Sekce ČNB, Hypotéky… jsou radar s předvoleným filtrem kategorie. */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Přehled",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Radar", href: "/radar", icon: Radar },
    ],
  },
  {
    title: "Oblasti",
    items: [
      { label: "ČNB", href: "/radar?c=cnb", icon: Landmark, category: "cnb" },
      { label: "Hypotéky", href: "/radar?c=mortgages", icon: House, category: "mortgages" },
      { label: "Úvěry", href: "/radar?c=consumer_loans", icon: CreditCard, category: "consumer_loans" },
      { label: "Nemovitosti", href: "/radar?c=real_estate", icon: Building2, category: "real_estate" },
      { label: "Pojištění", href: "/radar?c=insurance", icon: ShieldCheck, category: "insurance" },
      { label: "Investice", href: "/radar?c=markets", icon: PiggyBank, category: "markets" },
      { label: "Legislativa", href: "/legislativa", icon: Gavel, category: "legislation" },
    ],
  },
  {
    title: "Systém",
    items: [
      { label: "Nastavení", href: "/nastaveni", icon: Settings },
      { label: "Stav systému", href: "/stav", icon: Activity },
      { label: "Nápověda", href: "/napoveda", icon: CircleHelp },
    ],
  },
];

function useActiveHref(): string {
  const pathname = usePathname();
  const c = useSearchParams().get("c");
  return pathname === "/radar" && c ? `/radar?c=${c}` : pathname;
}

function NavLink({ item, active, vertical }: { item: NavItem; active: boolean; vertical: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 transition ${
        vertical ? "rounded-xl px-3 py-2" : "shrink-0 rounded-full px-3 py-1.5"
      } ${active ? "bg-surface-strong font-medium text-foreground" : "text-muted hover:bg-surface hover:text-foreground"}`}
    >
      {vertical && active && (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gradient-to-b from-accent-from to-accent-to" />
      )}
      <Icon
        size={16}
        aria-hidden
        style={item.category ? { color: CATEGORY_THEME[item.category].to } : undefined}
        className={
          active
            ? "text-accent-to drop-shadow-[0_0_6px_var(--accent-glow)]"
            : `transition group-hover:text-foreground ${item.category ? "opacity-80 group-hover:opacity-100" : "text-muted"}`
        }
      />
      {item.label}
    </Link>
  );
}

function NavLinks({ vertical }: { vertical: boolean }) {
  const active = useActiveHref();
  return (
    <>
      {NAV_GROUPS.map((g, gi) => (
        <Fragment key={g.title}>
          {vertical ? (
            <p className={`px-3 pb-1 text-[10px] font-medium uppercase tracking-widest text-muted/60 ${gi > 0 ? "pt-4" : ""}`}>
              {g.title}
            </p>
          ) : (
            gi > 0 && <span aria-hidden className="mx-1 my-2 w-px shrink-0 bg-border" />
          )}
          {g.items.map((item) => (
            <NavLink key={item.href} item={item} active={active === item.href} vertical={vertical} />
          ))}
        </Fragment>
      ))}
    </>
  );
}

/**
 * Rozvržení všech stránek: boční menu na desktopu, vodorovné menu na úzkém okně.
 * `theme` = oblast stránky – celá stránka (včetně menu) převezme její barevný gradient.
 */
export function AppShell({ children, theme }: { children: ReactNode; theme?: Category | null }) {
  const user = useUser();

  // Alerty, které přijdou při otevřené aplikaci, se zobrazí stejně jako na pozadí.
  useEffect(() => {
    let stop = () => {};
    listenForegroundPush()
      .then((s) => (stop = s))
      .catch(() => {});
    return () => stop();
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 lg:px-8" style={themeVars(theme)}>
      {theme && (
        // Jemná záře v barvě oblasti v horní části stránky.
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[60vh] transition-colors duration-500"
          style={{
            background:
              "radial-gradient(45rem 28rem at 80% -10%, color-mix(in srgb, var(--accent-to) 22%, transparent), transparent 70%), radial-gradient(35rem 22rem at 20% -15%, color-mix(in srgb, var(--accent-from) 18%, transparent), transparent 70%)",
          }}
        />
      )}
      <aside className="glass sticky top-6 hidden h-[calc(100vh-3rem)] w-56 shrink-0 flex-col rounded-3xl p-4 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2 py-2">
          <RadarMark className="size-8" />
          <span className="font-semibold tracking-tight">Finance Radar</span>
        </Link>
        <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto text-sm" aria-label="Hlavní menu">
          <Suspense fallback={null}>
            <NavLinks vertical />
          </Suspense>
        </nav>
        <div className="mt-3 truncate border-t border-border px-2 pt-3 text-xs text-muted">{user.email}</div>
      </aside>

      <div className="min-w-0 flex-1">
        <nav className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1 text-sm lg:hidden" aria-label="Hlavní menu">
          <Suspense fallback={null}>
            <NavLinks vertical={false} />
          </Suspense>
        </nav>
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
