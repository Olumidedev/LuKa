import type { Ingredient, LifeStage, Member, Recipe } from "../types";

export interface ServingNutrition {
  kcal: number;
  protein: number;
  fiber: number;
  iron: number;
  folate: number;
  calcium: number;
  omega3: number;
}

export type Badge = "protein" | "fiber" | "iron" | "folate" | "calcium" | "omega3";

export const BADGE_LABEL: Record<Badge, string> = {
  protein: "Protein",
  fiber: "High fibre",
  iron: "Iron",
  folate: "Folate",
  calcium: "Calcium",
  omega3: "Omega-3",
};

/** Per adult serving, from the base 4-portion recipe. Estimates only. */
export function perServing(recipe: Recipe, ings: Record<string, Ingredient>): ServingNutrition {
  const t: ServingNutrition = { kcal: 0, protein: 0, fiber: 0, iron: 0, folate: 0, calcium: 0, omega3: 0 };
  for (const ri of recipe.ingredients) {
    const ing = ings[ri.key];
    if (!ing) continue;
    const f = ing.unit === "pc" ? ri.qty : ri.qty / 100;
    // Deep-frying oil is mostly left in the pan; count a fifth of large oil amounts.
    const absorbed = ing.aisle === "oils" && ri.qty > 150 ? 0.2 : 1;
    for (const k of Object.keys(t) as (keyof ServingNutrition)[]) t[k] += ing.nutrition[k] * f * absorbed;
  }
  for (const k of Object.keys(t) as (keyof ServingNutrition)[]) t[k] = t[k] / 4;
  return t;
}

const THRESHOLDS: Record<Badge, number> = { protein: 20, fiber: 7, iron: 3.5, folate: 100, calcium: 200, omega3: 0.5 };

export function badges(n: ServingNutrition): Badge[] {
  return (Object.keys(THRESHOLDS) as Badge[]).filter((b) => n[b] >= THRESHOLDS[b]);
}

/** Which badges matter for whom — used for silent life-stage scoring. */
export const STAGE_FOCUS: Record<Exclude<LifeStage, "">, Badge[]> = {
  ttc: ["folate", "iron"],
  pregnant: ["folate", "iron", "calcium"],
  breastfeeding: ["omega3", "calcium", "protein"],
  athlete: ["protein", "iron"],
  senior: ["calcium", "protein", "fiber"],
};

export function householdFocus(members: Member[]): Map<Badge, string[]> {
  const out = new Map<Badge, string[]>();
  for (const m of members) {
    const focus: Badge[] = m.stage ? STAGE_FOCUS[m.stage] : m.age === "child" || m.age === "teen" ? ["calcium"] : [];
    for (const b of focus) out.set(b, [...(out.get(b) ?? []), m.name]);
  }
  return out;
}

export function costPerServing(recipe: Recipe, ings: Record<string, Ingredient>): number {
  let c = 0;
  for (const ri of recipe.ingredients) {
    const ing = ings[ri.key];
    if (ing) c += (ri.qty / ing.pack) * ing.price;
  }
  return c / 4;
}
