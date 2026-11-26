import { NextResponse } from "next/server";
import { ALL_COUNTRIES } from "@/lib/data/countries";
import { LIBRARY } from "@/lib/data/recipes";
import { generateStructured } from "@/lib/ai/gateway";
import { normalizeRecipe } from "@/lib/ai/normalize";
import { SYSTEM, generatePrompt } from "@/lib/ai/prompts";
import { RecipeBatchOut } from "@/lib/ai/schemas";
import { isDeviceId } from "@/lib/analyticsSchema";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { Ingredient, Recipe } from "@/lib/types";
import { fail, guard } from "../_util";

export const maxDuration = 120;
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 10);

/**
 * Writes new recipes for a country with Claude and adds them to the shared
 * catalog, so every household that picks that cuisine benefits.
 */
export async function POST(req: Request) {
  const g = await guard(req);
  if ("res" in g) return g.res;
  const db = supabaseAdmin()!;
  try {
    const body = (await req.json()) as { country?: string; meals?: string[]; count?: number; deviceId?: string };
    const country = String(body.country ?? "");
    if (!ALL_COUNTRIES.includes(country)) return NextResponse.json({ error: "Pick a country from the list." }, { status: 400 });
    const meals = (body.meals ?? ["b", "l", "d"]).filter((m): m is "b" | "l" | "d" => m === "b" || m === "l" || m === "d");
    const count = Math.min(8, Math.max(1, Number(body.count) || 6));

    if (!g.user.isAdmin) {
      const since = new Date(Date.now() - 86_400_000).toISOString();
      const { count: used } = await db
        .from("usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", g.user.id)
        .eq("name", "ai_recipes_generated")
        .gte("created_at", since);
      if ((used ?? 0) >= DAILY_LIMIT) return NextResponse.json({ error: "You've reached today's limit for new AI recipes. Try again tomorrow." }, { status: 429 });
    }

    const { data: existing } = await db.from("recipes").select("name").contains("countries", [country]).limit(200);
    const avoid = [...LIBRARY.filter((r) => r.countries.includes(country)).map((r) => r.name), ...(existing ?? []).map((r) => r.name as string)];

    const out = await generateStructured({
      schema: RecipeBatchOut,
      system: SYSTEM,
      prompt: generatePrompt(country, meals.length ? meals : ["b", "l", "d"], count, avoid),
      effort: "medium",
    });

    const seen = new Set(avoid.map((n) => n.toLowerCase()));
    const recipes: Recipe[] = [];
    const ingredients: Record<string, Ingredient> = {};
    for (const raw of out.recipes.slice(0, count)) {
      const n = normalizeRecipe({ ...raw, countries: [country] }, { type: "ai" });
      if (!n || seen.has(n.recipe.name.toLowerCase())) continue;
      seen.add(n.recipe.name.toLowerCase());
      recipes.push(n.recipe);
      Object.assign(ingredients, n.ingredients);
      const { error } = await db.from("recipes").insert({
        id: n.recipe.id,
        name: n.recipe.name,
        countries: n.recipe.countries,
        meals: n.recipe.meals,
        recipe: n.recipe,
        ingredients: n.ingredients,
        source: g.user.isAdmin ? "admin" : "ai",
        created_by: g.user.id,
      });
      if (error) console.error("[ai/recipes] insert failed:", error.message);
    }

    await db.from("usage_events").insert({
      device_id: isDeviceId(body.deviceId) ? body.deviceId : crypto.randomUUID(),
      user_id: g.user.id,
      name: "ai_recipes_generated",
      props: { country, count: recipes.length },
      path: "/api/ai/recipes",
    });
    return NextResponse.json({ recipes, ingredients });
  } catch (e) {
    return fail(e);
  }
}
