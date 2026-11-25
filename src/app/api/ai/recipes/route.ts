import { NextResponse } from "next/server";
import { ALL_COUNTRIES } from "@/lib/data/countries";
import { generateJSON } from "@/lib/ai/gateway";
import { normalizeRecipe, type RawRecipe } from "@/lib/ai/normalize";
import { generatePrompt } from "@/lib/ai/prompts";
import type { Ingredient, Recipe } from "@/lib/types";
import { fail, guard } from "../_util";

const ALLERGENS = new Set(["gluten", "dairy", "egg", "peanut", "treenut", "fish", "shellfish", "soy", "sesame", "mustard"]);
const KINDS = new Set(["pork", "beef", "poultry", "lamb", "goat", "fish", "shellfish", "egg", "dairy", "honey", "alcohol"]);

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    const body = (await req.json()) as { country?: string; meals?: string[]; avoidAllergens?: string[]; avoidKinds?: string[] };
    const country = String(body.country ?? "");
    if (!ALL_COUNTRIES.includes(country)) return NextResponse.json({ error: "Pick a country from the list." }, { status: 400 });
    const meals = (body.meals ?? ["b", "l", "d"]).filter((m): m is "b" | "l" | "d" => m === "b" || m === "l" || m === "d");
    const out = (await generateJSON(
      generatePrompt({
        country,
        meals: meals.length ? meals : ["b", "l", "d"],
        count: 4,
        avoidAllergens: (body.avoidAllergens ?? []).filter((a) => ALLERGENS.has(a)),
        avoidKinds: (body.avoidKinds ?? []).filter((k) => KINDS.has(k)),
      }),
    )) as { recipes?: RawRecipe[] };
    const recipes: Recipe[] = [];
    const ingredients: Record<string, Ingredient> = {};
    for (const raw of (out.recipes ?? []).slice(0, 6)) {
      const n = normalizeRecipe({ ...raw, countries: [country] }, { type: "ai" });
      if (!n) continue;
      recipes.push(n.recipe);
      Object.assign(ingredients, n.ingredients);
    }
    return NextResponse.json({ recipes, ingredients });
  } catch (e) {
    return fail(e);
  }
}
