import type { SupabaseClient } from "@supabase/supabase-js";
import { allergensFromName } from "../ai/normalize";
import type { MealType, PlateRole } from "../types";

/**
 * Intake normalizer: every new recipe (family share, partner feed, permitted
 * open source, or the weekly gap agent) enters `recipe_submissions` here.
 * Raw ingredient strings are resolved against `ingredient_names`; anything
 * unresolved parks the submission in `needs_ingredient_mapping`. Automated
 * checks never approve anything — a human does, in Admin → Review queue.
 */

export type SourceChannel = "family_share" | "partner_feed" | "permitted_open_source" | "public_domain" | "reference_import" | "weekly_gap_agent";
export type OriginType = "built_in" | "claude" | "user" | "partner";

export interface RawIngredient {
  name: string;
  quantity: number;
  unit: "g" | "ml" | "pc";
  preparation_note?: string;
  is_optional?: boolean;
  /** Allergens the source declared (Claude, partner). Re-checked, never trusted alone. */
  allergens?: string[];
}

export interface RawRecipeSubmission {
  title: string;
  summary?: string;
  cuisine_tags: string[];
  meals?: MealType[];
  plate_role?: PlateRole;
  flavor_tags?: string[];
  prep_minutes?: number;
  cook_minutes?: number;
  servings?: number;
  spice?: number;
  batch?: boolean;
  credit?: string;
  origin_ref?: string;
  /** Licence of the published recipe (e.g. "CC BY-SA 4.0", "Public domain"). */
  license?: string;
  /** Attribution line shown with the recipe. */
  attribution?: string;
  source_url?: string;
  ingredients: RawIngredient[];
  /** May reference ingredients as {@N} (1-based) so quantities scale in Cook Mode. */
  steps: string[];
}

export interface IntakeInput {
  sourceChannel: SourceChannel;
  originType: OriginType;
  householdId?: string | null;
  userId?: string | null;
  licenseVerified?: boolean;
  licenseNotes?: string;
  raw: RawRecipeSubmission;
  rawPayload?: unknown;
}

export interface IntakeChecks {
  unresolved: string[];
  allergens: string[];
  allergen_mismatch: string[];
  problems: string[];
  warnings: string[];
}

const ALLERGENS = new Set(["gluten", "dairy", "egg", "peanut", "treenut", "fish", "shellfish", "soy", "sesame", "mustard"]);

/** Deterministic checks run on every submission (exported for tests). */
export function runChecks(raw: RawRecipeSubmission, resolvedAllergens: string[], unresolved: string[]): IntakeChecks {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (!raw.title?.trim()) problems.push("Missing title");
  if (raw.ingredients.length < 2) problems.push("Fewer than 2 ingredients");
  if (raw.steps.filter((s) => s.trim()).length < 2) problems.push("Fewer than 2 steps");
  if (!raw.cuisine_tags?.length) problems.push("No cuisine");
  for (const i of raw.ingredients) {
    if (!(i.quantity > 0)) problems.push(`No quantity for ${i.name}`);
    if (i.unit !== "pc" && i.quantity > 5000) warnings.push(`${i.name}: ${i.quantity}${i.unit} looks too large for 4 portions`);
  }
  const total = raw.ingredients.reduce((s, i) => s + (i.unit === "pc" ? i.quantity * 60 : i.quantity), 0);
  if (total > 8000) warnings.push(`About ${Math.round(total / 1000)} kg of ingredients for 4 portions`);
  if ((raw.prep_minutes ?? 0) + (raw.cook_minutes ?? 0) <= 0) warnings.push("No cooking time given");
  for (const [n, step] of raw.steps.entries()) {
    if (/\b(rare|pink in the middle)\b/i.test(step) && /chicken|pork|turkey/i.test(step)) problems.push(`Step ${n + 1} suggests undercooked poultry or pork`);
  }

  const declared = new Set(raw.ingredients.flatMap((i) => (i.allergens ?? []).filter((a) => ALLERGENS.has(a))));
  const fromNames = raw.ingredients.flatMap((i) => allergensFromName(i.name));
  const all = new Set([...declared, ...fromNames, ...resolvedAllergens]);
  const mismatch = [...all].filter((a) => !declared.has(a) && raw.ingredients.some((i) => i.allergens));
  return { unresolved, allergens: [...all].sort(), allergen_mismatch: mismatch.sort(), problems, warnings };
}

