"use client";

import { useEffect, useState } from "react";
import type { Ingredient, PantryItem, Recipe } from "../types";
import { getSupabase } from "../cloud/supabase";

let status: Promise<boolean> | null = null;
function aiStatus() {
  status ??= fetch("/api/ai/status")
    .then((r) => r.json())
    .then((d: { enabled?: boolean }) => !!d.enabled)
    .catch(() => false);
  return status;
}

/** False until the server confirms a model key is configured. */
export function useAIEnabled() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    aiStatus().then((v) => live && setOn(v));
    return () => {
      live = false;
    };
  }, []);
  return on;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
  return data.session ? { authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), ...(await authHeader()) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? "The AI request failed."), { status: res.status });
  return data as T;
}

export interface AIRecipes {
  recipes: Recipe[];
  ingredients: Record<string, Ingredient>;
}

/** Asks Claude for new recipes from one country; they join the shared catalog. */
export function aiGenerateRecipes(country: string, meals: ("b" | "l" | "d")[] = ["b", "l", "d"], count = 6) {
  let deviceId: string | undefined;
  try {
    deviceId = localStorage.getItem("luka:device") ?? undefined;
  } catch {
    /* ignore */
  }
  return call<AIRecipes>("/api/ai/recipes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ country, meals, count, deviceId }),
  });
}

export function aiParseRecipe(text: string, credit?: string, url?: string) {
  return call<AIRecipes>("/api/ai/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, credit, url }),
  });
}

/** Re-encode on the device first: strips EXIF/GPS and shrinks the upload. */
async function sanitizeImage(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo."))), "image/jpeg", 0.85));
}

export async function aiScanFridge(file: File): Promise<PantryItem[]> {
  const form = new FormData();
  form.append("photo", await sanitizeImage(file), "fridge.jpg");
  const out = await call<{ items: PantryItem[] }>("/api/ai/fridge", { method: "POST", body: form });
  return out.items;
}
