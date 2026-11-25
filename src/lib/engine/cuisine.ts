import { regionOf } from "../data/countries";
import type { CuisinePick, Recipe } from "../types";

export interface CuisineMatch {
  score: number;
  /** The pick this recipe counts toward, for variety balancing. */
  pick: string | null;
  /** True when the match is only "same region as a country you picked". */
  neighbour: boolean;
}

/**
 * How well a recipe fits the household's cuisine picks.
 *   exact country 3 · picked region 2.5 · same region as a picked country 1
 *   +1.5 when a fusion dish matches on every side.
 */
export function cuisineMatch(recipe: Recipe, picks: CuisinePick[]): CuisineMatch {
  const countries = new Set(picks.filter((p) => p.type === "country").map((p) => p.value));
  const regions = new Set(picks.filter((p) => p.type === "region").map((p) => p.value));
  const neighbourRegions = new Set([...countries].map((c) => regionOf(c)).filter(Boolean) as string[]);

  let best = 0;
  let pick: string | null = null;
  let neighbour = false;
  let matchedSides = 0;
  for (const c of recipe.countries) {
    const reg = regionOf(c);
    let s = 0;
    let p: string | null = null;
    if (countries.has(c)) {
      s = 3;
      p = c;
    } else if (reg && regions.has(reg)) {
      s = 2.5;
      p = reg;
    } else if (reg && neighbourRegions.has(reg)) {
      s = 1;
      p = reg;
    }
    if (s >= 2.5) matchedSides++;
    if (s > best) {
      best = s;
      pick = p;
      neighbour = s === 1;
    }
  }
  if (recipe.countries.length > 1 && matchedSides === recipe.countries.length) best += 1.5;
  return { score: best, pick, neighbour };
}

/** Countries the user picked that have no recipe of their own yet. */
export function uncoveredCountries(recipes: Recipe[], picks: CuisinePick[]): string[] {
  const have = new Set(recipes.flatMap((r) => r.countries));
  return picks.filter((p) => p.type === "country" && !have.has(p.value)).map((p) => p.value);
}
