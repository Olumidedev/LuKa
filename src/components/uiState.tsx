"use client";

import { createContext, useContext } from "react";
import type { CookCard } from "@/lib/engine/cookcard";
import type { MealType } from "@/lib/types";

export type Tab = "home" | "plan" | "groceries" | "recipes" | "household" | "admin" | "account" | "about";

export type MealRef = { kind: "slot"; day: number; meal: MealType } | { kind: "recipe"; recipeId: string };

export interface UI {
  tab: Tab;
  setTab: (t: Tab) => void;
  openMeal: (m: MealRef) => void;
  openCook: (card: CookCard) => void;
  openCuisines: () => void;
  /** Background recipe writing (auto top-up) status for banners. */
  topUp: { working: string | null; added: number };
}

export const UICtx = createContext<UI | null>(null);
export function useUI() {
  const u = useContext(UICtx);
  if (!u) throw new Error("useUI outside AppShell");
  return u;
}
