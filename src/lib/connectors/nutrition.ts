import type { SupabaseClient } from "@supabase/supabase-js";
import { SEARCH_HINTS, nameScore } from "./match";
import { withRun } from "./runs";

/**
 * Nutrition connectors: USDA FoodData Central and Health Canada's Canadian
 * Nutrient File. Both use INFOODS-style nutrient numbers:
 *   208 kcal · 203 protein · 205 carbs · 204 fat · 291 fibre · 307 sodium
 *   303 iron · 301 calcium · folate 417/435/806 · omega-3 851+629+621+631
 */
export interface NutritionRow {
  energy_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  micronutrients: Record<string, number>;
}

function fromNumbers(get: (n: number) => number | undefined): NutritionRow {
  const omega = [851, 629, 621, 631].map(get).filter((v): v is number => v != null);
  const folate = get(417) ?? get(435) ?? get(806);
  const micro: Record<string, number> = {};
  const iron = get(303);
  const calcium = get(301);
  if (iron != null) micro.iron_mg = iron;
  if (calcium != null) micro.calcium_mg = calcium;
  if (folate != null) micro.folate_ug = folate;
  if (omega.length) micro.omega3_g = +omega.reduce((s, v) => s + v, 0).toFixed(3);
  return { energy_kcal: get(208) ?? null, protein_g: get(203) ?? null, carbs_g: get(205) ?? null, fat_g: get(204) ?? null, fiber_g: get(291) ?? null, sodium_mg: get(307) ?? null, micronutrients: micro };
}

interface FdcFood {
  fdcId: number;
  description: string;
  foodNutrients: { nutrient?: { number?: string }; amount?: number; nutrientNumber?: string; value?: number }[];
}

/** Parses an FDC /food/{fdcId} (or search hit) payload into per-100 g nutrition. */
export function fdcToNutrition(food: FdcFood): NutritionRow {
  const map = new Map<number, number>();
  for (const n of food.foodNutrients) {
    const num = Number(n.nutrient?.number ?? n.nutrientNumber);
    const val = n.amount ?? n.value;
    if (Number.isFinite(num) && typeof val === "number") map.set(num, val);
  }
  return fromNumbers((n) => map.get(n));
}

interface CnfAmount {
  nutrient_name_id: number;
  nutrient_value: number;
}

/** Parses a CNF nutrientamount payload (per 100 g) into nutrition. */
export function cnfToNutrition(rows: CnfAmount[]): NutritionRow {
  const map = new Map(rows.map((r) => [Number(r.nutrient_name_id), Number(r.nutrient_value)]));
  return fromNumbers((n) => map.get(n));
}

const FDC = "https://api.nal.usda.gov/fdc/v1";
const CNF = "https://food-nutrition.canada.ca/api/canadian-nutrient-file";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

interface IngredientRow {
  id: string;
  app_key: string;
  canonical_name: string;
  category: string;
}

function query(i: IngredientRow) {
  return SEARCH_HINTS[i.app_key] ?? `${i.canonical_name.replace(/\([^)]*\)/g, "").split("/")[0].trim()}${["produce", "protein"].includes(i.category) ? " raw" : ""}`;
}

export interface SyncOptions {
  source: "usda_fdc" | "hc_cnf";
  limit?: number;
  apiKey?: string; // FDC only; falls back to DEMO_KEY (very low rate limit)
  /** Auto-linked matches at or above this score become the ingredient's primary nutrition. */
  promoteAt?: number;
  onlyKeys?: string[];
}

/**
 * Links unlinked ingredients to the best-matching external record (status 'auto'),
 * then refreshes nutrition for every non-rejected link. A confirmed link (admin)
 * or a strong auto match replaces the LUKA baseline as primary.
 */
