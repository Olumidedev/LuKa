import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, currentModel, toAIError } from "../ai/gateway";

/**
 * The tool-grounded sous-chef. Claude can only read LUKA's knowledge base
 * through these tools; every number it gives (nutrition, prices) and every
 * allergen claim must come from a tool result.
 */
export interface SousChefContext {
  householdId: string;
  regionCode: string;
  allergenExclusions: string[];
  dietaryRestrictions: string[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "lookup_ingredient_facts",
    description:
      "Look up verified facts for one ingredient by any name (English, regional or local, e.g. 'ugu'). Returns nutrition per 100 g with its source, allergens with their source, the latest price in the household's region, and seasonality. Fields are null when LUKA has no verified data.",
    input_schema: { type: "object", properties: { name: { type: "string", description: "Ingredient name as the person said it" } }, required: ["name"], additionalProperties: false },
  },
  {
    name: "search_verified_recipes",
    description:
      "Search LUKA's verified recipes (already filtered to exclude the household's allergens). Filter by words in the title, a cuisine/country, and a time limit. Returns id, title, cuisines, total minutes and rating.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, cuisine: { type: "string" }, max_minutes: { type: "integer" }, limit: { type: "integer" } },
      additionalProperties: false,
    },
  },
  {
    name: "get_recipe_details",
    description: "Ingredients (with quantities for 4) and steps for one recipe id returned by another tool.",
    input_schema: { type: "object", properties: { recipe_id: { type: "string" } }, required: ["recipe_id"], additionalProperties: false },
  },
  {
    name: "suggest_palette_expansions",
    description:
      "Given recipe ids the household cooks, find complete meals from other countries that share dish archetypes, plate roles and flavours (e.g. Nigerian rice & beans with dodo → Jamaican rice & peas with jerk chicken and fried plantain). Allergen-safe for this household.",
    input_schema: { type: "object", properties: { recipe_ids: { type: "array", items: { type: "string" } } }, required: ["recipe_ids"], additionalProperties: false },
  },
];

async function allergenUnsafe(db: SupabaseClient, recipeIds: string[], excl: string[]): Promise<Set<string>> {
  if (!excl.length || !recipeIds.length) return new Set();
  const { data: ri } = await db.from("recipe_ingredients").select("recipe_id, ingredient_id").in("recipe_id", recipeIds);
  const ingIds = [...new Set((ri ?? []).map((r) => r.ingredient_id as string))];
  if (!ingIds.length) return new Set(recipeIds); // can't verify → treat as unsafe
  const { data: bad } = await db.from("ingredient_allergens").select("ingredient_id").in("ingredient_id", ingIds).in("allergen_key", excl).in("presence", ["contains", "may_contain"]);
  const badIngs = new Set((bad ?? []).map((b) => b.ingredient_id as string));
  const withIngs = new Set((ri ?? []).map((r) => r.recipe_id as string));
  return new Set([...(ri ?? []).filter((r) => badIngs.has(r.ingredient_id as string)).map((r) => r.recipe_id as string), ...recipeIds.filter((id) => !withIngs.has(id))]);
}

