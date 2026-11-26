/**
 * Builds the knowledge-base seed from the app's own catalogue and library, so
 * the database and the offline app never disagree.
 *
 *   npm run seed:build   → supabase/seed.sql   (for `supabase db reset` / the SQL editor)
 *                        → supabase/seed-data.json (for scripts/seed-kb.mjs, REST upsert)
 *
 * Baseline facts are attributed to source `luka_baseline` and stay `unverified`
 * until the open-data connectors attach source-backed rows.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { INGREDIENTS } from "../src/lib/data/ingredients";
import { LIBRARY } from "../src/lib/data/recipes";
import { ARCHETYPES, COUNTRY_CODES, INGREDIENT_ALIASES, PLATES, SLUG_OVERRIDES, STATCAN_MAP } from "../src/lib/data/heritage";
import { formatAmountWithName } from "../src/lib/engine/quantities";

const uuid = (seed: string) => {
  const h = createHash("md5").update(`luka:${seed}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const kebab = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
const GRAMS_PER_UNIT: Record<string, number> = { eggs: 50 };
const BASELINE_PERIOD = "2026-01-01";

type Row = Record<string, unknown>;
const data: Record<string, Row[]> = {
  ingredients: [],
  ingredient_names: [],
  ingredient_nutrition: [],
  ingredient_allergens: [],
  ingredient_prices: [],
  statcan_product_map: [],
  dish_archetypes: [],
  recipes: [],
  dish_origins: [],
  recipe_ingredients: [],
  recipe_steps: [],
  meal_plates: [],
  meal_plate_items: [],
};

const ingId = (key: string) => uuid(`ingredient:${key}`);
const slugs = new Set<string>();

for (const ing of Object.values(INGREDIENTS)) {
  let slug = SLUG_OVERRIDES[ing.key] ?? kebab(ing.name);
  while (slugs.has(slug)) slug = `${slug}-${ing.key}`;
  slugs.add(slug);
  const gpu = ing.unit === "pc" ? GRAMS_PER_UNIT[ing.key] ?? 100 : null;
  const packGrams = ing.unit === "pc" ? ing.pack * (gpu ?? 100) : ing.pack;
  data.ingredients.push({
    id: ingId(ing.key),
    slug,
    app_key: ing.key,
    canonical_name: ing.name,
    category: ing.aisle,
    kind: ing.kind ?? null,
    default_pack_unit: ing.unit,
    pack_quantity: ing.pack,
    default_pack_size_g: packGrams,
    grams_per_unit: gpu,
    pack_label: ing.packLabel,
    countable: !!ing.countable,
    shelf_days: ing.shelf,
    chili: !!ing.chili,
    verification_status: "unverified",
  });

  // Names: the display name, its parts ("Kale / callaloo greens"), bracketed local names, and curated aliases.
  const names = new Map<string, Row>();
  const addName = (name: string, extra: Row = {}) => {
    const n = name.trim();
    const k = `${n.toLowerCase()}|${extra.language_code ?? "en"}`;
    if (n && !names.has(k)) names.set(k, { ingredient_id: ingId(ing.key), name: n, language_code: "en", region_code: null, is_canonical: false, is_variant: false, source_id: "luka_baseline", ...extra });
  };
  addName(ing.name, { is_canonical: true });
  const plain = ing.name.replace(/\s*\([^)]*\)/g, "").trim();
  for (const part of plain.split(/\s*\/\s*/)) addName(part);
  for (const m of ing.name.matchAll(/\(([^)]+)\)/g)) for (const part of m[1].split(/\s*,\s*/)) if (!/^\d/.test(part) && !/canned|pasteurized|pre-cooked|melon seed/i.test(part)) addName(part, { is_variant: true });
  for (const a of INGREDIENT_ALIASES[ing.key] ?? []) addName(a.name, { language_code: a.lang ?? "en", region_code: a.region ?? null, is_variant: !!a.variant, source_id: "luka_curation" });
  data.ingredient_names.push(...names.values());

  const per100 = ing.unit === "pc" ? 100 / (gpu ?? 100) : 1;
  const n = ing.nutrition;
  data.ingredient_nutrition.push({
    ingredient_id: ingId(ing.key),
    source_id: "luka_baseline",
    source_record_ref: `catalogue:${ing.key}`,
    energy_kcal: +(n.kcal * per100).toFixed(2),
    protein_g: +(n.protein * per100).toFixed(2),
    fiber_g: +(n.fiber * per100).toFixed(2),
    micronutrients: { iron_mg: +(n.iron * per100).toFixed(2), folate_ug: +(n.folate * per100).toFixed(1), calcium_mg: +(n.calcium * per100).toFixed(1), omega3_g: +(n.omega3 * per100).toFixed(2) },
    is_primary: true,
  });
  for (const a of ing.allergens) data.ingredient_allergens.push({ ingredient_id: ingId(ing.key), allergen_key: a, presence: "contains", source_id: "luka_baseline", source_record_ref: `catalogue:${ing.key}` });
  data.ingredient_prices.push({
    ingredient_id: ingId(ing.key),
    source_id: "luka_baseline",
    geography_code: "CA",
    currency_code: "CAD",
    price_amount: ing.price,
    pack_quantity: ing.pack,
    pack_unit: ing.unit,
    normalized_price_per_kg: +((ing.price / packGrams) * 1000).toFixed(2),
    period_start: BASELINE_PERIOD,
    source_series_id: "baseline",
    source_record_ref: `catalogue:${ing.key}`,
  });
}