export async function syncNutrition(db: SupabaseClient, opts: SyncOptions) {
  return withRun(db, opts.source, "sync-nutrition", async () => {
    const promoteAt = opts.promoteAt ?? 0.75;
    const key = opts.apiKey || "DEMO_KEY";
    let q = db.from("ingredients").select("id, app_key, canonical_name, category").not("category", "in", "(spices,oils)").order("app_key");
    if (opts.onlyKeys?.length) q = q.in("app_key", opts.onlyKeys);
    const { data: ings, error } = await q.limit(opts.limit ?? 25);
    if (error) throw new Error(error.message);
    const { data: links } = await db.from("ingredient_source_links").select("ingredient_id, external_id, confidence, status").eq("source_id", opts.source);
    const linkBy = new Map((links ?? []).map((l) => [l.ingredient_id as string, l]));

    let cnfFoods: { food_code: number; food_description: string }[] | null = null;
    let upserted = 0;
    let failed = 0;
    const notes: string[] = [];

    for (const ing of (ings ?? []) as IngredientRow[]) {
      try {
        let link = linkBy.get(ing.id) as { external_id: string; confidence: number; status: string } | undefined;
        if (!link) {
          let best: { id: string; name: string; score: number } | null = null;
          if (opts.source === "usda_fdc") {
            const res = await getJson<{ foods: { fdcId: number; description: string }[] }>(
              `${FDC}/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query(ing))}&dataType=Foundation,SR%20Legacy&pageSize=8`,
            );
            for (const f of res.foods ?? []) {
              const s = Math.max(nameScore(query(ing), f.description), nameScore(ing.canonical_name, f.description));
              if (!best || s > best.score) best = { id: String(f.fdcId), name: f.description, score: s };
            }
          } else {
            cnfFoods ??= await getJson<{ food_code: number; food_description: string }[]>(`${CNF}/food/?lang=en&type=json`);
            for (const f of cnfFoods) {
              const s = Math.max(nameScore(query(ing), f.food_description), nameScore(ing.canonical_name, f.food_description));
              if (!best || s > best.score) best = { id: String(f.food_code), name: f.food_description, score: s };
            }
          }
          if (!best || best.score < 0.4) {
            notes.push(`${ing.app_key}: no good match`);
            continue;
          }
          link = { external_id: best.id, confidence: +best.score.toFixed(3), status: "auto" };
          await db.from("ingredient_source_links").upsert({ ingredient_id: ing.id, source_id: opts.source, external_id: best.id, matched_name: best.name, confidence: link.confidence, status: "auto" });
        }
        if (link.status === "rejected") continue;

        const row =
          opts.source === "usda_fdc"
            ? fdcToNutrition(await getJson<FdcFood>(`${FDC}/food/${encodeURIComponent(link.external_id)}?api_key=${encodeURIComponent(key)}`))
            : cnfToNutrition(await getJson<CnfAmount[]>(`${CNF}/nutrientamount/?id=${encodeURIComponent(link.external_id)}&lang=en&type=json`));
        const ref = opts.source === "usda_fdc" ? `https://fdc.nal.usda.gov/food-details/${link.external_id}/nutrients` : `cnf:food_code:${link.external_id}`;
        const { error: upErr } = await db
          .from("ingredient_nutrition")
          .upsert({ ingredient_id: ing.id, source_id: opts.source, source_food_id: link.external_id, source_record_ref: ref, ...row, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "ingredient_id,source_id" });
        if (upErr) throw new Error(upErr.message);
        upserted++;

        // Promote: a confirmed link, or a strong automatic match, replaces the baseline.
        if (link.status === "confirmed" || link.confidence >= promoteAt) {
          const { data: primary } = await db.from("ingredient_nutrition").select("source_id").eq("ingredient_id", ing.id).eq("is_primary", true).maybeSingle();
          if (!primary || primary.source_id === "luka_baseline" || link.status === "confirmed") {
            await db.from("ingredient_nutrition").update({ is_primary: false }).eq("ingredient_id", ing.id);
            await db.from("ingredient_nutrition").update({ is_primary: true }).eq("ingredient_id", ing.id).eq("source_id", opts.source);
          }
          if (link.status === "confirmed") await db.from("ingredients").update({ verification_status: "source_verified", verified_at: new Date().toISOString() }).eq("id", ing.id).eq("verification_status", "unverified");
        }
      } catch (e) {
        failed++;
        notes.push(`${ing.app_key}: ${e instanceof Error ? e.message : String(e)}`);
        if (/429|rate/i.test(String(e))) break; // out of quota: stop cleanly, next run resumes
      }
    }
    return { seen: ings?.length ?? 0, upserted, details: { failed, notes: notes.slice(0, 50) } };
  });
}

