import type { Ingredient, Member, Recipe } from "../types";
import { PORTION, householdPortions, type GateResult } from "./gate";

export interface Need {
  key: string;
  qty: number;
}

/** Round to something a cook would actually measure. */
export function roundQty(q: number, unit: Ingredient["unit"]): number {
  if (unit === "pc") return Math.max(1, Math.round(q));
  if (q < 10) return Math.max(0.5, Math.round(q * 2) / 2);
  if (q < 50) return Math.round(q);
  return Math.round(q / 5) * 5;
}

/**
 * Exact (unrounded) ingredient quantities for cooking a recipe for `portions`
 * adult-equivalent portions, with each member's diet swaps applied to just
 * their share.
 */
export function recipeNeeds(recipe: Recipe, members: Member[], gate: GateResult, portions: number): Need[] {
  const scale = portions / 4;
  const total = householdPortions(members);
  const out = new Map<string, number>();
  const add = (k: string, q: number) => out.set(k, (out.get(k) ?? 0) + q);

  for (const ri of recipe.ingredients) {
    let q = ri.qty * scale;
    for (const adj of gate.adjusts) {
      const sw = adj.swaps.find((s) => s.from === ri.key);
      if (!sw) continue;
      const m = members.find((x) => x.id === adj.memberId);
      const f = m ? PORTION[m.age] / total : 0;
      const share = ri.qty * scale * f;
      q -= share;
      if (sw.to) add(sw.to, share * sw.ratio);
    }
    if (q > 0.001) add(ri.key, q);
  }
  return [...out.entries()].map(([key, qty]) => ({ key, qty }));
}

const TSP_GRAMS = 2.5;

/** Human-readable amount, e.g. "1.2 kg", "3 tbsp", "2 tsp", "4 eggs". */
export function formatQty(qty: number, ing: Ingredient): string {
  const q = roundQty(qty, ing.unit);
  if (ing.unit === "pc") return `${q}`;
  if (ing.aisle === "spices" && q < 20) {
    const tsp = Math.max(0.25, Math.round((qty / TSP_GRAMS) * 4) / 4);
    return tsp >= 3 ? `${Math.round((tsp / 3) * 2) / 2} tbsp` : `${fmtFrac(tsp)} tsp`;
  }
  if (ing.unit === "ml" && q <= 90) {
    const tbsp = Math.max(0.5, Math.round((qty / 15) * 2) / 2);
    return `${fmtFrac(tbsp)} tbsp`;
  }
  if (q >= 1000) return `${(q / 1000).toFixed(q % 1000 === 0 ? 0 : 1)} ${ing.unit === "ml" ? "L" : "kg"}`;
  return `${q} ${ing.unit}`;
}

function fmtFrac(n: number): string {
  const whole = Math.floor(n);
  const frac = n - whole;
  const f = frac === 0.25 ? "¼" : frac === 0.5 ? "½" : frac === 0.75 ? "¾" : frac ? frac.toFixed(2).slice(1) : "";
  return whole ? `${whole}${f}` : f || "0";
}

export function plural(label: string, n: number): string {
  if (n <= 1) return label;
  return /(tomato|potato)$/.test(label) ? `${label}es` : `${label}s`;
}

function fmtCount(n: number): string {
  return n < 2 ? fmtFrac(Math.max(0.5, Math.round(n * 2) / 2)) : String(Math.round(n));
}

/** "300 g spinach", "4 eggs", "2 tsp cumin", "4 tomatoes (520 g)", "3 garlic cloves". */
export function formatAmountWithName(qty: number, ing: Ingredient): string {
  const amt = formatQty(qty, ing);
  const name = ing.name.replace(/\s*\(.*?\)\s*/g, " ").trim().toLowerCase();
  if (ing.unit === "pc") return `${amt} ${name}`;
  if (ing.key === "garlic") {
    const cloves = Math.max(1, Math.round(qty / 5));
    return `${cloves} garlic clove${cloves > 1 ? "s" : ""}`;
  }
  if (ing.countable && ing.aisle === "produce" && ing.key !== "ginger") {
    const raw = qty / ing.pack;
    const count = fmtCount(raw);
    const label = plural(ing.packLabel, raw >= 2 ? 2 : 1);
    return qty >= 200 ? `${count} ${label} (${amt})` : `${count} ${label}`;
  }
  return `${amt} ${name}`;
}

/** How a number of packs reads on the shopping list. */
export function formatPacks(packs: number, ing: Ingredient): string {
  if (ing.countable) return `${packs} ${plural(ing.packLabel, packs)}`;
  return packs === 1 ? `1 × ${ing.packLabel}` : `${packs} × ${ing.packLabel}`;
}

export function memberPortion(m: Member) {
  return PORTION[m.age];
}
