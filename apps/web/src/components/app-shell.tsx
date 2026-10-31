"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { RadarMark, useUser } from "@/components/auth-gate";

interface NavItem {
  label: string;
  href: string;
  disabled?: boolean;
}

/** Sekce ČNB, Hypotéky… jsou radar s předvoleným filtrem kategorie. */
const NAV: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "Radar", href: "/radar" },
  { label: "ČNB", href: "/radar?c=cnb" },
  { label: "Hypotéky", href: "/radar?c=mortgages" },
  { label: "Nemovitosti", href: "/radar?c=real_estate" },
  { label: "Legislativa", href: "/radar?c=legislation" },
  { label: "Briefing", href: "#", disabled: true },
];

function useActiveHref(): string {
  const pathname = usePathname();
  const c = useSearchParams().get("c");
  return pathname === "/radar" && c ? `/radar?c=${c}` : pathname;
}

function NavLinks({ vertical }: { vertical: boolean }) {
  const active = useActiveHref();
  return (
    <>
      {NAV.map((item) => {
        const isActive = active === item.href || (item.href === "/" && active === "/");
        const base = vertical ? "rounded-xl px-3 py-2" : "shrink-0 rounded-full px-3 py-1.5";
        if (item.disabled) {
          return (
            <span key={item.label} className={`${base} cursor-default text-muted/60`} title="Připravujeme">
              {item.label}
            </span>
          );
        }
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`${base} transition ${
              isActive ? "bg-surface-strong font-medium text-foreground" : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

/** Rozvržení všech stránek: boční menu na desktopu, vodorovné menu na úzkém okně. */
export function AppShell({ children }: { children: ReactNode }) {
  const user = useUser();
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 lg:px-8">
      <aside className="glass sticky top-6 hidden h-[calc(100vh-3rem)] w-56 shrink-0 flex-col rounded-3xl p-4 lg:flex">
        <Link href="/" className="flex items-center gap-3 px-2 py-2">
          <RadarMark className="size-8" />
          <span className="font-semibold tracking-tight">Finance Radar</span>
        </Link>
        <nav className="mt-6 flex flex-col gap-1 text-sm" aria-label="Hlavní menu">
          <Suspense fallback={null}>
            <NavLinks vertical />
          </Suspense>
        </nav>
        <div className="mt-auto truncate px-2 text-xs text-muted">{user.email}</div>
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