/* ── FAO/INFOODS West African Food Composition Table (2019) ── */

/**
 * Import hook for WAFCT 2019 exported to CSV. Columns are matched by INFOODS
 * tagname (ENERC/kcal, PROCNT, FAT, CHOAVLDF, FIBTG, NA, FE, CA, FOL…), so
 * minor header differences between exports don't matter. `codeFor` maps a
 * LUKA app key to the WAFCT food code to use.
 */
export function parseWafctCsv(csv: string): { code: string; name: string; nutrition: NutritionRow }[] {
  const lines = parseCsv(csv);
  const head = lines[0].map((h) => h.toUpperCase().replace(/\s+/g, ""));
  const col = (...tags: string[]) => head.findIndex((h) => tags.some((t) => h === t || h.startsWith(`${t}(`) || h.startsWith(`${t}_`) || h.startsWith(`${t}[`)));
  const idx = {
    code: col("CODE", "FOODCODE"),
    name: col("FOODNAMEINENGLISH", "FOODNAME", "NAME"),
    kcal: head.findIndex((h) => h.startsWith("ENERC") && h.includes("KCAL")),
    prot: col("PROCNT", "PROT"),
    fat: col("FAT", "FATCE"),
    cho: col("CHOAVLDF", "CHOAVL", "CHOCDF"),
    fib: col("FIBTG", "FIB"),
    na: col("NA"),
    fe: col("FE"),
    ca: col("CA"),
    fol: col("FOL", "FOLDFE"),
  };
  if (idx.code < 0 || idx.kcal < 0) throw new Error("WAFCT CSV needs a food code column and ENERC (kcal).");
  const num = (row: string[], i: number) => {
    if (i < 0) return undefined;
    const v = parseFloat(String(row[i] ?? "").replace(/[\[\]()]/g, "").replace(",", "."));
    return Number.isFinite(v) ? v : undefined;
  };
  return lines.slice(1).filter((r) => r[idx.code]).map((r) => {
    const map = new Map<number, number | undefined>([[208, num(r, idx.kcal)], [203, num(r, idx.prot)], [204, num(r, idx.fat)], [205, num(r, idx.cho)], [291, num(r, idx.fib)], [307, num(r, idx.na)], [303, num(r, idx.fe)], [301, num(r, idx.ca)], [417, num(r, idx.fol)]]);
    return { code: r[idx.code].trim(), name: idx.name >= 0 ? r[idx.name].trim() : "", nutrition: fromNumbers((n) => map.get(n)) };
  });
}

export async function importWafct(db: SupabaseClient, csv: string, codeFor: Record<string, string>) {
  return withRun(db, "fao_wafct_2019", "import-wafct", async () => {
    const rows = new Map(parseWafctCsv(csv).map((r) => [r.code, r]));
    const { data: ings } = await db.from("ingredients").select("id, app_key").in("app_key", Object.keys(codeFor));
    let upserted = 0;
    const missing: string[] = [];
    for (const ing of ings ?? []) {
      const r = rows.get(codeFor[ing.app_key as string]);
      if (!r) {
        missing.push(ing.app_key as string);
        continue;
      }
      await db.from("ingredient_source_links").upsert({ ingredient_id: ing.id, source_id: "fao_wafct_2019", external_id: r.code, matched_name: r.name, confidence: 1, status: "confirmed" });
      const { error } = await db
        .from("ingredient_nutrition")
        .upsert({ ingredient_id: ing.id, source_id: "fao_wafct_2019", source_food_id: r.code, source_record_ref: `WAFCT 2019 ${r.code}`, ...r.nutrition, verified_at: new Date().toISOString() }, { onConflict: "ingredient_id,source_id" });
      if (!error) upserted++;
    }
    return { seen: rows.size, upserted, details: { missing } };
  });
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) out.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}
