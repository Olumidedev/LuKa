"use client";

import { useEffect } from "react";
import { setTaste } from "../state/catalogRegistry";
import { getSupabase } from "./supabase";

/** Loads the household's learned taste weights so the planner can lean towards proven favourites. */
export function useTasteSync(householdId: string | null | undefined) {
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !householdId) {
      setTaste({ cuisines: {}, ingredients: {} });
      return;
    }
    let live = true;
    (async () => {
      const { data } = await sb.from("household_taste_profiles").select("cuisine_weights, ingredient_weights").eq("household_id", householdId).maybeSingle();
      if (!live || !data) return;
      const bySlug = (data.ingredient_weights ?? {}) as Record<string, number>;
      const slugs = Object.keys(bySlug);
      const ingredients: Record<string, number> = {};
      if (slugs.length) {
        const { data: rows } = await sb.from("ingredients").select("slug, app_key").in("slug", slugs);
        for (const r of rows ?? []) if (r.app_key) ingredients[r.app_key as string] = Number(bySlug[r.slug as string]);
      }
      if (live) setTaste({ cuisines: (data.cuisine_weights ?? {}) as Record<string, number>, ingredients });
    })();
    return () => {
      live = false;
    };
  }, [householdId]);
}
