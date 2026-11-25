"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSupabase } from "./supabase";

interface Auth {
  /** False until the stored session (if any) has been read. */
  ready: boolean;
  configured: boolean;
  user: User | null;
  session: Session | null;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<Auth>({ ready: true, configured: false, user: null, session: null, signOut: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const sb = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!sb);

  useEffect(() => {
    if (!sb) return;
    let live = true;
    sb.auth.getSession().then(({ data }) => {
      if (!live) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [sb]);

  const value = useMemo<Auth>(
    () => ({
      ready,
      configured: !!sb,
      session,
      user: session?.user ?? null,
      signOut: async () => {
        await sb?.auth.signOut();
      },
    }),
    [ready, sb, session],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
