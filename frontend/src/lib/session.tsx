"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type AuthSession, refreshSession, type Role, setAccessToken, setSessionLostHandler } from "@/lib/api";

type State = { status: "loading" } | { status: "anon" } | { status: "authed"; session: AuthSession };

type Ctx = {
  state: State;
  login: (email: string, password: string) => Promise<AuthSession>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

/** Where each role lands after login. Buyer storefront pages arrive in Phase 3. */
export function homeFor(role: Role): string {
  if (role === "SUPER_ADMIN") return "/admin";
  if (role === "BUYER_USER") return "/shop";
  return "/portal";
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    setSessionLostHandler(() => setState({ status: "anon" }));
    // Silent refresh: the httpOnly cookie restores the session after a reload.
    void refreshSession().then((s) => setState(s ? { status: "authed", session: s } : { status: "anon" }));
    return () => setSessionLostHandler(undefined);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const s = await api<AuthSession>("/auth/login", { method: "POST", body: { email, password } });
    setAccessToken(s.accessToken);
    setState({ status: "authed", session: s });
    return s;
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setAccessToken(undefined);
    setState({ status: "anon" });
  }, []);

  const value = useMemo(() => ({ state, login, logout }), [state, login, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}

/** For layouts: sends signed-out users to /login and other roles to their own area. Returns the session once allowed. */
export function useRequireRole(allowed: Role[]): AuthSession | null {
  const { state } = useSession();
  const router = useRouter();
  const session = state.status === "authed" ? state.session : null;
  const ok = !!session && allowed.includes(session.role);
  useEffect(() => {
    if (state.status === "anon") router.replace("/login");
    else if (session && !ok) router.replace(homeFor(session.role));
  }, [state.status, session, ok, router]);
  return ok ? session : null;
}
