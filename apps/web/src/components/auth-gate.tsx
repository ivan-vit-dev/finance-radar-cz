"use client";

import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth } from "@/lib/firebase";

const UserContext = createContext<User | null>(null);

export function useUser(): User {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser musí být uvnitř <AuthGate>");
  return user;
}

/**
 * Jednorázové přihlášení Googlem. Session drží Firebase Auth v prohlížeči
 * trvale, takže přihlašovací obrazovka se ukáže jen poprvé.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) {
    return <div className="grid min-h-screen place-items-center text-muted">Načítám…</div>;
  }

  if (!user) {
    const signIn = async () => {
      setError(null);
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };

    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="glass glow-accent w-full max-w-sm rounded-3xl p-8 text-center">
          <RadarMark className="mx-auto mb-6 size-14" />
          <h1 className="text-2xl font-semibold tracking-tight">Finance Radar</h1>
          <p className="mt-2 text-sm text-muted">Váš přehled českého finančního trhu. Každý den.</p>
          <button
            onClick={signIn}
            className="mt-8 w-full rounded-xl bg-gradient-to-r from-accent-from to-accent-to px-4 py-3 font-medium text-white shadow-[0_0_24px_-4px_var(--accent-glow)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-to"
          >
            Přihlásit se Googlem
          </button>
          {error && <p className="mt-4 text-sm text-critical">{error}</p>}
        </div>
      </main>
    );
  }

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function RadarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id="radar-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-from)" />
          <stop offset="1" stopColor="var(--accent-to)" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21" fill="none" stroke="url(#radar-g)" strokeWidth="2" opacity=".5" />
      <circle cx="24" cy="24" r="13" fill="none" stroke="url(#radar-g)" strokeWidth="2" opacity=".75" />
      <path d="M24 24 L24 3 A21 21 0 0 1 42.2 13.5 Z" fill="url(#radar-g)" opacity=".35" />
      <circle cx="33" cy="15" r="3" fill="var(--accent-to)" />
      <circle cx="24" cy="24" r="2.5" fill="url(#radar-g)" />
    </svg>
  );
}
