import type { SupabaseClient } from "@supabase/supabase-js";
import { withRun } from "./runs";

/** Open Food Facts allergen taxonomy → LUKA allergen keys. */
const OFF_ALLERGENS: Record<string, string> = {
  "en:gluten": "gluten",
  "en:milk": "dairy",
  "en:eggs": "egg",
  "en:peanuts": "peanut",
  "en:nuts": "treenut",
  "en:fish": "fish",
  "en:crustaceans": "shellfish",
  "en:molluscs": "shellfish",
  "en:soybeans": "soy",
  "en:sesame-seeds": "sesame",
  "en:mustard": "mustard",
};

export interface OffProduct {
  code?: string;
  product?: { product_name?: string; allergens_tags?: string[]; traces_tags?: string[]; quantity?: string };
  status?: number;
}

/** Contains / may-contain allergens and pack label from an OFF product payload. */
export function offToAllergens(p: OffProduct): { contains: string[]; mayContain: string[]; packLabel: string | null; name: string | null } {
  const map = (tags: string[] = []) => [...new Set(tags.map((t) => OFF_ALLERGENS[t]).filter(Boolean))];
  const contains = map(p.product?.allergens_tags);
  const mayContain = map(p.product?.traces_tags).filter((a) => !contains.includes(a));
  return { contains, mayContain, packLabel: p.product?.quantity ?? null, name: p.product?.product_name ?? null };
}

/** Attaches a packaged product's declared allergens to a canonical ingredient (by barcode). */
export async function enrichFromBarcode(db: SupabaseClient, appKey: string, barcode: string) {
  if (!/^\d{8,14}$/.test(barcode)) throw new Error("Barcodes are 8–14 digits.");
  return withRun(db, "open_food_facts", "enrich-barcode", async () => {
    const { data: ing } = await db.from("ingredients").select("id").eq("app_key", appKey).maybeSingle();
    if (!ing) throw new Error(`Unknown ingredient ${appKey}`);
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,allergens_tags,traces_tags,quantity`, {
      // OFF asks API users to identify their app; no personal details are sent.
      headers: { "user-agent": "LUKA/0.3 (https://luka-delta.vercel.app)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
    const p = (await res.json()) as OffProduct;
    if (p.status !== 1) return { seen: 0, upserted: 0, details: { notFound: barcode } };
    const a = offToAllergens(p);
    const rows = [
      ...a.contains.map((k) => ({ allergen_key: k, presence: "contains" })),
      ...a.mayContain.map((k) => ({ allergen_key: k, presence: "may_contain" })),
    ].map((r) => ({ ...r, ingredient_id: ing.id, barcode, pack_size_label: a.packLabel, source_id: "open_food_facts", source_record_ref: `https://world.openfoodfacts.org/product/${barcode}`, verified_at: new Date().toISOString() }));
    await db.from("ingredient_allergens").delete().eq("ingredient_id", ing.id).eq("source_id", "open_food_facts").eq("barcode", barcode);
    if (rows.length) {
      const { error } = await db.from("ingredient_allergens").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { seen: 1, upserted: rows.length, details: { product: a.name, contains: a.contains, mayContain: a.mayContain } };
  });
}
