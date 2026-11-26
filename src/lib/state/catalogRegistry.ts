import type { Ingredient, Recipe } from "../types";

/**
 * The shared recipe catalog loaded from Supabase. Kept in a small registry so
 * the planner sees it wherever a context is built (including inside store
 * updates), without threading it through every call.
 */
export interface Catalog {
  recipes: Recipe[];
  ingredients: Record<string, Ingredient>;
}

let current: Catalog = { recipes: [], ingredients: {} };
export const getCatalog = () => current;
export const setCatalog = (c: Catalog) => {
  current = c;
};

/** Household taste weights learned from cook feedback (cuisine name / app ingredient key → 0.2…3). */
export interface Taste {
  cuisines: Record<string, number>;
  ingredients: Record<string, number>;
}
let taste: Taste = { cuisines: {}, ingredients: {} };
export const getTaste = () => taste;
export const setTaste = (t: Taste) => {
  taste = t;
};
