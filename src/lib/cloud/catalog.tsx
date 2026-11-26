"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setCatalog, type Catalog } from "../state/catalogRegistry";
import type { Ingredient, Recipe } from "../types";
import { useAuth } from "./auth";
import { getSupabase } from "./supabase";

const CACHE = "luka:catalog";
const MAX = 600;

interface CatalogCtx extends Catalog {
  version: number;
  refresh: () => Promise<void>;
}

const Ctx = createContext<CatalogCtx>({ recipes: [], ingredients: {}, version: 0, refresh: async () => {} });
export const useCatalog = () => useContext(Ctx);

function fromRows(rows: { recipe: Recipe; app_ingredients: Record<string, Ingredient>; verification_status?: Recipe["verification"]; avg_rating?: number | null; rating_count?: number }[]): Catalog {
  const recipes: Recipe[] = [];
  const ingredients: Record<string, Ingredient> = {};
  for (const r of rows) {
    if (!r.recipe?.id || !Array.isArray(r.recipe.ingredients)) continue;
    recipes.push({
      ...r.recipe,
      verification: r.verification_status ?? r.recipe.verification,
      rating: r.rating_count ? { avg: Number(r.avg_rating), count: r.rating_count } : r.recipe.rating,
    });
    Object.assign(ingredients, r.app_ingredients ?? {});
  }
  return { recipes, ingredients };
}

/** Loads the shared, growing recipe catalog for signed-in people (cached for offline). */
export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<Catalog & { version: number }>({ recipes: [], ingredients: {}, version: 0 });

  const apply = useCallback((c: Catalog) => {
    setCatalog(c);
    setState((s) => ({ ...c, version: s.version + 1 }));
  }, []);

  const refresh = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from("recipes").select("recipe, app_ingredients, verification_status, avg_rating, rating_count").eq("status", "live").order("created_at", { ascending: false }).limit(MAX);
    if (error || !data) return;
    const c = fromRows(data as never);
    apply(c);
    try {
      localStorage.setItem(CACHE, JSON.stringify(c));
    } catch {
      /* storage full: catalog still works this session */
    }
  }, [apply]);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE);
      if (cached) apply(JSON.parse(cached));
    } catch {
      /* ignore */
    }
  }, [apply]);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
