import type { Firestore } from "firebase-admin/firestore";

/**
 * Provozní nastavení v dokumentu `config/runtime`, upravuje se ručně ve Firebase konzoli
 * (bez nasazování kódu).
 *
 *   pausedUntil: "2027-01-01"   – do tohoto dne (půlnoc Europe/Prague) je pozastaveno vše
 *                                 automatické: sběr článků, ukazatele i AI. Smazáním pole
 *                                 nebo dnešním datem se provoz obnoví při nejbližším běhu.
 */
export interface RuntimeConfig {
  pausedUntil?: string;
}

export type PauseState = { paused: false; invalid?: string } | { paused: true; until: string };

/** Půlnoc daného dne v pražském čase jako okamžik (počítá se zimní i letní čas). */
export function pragueMidnight(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const utcMidnight = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(utcMidnight.getTime())) return null;
  // Posun Prahy proti UTC v daný den (1 h v zimě, 2 h v létě).
  const pragueHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", hourCycle: "h23" }).format(
      utcMidnight,
    ),
  );
  return new Date(utcMidnight.getTime() - pragueHour * 3_600_000);
}

export function pauseState(config: RuntimeConfig | undefined, now: Date): PauseState {
  const until = config?.pausedUntil?.trim();
  if (!until) return { paused: false };
  const resumeAt = pragueMidnight(until);
  // Neplatné datum provoz nezastaví – raději běžet, než potichu stát.
  if (!resumeAt) return { paused: false, invalid: until };
  return now < resumeAt ? { paused: true, until } : { paused: false };
}

export async function readPauseState(db: Firestore, now = new Date()): Promise<PauseState> {
  const snap = await db.collection("config").doc("runtime").get();
  return pauseState(snap.data() as RuntimeConfig | undefined, now);
}
