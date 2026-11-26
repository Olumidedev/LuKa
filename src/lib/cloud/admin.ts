"use client";

import type { AppConfig } from "./configData";
import { getSupabase } from "./supabase";

export interface Overview {
  days: number;
  totals: {
    users: number;
    new_users: number;
    households: number;
    shared_households: number;
    active_devices: number;
    active_devices_7d: number;
    errors: number;
    feedback: number;
  };
  daily: { day: string; devices: number; signups: number }[];
  events: Record<string, number>;
  funnel: { opened: number; onboarded: number; planned: number; shopped: number; cooked: number };
  plan_types: Record<string, number>;
  cuisines: { name: string; households: number }[];
}

export interface AdminUser {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  provider: string;
  is_admin: boolean;
  households: number;
}

export interface RecentItem {
  created_at: string;
  user_email: string | null;
  path: string | null;
  props: Record<string, string | number | boolean | null>;
}

function sb() {
  const c = getSupabase();
  if (!c) throw new Error("Supabase isn't configured.");
  return c;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const amIAdmin = () => rpc<boolean>("is_admin");
export const loadOverview = (days: number) => rpc<Overview>("admin_overview", { p_days: days });
export const loadUsers = () => rpc<AdminUser[]>("admin_users", { p_limit: 200, p_offset: 0 });
export const setAdmin = (userId: string, admin: boolean) => rpc<void>("admin_set_admin", { p_user: userId, p_admin: admin });
export const loadRecent = (kind: "client_error" | "feedback") => rpc<RecentItem[]>("admin_recent", { p_kind: kind, p_limit: 200 });

export async function loadConfigRows() {
  const { data, error } = await sb().from("app_config").select("key, value, updated_at");
  if (error) throw new Error(error.message);
  return data as { key: string; value: unknown; updated_at: string }[];
}

export async function saveConfig(c: AppConfig) {
  const { error } = await sb()
    .from("app_config")
    .upsert([
      { key: "features", value: c.features },
      { key: "announcement", value: { text: c.announcement.text.trim().slice(0, 240), tone: c.announcement.tone } },
      { key: "defaults", value: c.defaults },
    ]);
  if (error) throw new Error(error.message);
}