export async function ingestRecipeSubmission(db: SupabaseClient, input: IntakeInput): Promise<{ id: string; status: string; checks: IntakeChecks }> {
  const raw = input.raw;
  const names = raw.ingredients.map((i) => i.name.trim());
  const { data: matches, error } = await db.rpc("resolve_ingredient_names", { p_names: names, p_min_score: 0.55 });
  if (error) throw new Error(`resolve_ingredient_names: ${error.message}`);
  const byName = new Map((matches as { input_name: string; ingredient_id: string | null; app_key: string | null; score: number | null }[]).map((m) => [m.input_name, m]));

  const resolvedIds = [...new Set([...byName.values()].map((m) => m.ingredient_id).filter(Boolean))] as string[];
  const { data: ingFacts } = resolvedIds.length
    ? await db.from("ingredients").select("id, default_pack_unit, grams_per_unit").in("id", resolvedIds)
    : { data: [] as { id: string; default_pack_unit: string; grams_per_unit: number | null }[] };
  const facts = new Map((ingFacts ?? []).map((f) => [f.id as string, f]));
  const { data: allergenRows } = resolvedIds.length
    ? await db.from("ingredient_allergens").select("allergen_key").in("ingredient_id", resolvedIds).in("presence", ["contains", "may_contain"])
    : { data: [] as { allergen_key: string }[] };

  const ingredients = raw.ingredients.map((i) => {
    const m = byName.get(i.name.trim());
    const f = m?.ingredient_id ? facts.get(m.ingredient_id) : undefined;
    const grams = i.unit === "pc" ? i.quantity * Number(f?.grams_per_unit ?? 60) : i.quantity;
    return {
      raw_name: i.name.trim(),
      ingredient_id: m?.ingredient_id ?? null,
      match_score: m?.score ?? null,
      match: m?.ingredient_id ? "auto" : null,
      quantity: i.quantity,
      unit: i.unit,
      grams_equivalent: Math.round(grams),
      preparation_note: i.preparation_note ?? null,
      is_optional: !!i.is_optional,
      declared_allergens: i.allergens ?? [],
    };
  });
  const unresolved = ingredients.filter((i) => !i.ingredient_id).map((i) => i.raw_name);
  const checks = runChecks(raw, (allergenRows ?? []).map((a) => a.allergen_key as string), unresolved);

  const normalized = {
    title: raw.title.trim().slice(0, 140),
    summary: raw.summary?.slice(0, 600) ?? null,
    cuisine_tags: raw.cuisine_tags.slice(0, 4),
    meals: raw.meals?.length ? raw.meals : ["d"],
    plate_role: raw.plate_role ?? "main_one_pot",
    flavor_tags: raw.flavor_tags ?? [],
    prep_minutes: raw.prep_minutes ?? null,
    cook_minutes: raw.cook_minutes ?? null,
    servings: raw.servings ?? 4,
    credit: raw.credit ?? null,
    origin_ref: raw.origin_ref ?? null,
    license: raw.license ?? null,
    attribution: raw.attribution ?? null,
    source_url: raw.source_url ?? null,
    ingredients,
    steps: raw.steps.map((s) => s.slice(0, 800)).slice(0, 25),
    app_recipe: {
      activeMin: raw.prep_minutes ?? 20,
      totalMin: (raw.prep_minutes ?? 20) + (raw.cook_minutes ?? 25),
      spice: Math.max(0, Math.min(3, Math.round(raw.spice ?? 1))),
      batch: !!raw.batch,
      steps: raw.steps.map((s) => s.slice(0, 800)).slice(0, 25),
      plateRole: raw.plate_role ?? "main_one_pot",
    },
  };

  const status = unresolved.length ? "needs_ingredient_mapping" : "pending_review";
  const { data, error: insErr } = await db
    .from("recipe_submissions")
    .insert({
      source_channel: input.sourceChannel,
      origin_type: input.originType,
      submitted_by_household_id: input.householdId ?? null,
      submitted_by_user_id: input.userId ?? null,
      license_verified: !!input.licenseVerified,
      license_notes: input.licenseNotes ?? null,
      raw_payload: input.rawPayload ?? raw,
      normalized_recipe: normalized,
      automated_checks: checks,
      status,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`recipe_submissions: ${insErr.message}`);
  return { id: data.id as string, status, checks };
}

/** Claude's {ingredient_id} placeholders → {@N} positions, so promotion can re-key them. */
export function toPositionalSteps(steps: string[], ids: string[]): string[] {
  return steps.map((s) =>
    s.replace(/\{([a-zA-Z0-9_]+)(\*[0-9.]+)?\}/g, (m, id: string, f = "") => {
      const n = ids.indexOf(id);
      return n >= 0 ? `{@${n + 1}${f}}` : id.replace(/_/g, " ");
    }),
  );
}