export async function runTool(db: SupabaseClient, ctx: SousChefContext, name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === "lookup_ingredient_facts") {
    const { data: m } = await db.rpc("resolve_ingredient_names", { p_names: [String(input.name ?? "").slice(0, 80)], p_min_score: 0.5 });
    const hit = (m as { ingredient_id: string | null; matched_name: string; score: number }[])?.[0];
    if (!hit?.ingredient_id) return { found: false, note: "No ingredient in LUKA's knowledge base matches that name." };
    const id = hit.ingredient_id;
    const [ing, nut, all, price, season] = await Promise.all([
      db.from("ingredients").select("canonical_name, verification_status, wikidata_qid").eq("id", id).single(),
      db.from("ingredient_nutrition").select("source_id, energy_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, micronutrients, verified_at").eq("ingredient_id", id).eq("is_primary", true).maybeSingle(),
      db.from("ingredient_allergens").select("allergen_key, presence, source_id").eq("ingredient_id", id),
      db.from("ingredient_prices").select("source_id, normalized_price_per_kg, currency_code, period_start").eq("ingredient_id", id).eq("geography_code", ctx.regionCode).neq("source_id", "luka_baseline").order("period_start", { ascending: false }).limit(1).maybeSingle(),
      db.from("ingredient_seasonality").select("availability").eq("ingredient_id", id).eq("region_code", ctx.regionCode).eq("month", new Date().getMonth() + 1).maybeSingle(),
    ]);
    const { data: names } = await db.from("ingredient_names").select("name, language_code, region_code").eq("ingredient_id", id).limit(12);
    return {
      found: true,
      ingredient: ing.data?.canonical_name,
      matched_name: hit.matched_name,
      also_called: (names ?? []).map((n) => `${n.name}${n.region_code ? ` (${n.region_code})` : ""}`),
      verification: ing.data?.verification_status,
      nutrition_per_100g: nut.data
        ? { ...nut.data, note: nut.data.source_id === "luka_baseline" ? "LUKA baseline estimate, not yet source-verified" : undefined }
        : null,
      allergens: all.data ?? [],
      latest_price: price.data ? { per_kg: price.data.normalized_price_per_kg, currency: price.data.currency_code, month: price.data.period_start, source: price.data.source_id } : null,
      season_this_month: season.data?.availability ?? null,
    };
  }
  if (name === "search_verified_recipes") {
    let q = db.from("recipes").select("id, title, cuisine_tags, prep_minutes, cook_minutes, avg_rating, rating_count, plate_role").eq("status", "live").in("verification_status", ["source_verified", "curated"]);
    if (input.query) q = q.ilike("title", `%${String(input.query).replace(/[%_,()]/g, " ").slice(0, 60)}%`);
    if (input.cuisine) q = q.contains("cuisine_tags", [String(input.cuisine).slice(0, 60)]);
    const { data } = await q.limit(40);
    const max = Number(input.max_minutes) || 0;
    const rows = (data ?? []).filter((r) => !max || (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0) <= max);
    const unsafe = await allergenUnsafe(db, rows.map((r) => r.id as string), ctx.allergenExclusions);
    return rows
      .filter((r) => !unsafe.has(r.id as string))
      .slice(0, Math.min(10, Number(input.limit) || 8))
      .map((r) => ({ id: r.id, title: r.title, cuisines: r.cuisine_tags, total_minutes: (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0), plate_role: r.plate_role, rating: r.rating_count ? `${r.avg_rating} from ${r.rating_count}` : null }));
  }
  if (name === "get_recipe_details") {
    const id = String(input.recipe_id ?? "").slice(0, 120);
    const unsafe = await allergenUnsafe(db, [id], ctx.allergenExclusions);
    if (unsafe.has(id)) return { error: "This recipe contains one of the household's allergens or can't be checked, so LUKA won't suggest it." };
    const [r, ings, steps] = await Promise.all([
      db.from("recipes").select("title, cuisine_tags, summary, prep_minutes, cook_minutes, verification_status").eq("id", id).eq("status", "live").maybeSingle(),
      db.from("recipe_ingredients").select("quantity, unit, preparation_note, ingredients(canonical_name)").eq("recipe_id", id).order("sort_order"),
      db.from("recipe_steps").select("step_number, instruction").eq("recipe_id", id).order("step_number"),
    ]);
    if (!r.data) return { error: "No live recipe with that id." };
    return {
      ...r.data,
      ingredients_for_4: (ings.data ?? []).map((i) => `${i.quantity} ${i.unit} ${(i.ingredients as unknown as { canonical_name: string } | null)?.canonical_name ?? ""}${i.preparation_note ? `, ${i.preparation_note}` : ""}`),
      steps: (steps.data ?? []).map((s) => s.instruction),
    };
  }
  if (name === "suggest_palette_expansions") {
    const ids = (Array.isArray(input.recipe_ids) ? input.recipe_ids : []).map(String).slice(0, 10);
    const { data } = await db.rpc("suggest_palette_expansions", { p_household_id: null, p_current_recipe_ids: ids, p_limit: 6 });
    const plates = (data ?? []) as { plate_title: string; plate_summary: string; recipe_ids: string[]; recipe_titles: string[]; shared_pantry: string[]; reasons: unknown }[];
    const unsafe = await allergenUnsafe(db, plates.flatMap((p) => p.recipe_ids), ctx.allergenExclusions);
    return plates.filter((p) => !p.recipe_ids.some((r) => unsafe.has(r))).slice(0, 3);
  }
  throw new Error(`Unknown tool ${name}`);
}

export const SYSTEM = (ctx: SousChefContext) => `You are LUKA, a calm, culturally fluent sous-chef helping one household cook at home. Be encouraging, precise and non-judgmental: never scold anyone for skipping a meal or ordering takeout. Respect each dish's own name and tradition; when you relate dishes across cultures (Dodo, Jamaican fried ripe plantain, Pazham Pori), present them as peers, never as one generic dish.

Ground rules:
- Use your tools for facts. Only state nutrition numbers, prices and allergen information that a tool returned in this conversation, and say where it came from (e.g. "USDA FoodData Central", "Statistics Canada, Sept 2026"). If a tool returns nothing, say LUKA doesn't have verified data yet. Never estimate those numbers yourself.
- Only recommend recipes returned by search_verified_recipes or suggest_palette_expansions.
- This household avoids these allergens: ${ctx.allergenExclusions.join(", ") || "none recorded"}. Food rules: ${ctx.dietaryRestrictions.join(", ") || "none recorded"}. Never suggest anything that breaks them.
- Cooking technique, substitutions and timing advice from general knowledge is fine, but keep food safety conservative (poultry 74 °C, pork and ground meat 71 °C).
- Keep answers short and practical, in plain sentences; short lists are fine. Region: ${ctx.regionCode}.`;

/** Claude: the last link in the provider chain (see chatChain.ts). */
export async function askSousChef(db: SupabaseClient, ctx: SousChefContext, history: ChatTurn[]): Promise<{ text: string; toolsUsed: string[] }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
  const toolsUsed: string[] = [];
  try {
    for (let round = 0; round < 6; round++) {
      const res = await anthropic().beta.messages.create({
        model: currentModel(),
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [{ type: "text", text: SYSTEM(ctx), cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        output_config: { effort: "low" },
        messages,
      });
      if (res.stop_reason === "refusal") return { text: "I can't help with that one. Ask me about a dish, an ingredient or tonight's plan.", toolsUsed };
      const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || !calls.length) {
        const text = res.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return { text: text || "I'm not sure. Could you ask that another way?", toolsUsed };
      }
      // Keep the whole assistant turn (thinking blocks included) so the next round stays valid.
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const c of calls) {
        toolsUsed.push(c.name);
        try {
          const out = await runTool(db, ctx, c.name, (c.input ?? {}) as Record<string, unknown>);
          results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(out).slice(0, 12000) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: c.id, content: `Error: ${e instanceof Error ? e.message : String(e)}`, is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
    }
    return { text: "That took more lookups than I expected. Try asking about one dish or ingredient at a time.", toolsUsed };
  } catch (e) {
    throw toAIError(e);
  }
}
