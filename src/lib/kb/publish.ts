import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ingredient, Recipe } from "../types";

const kebab = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);

/**
 * Writes a recipe into the knowledge base: the recipe row (with the app's
 * payload), recipe_ingredients against canonical ingredients, and plain-text
 * steps. Ingredients LUKA has never seen are created as `unverified`
 * canonical rows with their declared allergens, ready for curation.
 */
export async function publishRecipeToKB(
  db: SupabaseClient,
  recipe: Recipe,
  customIngredients: Record<string, Ingredient>,
  opts: { originType: "claude" | "user" | "partner" | "built_in"; verification?: "unverified" | "source_verified" | "curated"; userId?: string | null; householdId?: string | null },
): Promise<void> {
  const keys = recipe.ingredients.map((i) => i.key);
  const { data: known } = await db.from("ingredients").select("id, app_key, canonical_name, default_pack_unit, grams_per_unit").in("app_key", keys);
  const byKey = new Map((known ?? []).map((k) => [k.app_key as string, k]));

  for (const key of keys) {
    if (byKey.has(key)) continue;
    const c = customIngredients[key];
    if (!c) throw new Error(`No definition for ingredient ${key}`);
    let slug = kebab(c.name) || kebab(key);
    const { data: taken } = await db.from("ingredients").select("id").eq("slug", slug).maybeSingle();
    if (taken) slug = `${slug}-${kebab(key)}`.slice(0, 80);
    const { data: row, error } = await db
      .from("ingredients")
      .insert({ slug, app_key: key, canonical_name: c.name, category: c.aisle, kind: c.kind ?? null, default_pack_unit: c.unit, pack_quantity: c.pack, default_pack_size_g: c.unit === "pc" ? c.pack * 60 : c.pack, pack_label: c.packLabel, shelf_days: c.shelf, chili: !!c.chili, verification_status: "unverified" })
      .select("id, app_key, canonical_name, default_pack_unit, grams_per_unit")
      .single();
    if (error) throw new Error(`ingredient ${key}: ${error.message}`);
    byKey.set(key, row);
    await db.from("ingredient_names").insert({ ingredient_id: row.id, name: c.name, is_canonical: true, source_id: "luka_curation" });
    if (c.allergens.length) await db.from("ingredient_allergens").insert(c.allergens.map((a) => ({ ingredient_id: row.id, allergen_key: a, presence: "contains", source_id: "luka_curation", source_record_ref: `declared:${recipe.id}` })));
  }

  let slug = kebab(recipe.name) || kebab(recipe.id);
  const { data: clash } = await db.from("recipes").select("id").eq("slug", slug).maybeSingle();
  if (clash) slug = `${slug}-${recipe.id.slice(-4)}`;
  const { error: rErr } = await db.from("recipes").insert({
    id: recipe.id,
    slug,
    title: recipe.name,
    cuisine_tags: recipe.countries,
    meals: recipe.meals,
    recipe,
    app_ingredients: Object.fromEntries(keys.filter((k) => customIngredients[k]).map((k) => [k, customIngredients[k]])),
    origin_type: opts.originType,
    verification_status: opts.verification ?? "unverified",
    plate_role: recipe.plateRole ?? "main_one_pot",
    prep_minutes: recipe.activeMin,
    cook_minutes: Math.max(0, recipe.totalMin - recipe.activeMin),
    created_by: opts.userId ?? null,
    created_by_household_id: opts.householdId ?? null,
    status: "live",
  });
  if (rErr) throw new Error(`recipe ${recipe.id}: ${rErr.message}`);

  await db.from("recipe_ingredients").insert(
    recipe.ingredients.map((ri, n) => {
      const k = byKey.get(ri.key)!;
      return { recipe_id: recipe.id, ingredient_id: k.id, quantity: ri.qty, unit: k.default_pack_unit, grams_equivalent: k.default_pack_unit === "pc" ? ri.qty * Number(k.grams_per_unit ?? 60) : ri.qty, sort_order: n + 1 };
    }),
  );
  await db.from("recipe_steps").insert(
    recipe.steps.map((s, n) => ({
      recipe_id: recipe.id,
      step_number: n + 1,
      instruction: s
        .replace(/\{([a-z0-9_]+)(?:\*[0-9.]+)?\}/g, (_m, k: string) => String(byKey.get(k)?.canonical_name ?? k).toLowerCase())
        .replace(/\s*\[t(\d+)\]/g, " ($1 min)")
        .trim(),
      timer_minutes: Number(s.match(/\[t(\d+)\]/)?.[1]) || null,
    })),
  );
}
