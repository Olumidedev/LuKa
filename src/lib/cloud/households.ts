"use client";

import type { AppState } from "../types";
import { getSupabase } from "./supabase";

export interface CloudHousehold {
  id: string;
  name: string;
  role: "owner" | "member";
}

export interface CloudState {
  state: AppState | null;
  version: number;
  updatedAt: string;
}

function sb() {
  const c = getSupabase();
  if (!c) throw new Error("Cloud sync isn't configured.");
  return c;
}

const friendly = (e: { message?: string } | null) => new Error(e?.message?.replace(/^.*?: /, "") || "The server didn't answer. Try again.");

/** Cloud copies keep everything except per-device shopping ticks. */
export function toCloud(state: AppState): AppState {
  return { ...state, inCart: {} };
}

export async function myHouseholds(userId: string): Promise<CloudHousehold[]> {
  const { data, error } = await sb()
    .from("household_members")
    .select("role, households ( id, name )")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true });
  if (error) throw friendly(error);
  return (data ?? []).flatMap((row) => {
    const h = row.households as unknown as { id: string; name: string } | null;
    return h ? [{ id: h.id, name: h.name, role: row.role as CloudHousehold["role"] }] : [];
  });
}

export async function createHousehold(name: string, state: AppState): Promise<string> {
  const { data, error } = await sb().rpc("create_household", { p_name: name, p_state: toCloud(state) });
  if (error) throw friendly(error);
  return data as string;
}

export async function fetchState(householdId: string): Promise<CloudState> {
  const { data, error } = await sb().from("household_state").select("state, version, updated_at").eq("household_id", householdId).single();
  if (error) throw friendly(error);
  const s = data.state as AppState;
  return { state: s && s.version === 1 ? s : null, version: data.version, updatedAt: data.updated_at };
}

/** Optimistic write: succeeds only if nobody else saved since `version`. */
export async function saveState(householdId: string, state: AppState, version: number): Promise<{ ok: true; version: number } | { ok: false }> {
  const { data, error } = await sb()
    .from("household_state")
    .update({ state: toCloud(state), version: version + 1 })
    .eq("household_id", householdId)
    .eq("version", version)
    .select("version");
  if (error) {
    if (error.code === "40001") return { ok: false };
    throw friendly(error);
  }
  return data && data.length ? { ok: true, version: data[0].version } : { ok: false };
}

export async function createInvite(householdId: string): Promise<string> {
  const { data, error } = await sb().rpc("create_invite", { p_household: householdId });
  if (error) throw friendly(error);
  return data as string;
}

export async function joinHousehold(code: string): Promise<string> {
  const { data, error } = await sb().rpc("join_household", { p_code: code });
  if (error) throw friendly(error);
  return data as string;
}
