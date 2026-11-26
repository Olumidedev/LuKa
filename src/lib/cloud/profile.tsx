"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { getSupabase } from "./supabase";

interface Profile {
  /** What LUKA calls the signed-in person (never another household member's name). */
  name: string;
  /** The name saved in My account, if any. */
  displayName: string | null;
  setDisplayName: (v: string) => Promise<boolean>;
}

const Ctx = createContext<Profile>({ name: "", displayName: null, setDisplayName: async () => false });
export const useProfile = () => useContext(Ctx);

const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? "";

/** The signed-in person's own profile. Each account gets its own name, separate from the household. */
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [displayName, setName] = useState<string | null>(null);

  useEffect(() => {
    setName(null);
    const sb = getSupabase();
    if (!sb || !user) return;
    let live = true;
    (async () => {
      const { data } = await sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      if (!live) return;
      let v = (data?.display_name as string | null) ?? null;
      // First visit: use the name given at registration, or from Google.
      const meta = user.user_metadata ?? {};
      const fromSignup = String(meta.display_name ?? meta.full_name ?? meta.name ?? "").trim().slice(0, 80);
      if (!v && fromSignup) {
        const { error } = await sb.from("profiles").update({ display_name: fromSignup }).eq("id", user.id);
        if (!error) v = fromSignup;
      }
      if (live) setName(v);
    })();
    return () => {
      live = false;
    };
  }, [user]);

  const setDisplayName = useCallback(
    async (v: string) => {
      const sb = getSupabase();
      if (!sb || !user) return false;
      const clean = v.trim().slice(0, 80) || null;
      const { error } = await sb.from("profiles").update({ display_name: clean }).eq("id", user.id);
      if (error) return false;
      setName(clean);
      return true;
    },
    [user],
  );

  const value = useMemo<Profile>(
    () => ({ name: displayName?.trim() || firstWord(String(user?.user_metadata?.full_name ?? "")) || user?.email?.split("@")[0] || "", displayName, setDisplayName }),
    [displayName, user, setDisplayName],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
