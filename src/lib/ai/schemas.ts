import { z } from "zod";

/** Shapes Claude must return (enforced by structured outputs, then re-checked by normalize.ts). */
const Allergen = z.enum(["gluten", "dairy", "egg", "peanut", "treenut", "fish", "shellfish", "soy", "sesame", "mustard"]);

export const RecipeOut = z.object({
  name: z.string(),
  countries: z.array(z.string()),
  meals: z.array(z.enum(["b", "l", "d"])),
  activeMin: z.number().int(),
  totalMin: z.number().int(),
  spice: z.number().int(),
  batch: z.boolean(),
  credit: z.string(),
  ingredients: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      qty: z.number(),
      unit: z.enum(["g", "ml", "pc"]),
      aisle: z.enum(["produce", "protein", "dairy", "bakery", "grains", "canned", "condiments", "spices", "oils"]),
      allergens: z.array(Allergen),
    }),
  ),
  steps: z.array(z.string()),
});

export const RecipeBatchOut = z.object({ recipes: z.array(RecipeOut) });
export const SingleRecipeOut = z.object({ recipe: RecipeOut });
export const FridgeOut = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      qty: z.number().nullable(),
      useWithinDays: z.number().nullable(),
    }),
  ),
});