for (const m of STATCAN_MAP) {
  if (!INGREDIENTS[m.key]) throw new Error(`StatCan map: unknown ingredient ${m.key}`);
  data.statcan_product_map.push({ product_label: m.label, ingredient_id: ingId(m.key), grams_per_product: m.grams ?? null, per_unit: !!m.perUnit });
}

const archId = (slug: string) => uuid(`archetype:${slug}`);
for (const a of ARCHETYPES) data.dish_archetypes.push({ id: archId(a.slug), slug: a.slug, canonical_label: a.label, description: a.description });

const MAINS = new Set(["main_one_pot", "protein_main", "soup_stew"]);
for (const r of LIBRARY) {
  const slug = kebab(r.id.replace(/_/g, "-"));
  data.recipes.push({
    id: r.id,
    slug,
    title: r.name,
    summary: null,
    cuisine_tags: r.countries,
    meals: r.meals,
    recipe: r,
    app_ingredients: {},
    origin_type: "built_in",
    origin_ref: "luka-library",
    verification_status: "curated",
    status: "live",
    plate_role: r.plateRole ?? "main_one_pot",
    dish_archetype_id: r.archetype ? archId(r.archetype) : null,
    flavor_tags: r.flavorTags ?? [],
    local_dish_names: r.localNames ?? [],
    prep_minutes: r.activeMin,
    cook_minutes: Math.max(0, r.totalMin - r.activeMin),
    servings: 4,
  });
  if (!MAINS.has(r.plateRole ?? "main_one_pot") && !r.plateRole) throw new Error(`bad plate role ${r.id}`);
  for (const c of r.countries) {
    const cc = COUNTRY_CODES[c];
    if (!cc) throw new Error(`No ISO code for ${c} (${r.id})`);
    data.dish_origins.push({ recipe_id: r.id, country_code: cc.code, wikidata_country_qid: cc.qid ?? null, region_label: r.id === "in_pazham_pori" ? "Kerala" : null, relation_type: "origin" });
  }
  r.ingredients.forEach((ri, i) => {
    const ing = INGREDIENTS[ri.key];
    if (!ing) throw new Error(`${r.id}: unknown ingredient ${ri.key}`);
    data.recipe_ingredients.push({
      id: uuid(`ri:${r.id}:${ri.key}`),
      recipe_id: r.id,
      ingredient_id: ingId(ri.key),
      quantity: ri.qty,
      unit: ing.unit,
      grams_equivalent: ing.unit === "pc" ? ri.qty * (GRAMS_PER_UNIT[ri.key] ?? 100) : ri.qty,
      sort_order: i + 1,
    });
  });
  r.steps.forEach((step, i) => {
    const timer = step.match(/\[t(\d+)\]/);
    const text = step
      .replace(/\{([a-z0-9_]+)(?:\*([0-9.]+))?\}/g, (_m, key: string, f?: string) => {
        const ing = INGREDIENTS[key];
        const ri = r.ingredients.find((x) => x.key === key);
        return ing && ri ? formatAmountWithName(ri.qty * (f ? Number(f) : 1), ing) : key;
      })
      .replace(/\s*\[t(\d+)\]/g, " ($1 min)")
      .replace(/\s+/g, " ")
      .trim();
    data.recipe_steps.push({ recipe_id: r.id, step_number: i + 1, instruction: text, timer_minutes: timer ? Number(timer[1]) : null });
  });
}

