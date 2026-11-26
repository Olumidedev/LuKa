"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { getSupabase } from "./supabase";

/**
 * True only for signed-in admins. Decides whether the Admin tab exists at all;
 * the data behind it is separately protected by admin-only database functions.
 */
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    const sb = getSupabase();
    if (!user || !sb) return setAdmin(false);
    let live = true;
    sb.rpc("is_admin").then(({ data, error }) => live && setAdmin(!error && data === true));
    return () => {
      live = false;
    };
  }, [user]);
  return admin;
}
