import type { SupabaseClient } from "@supabase/supabase-js";
import { withRun } from "../connectors/runs";

/**
 * Recipe embeddings with bge-m3 on Cloudflare Workers AI (free daily
 * allocation, no card). bge-m3 is multilingual, so "Dòdò", "Ethakka appam"
 * and "fried ripe plantain" land near each other. Vectors feed the 30%
 * semantic part of find_similar_dishes.
 */
export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const EMBEDDING_DIMS = 1024;

export interface EmbedRow {
  id: string;
  title: string;
  summary: string | null;
  cuisine_tags: string[];
  local_dish_names: Record<string, string> | null;
  plate_role: string | null;
  flavor_tags: string[] | null;
  ingredients: string[];
}

/** The text a recipe is embedded from: names in every language, cuisine, role, flavours, ingredients. */
export function embeddingText(r: EmbedRow): string {
  const local = Object.values(r.local_dish_names ?? {}).filter(Boolean);
  return [
    r.title + (local.length ? ` (${local.join(", ")})` : ""),
    `Cuisine: ${r.cuisine_tags.join(", ")}`,
    r.plate_role ? `Plate role: ${r.plate_role.replace(/_/g, " ")}` : "",
    r.flavor_tags?.length ? `Flavours: ${r.flavor_tags.join(", ")}` : "",
    r.ingredients.length ? `Ingredients: ${r.ingredients.join(", ")}` : "",
    r.summary ?? "",
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 2000);
}

export async function embedTexts(texts: string[], env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<number[][]> {
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const token = env.CLOUDFLARE_AI_TOKEN;
  if (!account || !token) throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN.");
  const res = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${EMBEDDING_MODEL}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ text: texts }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; result?: { data?: number[][] }; errors?: { message: string }[] };
  if (!res.ok || body.success === false) throw new Error(`Workers AI ${res.status}: ${body.errors?.map((e) => e.message).join("; ") ?? "failed"}`);
  const data = body.result?.data ?? [];
  if (data.length !== texts.length || data.some((v) => v.length !== EMBEDDING_DIMS)) throw new Error(`Workers AI returned ${data.length} vectors of ${data[0]?.length ?? 0} dims`);
  return data;
}

/** Embeds live recipes that have no vector yet (new, or edited since). */
export async function runEmbeddingJob(db: SupabaseClient, opts: { limit?: number; batch?: number } = {}) {
  return withRun(db, "cloudflare_workers_ai", "recipe-embeddings", async () => {
    const { data: rows, error } = await db
      .from("recipes")
      .select("id, title, summary, cuisine_tags, local_dish_names, plate_role, flavor_tags, recipe_ingredients(ingredients(canonical_name))")
      .is("embedding", null)
      .eq("status", "live")
      .limit(opts.limit ?? 300);
    if (error) throw new Error(error.message);
    const list = (rows ?? []).map((r) => ({
      ...(r as unknown as EmbedRow),
      ingredients: ((r as unknown as { recipe_ingredients: { ingredients: { canonical_name: string } | null }[] }).recipe_ingredients ?? []).map((x) => x.ingredients?.canonical_name).filter((x): x is string => !!x),
    }));
    let upserted = 0;
    const size = opts.batch ?? 50;
    for (let i = 0; i < list.length; i += size) {
      const chunk = list.slice(i, i + size);
      const vectors = await embedTexts(chunk.map(embeddingText));
      for (const [n, r] of chunk.entries()) {
        const { error: e } = await db.from("recipes").update({ embedding: JSON.stringify(vectors[n]), embedding_model: "bge-m3" }).eq("id", r.id);
        if (!e) upserted++;
      }
    }
    return { seen: list.length, upserted };
  });
}