for (const p of PLATES) {
  const id = uuid(`plate:${p.slug}`);
  data.meal_plates.push({ id, slug: p.slug, title: p.title, summary: p.summary, country_code: p.country, cuisine_tags: [p.cuisine], verification_status: "curated" });
  p.items.forEach((it, i) => {
    if (!LIBRARY.some((r) => r.id === it.recipeId)) throw new Error(`plate ${p.slug}: unknown recipe ${it.recipeId}`);
    data.meal_plate_items.push({ plate_id: id, recipe_id: it.recipeId, role_in_plate: it.role, is_anchor: !!it.anchor, sort_order: i + 1 });
  });
}

/* ── SQL output ── */
const CONFLICT: Record<string, string> = {
  ingredients: "id",
  ingredient_names: "ingredient_id, normalized_name, language_code",
  ingredient_nutrition: "ingredient_id, source_id",
  ingredient_allergens: "",
  ingredient_prices: "",
  statcan_product_map: "product_label",
  dish_archetypes: "id",
  recipes: "id",
  dish_origins: "recipe_id, country_code, relation_type",
  recipe_ingredients: "id",
  recipe_steps: "recipe_id, step_number",
  meal_plates: "id",
  meal_plate_items: "plate_id, recipe_id",
};
const ARRAY_COLS = new Set(["cuisine_tags", "meals", "flavor_tags", "texture_tags"]);
const JSON_COLS = new Set(["recipe", "app_ingredients", "micronutrients", "local_dish_names"]);

const lit = (col: string, v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (ARRAY_COLS.has(col)) return `array[${(v as string[]).map((x) => `'${String(x).replace(/'/g, "''")}'`).join(", ")}]::text[]`;
  if (JSON_COLS.has(col)) return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

let sql = `-- Generated by scripts/build-seed.ts. Do not edit by hand: change the catalogue or heritage data and rebuild.\n-- Idempotent: safe to run again after migrations.\n\nbegin;\n`;
for (const [table, rows] of Object.entries(data)) {
  if (!rows.length) continue;
  const cols = Object.keys(rows[0]);
  const values = rows.map((r) => `(${cols.map((c) => lit(c, r[c])).join(", ")})`).join(",\n  ");
  const key = CONFLICT[table];
  let tail: string;
  if (table === "ingredient_allergens") tail = "on conflict (ingredient_id, allergen_key, source_id, coalesce(barcode, '')) do nothing";
  else if (table === "ingredient_prices") tail = "on conflict (ingredient_id, source_id, geography_code, period_start, coalesce(source_series_id, '')) do update set price_amount = excluded.price_amount, normalized_price_per_kg = excluded.normalized_price_per_kg";
  else {
    const upd = cols.filter((c) => !key.split(", ").includes(c)).map((c) => `${c} = excluded.${c}`).join(", ");
    tail = upd ? `on conflict (${key}) do update set ${upd}` : `on conflict (${key}) do nothing`;
  }
  sql += `\n-- ${table} (${rows.length})\ninsert into public.${table} (${cols.join(", ")}) values\n  ${values}\n${tail};\n`;
}
sql += "\ncommit;\n";

writeFileSync("supabase/seed.sql", sql);
writeFileSync("supabase/seed-data.json", JSON.stringify(data));
console.log(Object.entries(data).map(([t, r]) => `${t}: ${r.length}`).join("\n"));
