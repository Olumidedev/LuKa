"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client, or null when the project isn't configured, in
 * which case Luka stays fully local (no login, no sync). The anon/publishable
 * key is public by design; data access is enforced by row-level security
 * (supabase/migrations).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client =
    url && key
      ? createClient(url, key, {
          auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        })
      : null;
  return client;
}

export const cloudConfigured = () => !!(url && key);

/** Google sign-in shows only once the provider is enabled in Supabase. */
export const googleEnabled = () => process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true";
