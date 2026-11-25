"use client";

import { useEffect, useState } from "react";
import type { Ingredient, Member, PantryItem, Recipe } from "../types";
import { forbiddenKindsForRules } from "../engine/gate";

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

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "The AI request failed.");
  return data as T;
}

export interface AIRecipes {
  recipes: Recipe[];
  ingredients: Record<string, Ingredient>;
}

/** Only constraints leave the device: no names, ages or life-stage details. */
export function aiGenerateRecipes(country: string, members: Member[]) {
  const avoidAllergens = [...new Set(members.flatMap((m) => m.allergies))];
  const avoidKinds = [...forbiddenKindsForRules(members).kinds];
  return call<AIRecipes>("/api/ai/recipes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ country, meals: ["b", "l", "d"], avoidAllergens, avoidKinds }),
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
