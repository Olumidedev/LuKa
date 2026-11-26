import { INGREDIENTS } from "../data/ingredients";
import { LIBRARY } from "../data/recipes";
import { getCatalog, type Catalog } from "../state/catalogRegistry";
import type { AppState, Ingredient, Recipe } from "../types";
import { gateRecipe, householdPortions, type GateResult } from "./gate";

/** Everything the deterministic engine needs, derived once per state change. */
export interface EngineContext {
  state: AppState;
  ings: Record<string, Ingredient>;
  recipes: Recipe[];
  byId: Map<string, Recipe>;
  gates: Map<string, GateResult>;
  portions: number;
}

export function buildContext(state: AppState, catalog: Catalog = getCatalog()): EngineContext {
  const ings = { ...INGREDIENTS, ...catalog.ingredients, ...state.customIngredients };
  // Household recipes first, then the shared catalog (carries ratings/verification), then the bundled library.
  const seen = new Set<string>();
  const recipes = [...state.customRecipes, ...catalog.recipes, ...LIBRARY].filter((r) => !seen.has(r.id) && seen.add(r.id));
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const gates = new Map(recipes.map((r) => [r.id, gateRecipe(r, state.members, ings)]));
  return { state, ings, recipes, byId, gates, portions: householdPortions(state.members) };
}
