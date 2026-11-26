import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withRun } from "../connectors/runs";
import { ALL_COUNTRIES } from "../data/countries";
import { generateStructured } from "../ai/gateway";
import { SYSTEM } from "../ai/prompts";
import { RecipeBatchOut } from "../ai/schemas";
import { ingestRecipeSubmission, toPositionalSteps } from "./intake";

/**
 * Weekly cuisine gap-finder: asks the database which cuisines people pick but
 * LUKA serves poorly, has Claude draft home recipes for them using LUKA's
 * canonical ingredients, and files each one in the review queue. Nothing goes
 * live without an admin's approval.
 */
export async function runWeeklyGapAgent(db: SupabaseClient, opts: { minSelections?: number; maxCuisines?: number; perCuisine?: number } = {}) {
  return withRun(db, "luka_curation", "weekly-cuisine-gap-agent", async () => {
    const { data: gaps, error } = await db.rpc("get_underserved_cuisines", { p_min_selections: opts.minSelections ?? 3 });
    if (error) throw new Error(`get_underserved_cuisines: ${error.message}`);
    const targets = ((gaps ?? []) as { cuisine: string; households: number; verified_recipes: number }[])
      .filter((g) => ALL_COUNTRIES.includes(g.cuisine))
      .slice(0, opts.maxCuisines ?? 3);

    // Canonical ingredient vocabulary (includes ingredients added since the app was built).
    const { data: kbIngs } = await db.from("ingredients").select("app_key, canonical_name").order("app_key").limit(1000);
    const vocab = (kbIngs ?? []).map((i) => `${i.app_key}=${i.canonical_name}`).join("; ");

    let submitted = 0;
    let failed = 0;
    const filed: { cuisine: string; ids: string[] }[] = [];
    for (const g of targets) {
      try {
        const { data: existing } = await db.from("recipes").select("title").contains("cuisine_tags", [g.cuisine]).limit(100);
        const { data: queued } = await db.from("recipe_submissions").select("normalized_recipe->>title").in("status", ["pending_review", "needs_ingredient_mapping"]).limit(500);
        const avoid = [...(existing ?? []).map((r) => r.title as string), ...((queued ?? []) as { title: string }[]).map((r) => r.title)];
        const out = await generateStructured({
          schema: RecipeBatchOut,
          system: SYSTEM,
          prompt: `Write ${opts.perCuisine ?? 4} everyday home recipes from ${g.cuisine}, spread across breakfast, lunch and dinner. Respect the dish's own name and tradition; don't relabel it as a generic or another country's dish.
Use LUKA's canonical ingredients wherever they fit, with exactly these ids: ${vocab}. Only add a new ingredient when the dish truly needs it, and name it plainly.
${avoid.length ? `Don't repeat: ${avoid.slice(0, 80).join("; ")}.` : ""}
Set countries to ["${g.cuisine}"].`,
          effort: "medium",
        });
        const ids: string[] = [];
        for (const r of out.recipes) {
          const ingIds = r.ingredients.map((i) => i.id);
          const byKey = new Map((kbIngs ?? []).map((k) => [k.app_key as string, k.canonical_name as string]));
          const res = await ingestRecipeSubmission(db, {
            sourceChannel: "weekly_gap_agent",
            originType: "claude",
            rawPayload: r,
            raw: {
              title: r.name,
              cuisine_tags: [g.cuisine],
              meals: r.meals,
              prep_minutes: r.activeMin,
              cook_minutes: Math.max(0, r.totalMin - r.activeMin),
              spice: r.spice,
              batch: r.batch,
              ingredients: r.ingredients.map((i) => ({ name: byKey.get(i.id) ?? i.name, quantity: i.qty, unit: i.unit, allergens: i.allergens })),
              steps: toPositionalSteps(r.steps, ingIds),
            },
          });
          ids.push(res.id);
          submitted++;
        }
        filed.push({ cuisine: g.cuisine, ids });
      } catch (e) {
        failed++;
        console.error("[gap-agent]", g.cuisine, e instanceof Error ? e.message : e);
      }
    }
    return { seen: targets.length, upserted: submitted, details: { failed, filed, gaps: (gaps ?? []).length } };
  });
}
