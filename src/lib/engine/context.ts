import { INGREDIENTS } from "../data/ingredients";
import { LIBRARY } from "../data/recipes";
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

export function buildContext(state: AppState): EngineContext {
  const ings = { ...INGREDIENTS, ...state.customIngredients };
  const recipes = [...LIBRARY, ...state.customRecipes];
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const gates = new Map(recipes.map((r) => [r.id, gateRecipe(r, state.members, ings)]));
  return { state, ings, recipes, byId, gates, portions: householdPortions(state.members) };
}
