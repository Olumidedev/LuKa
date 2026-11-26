#!/usr/bin/env node
// Loads supabase/seed-data.json into a Supabase project over its REST API
// (service role), idempotently. Run after the knowledge-base migration:
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seed-kb.mjs
//
// Order matters (foreign keys). Upserts use each table's natural key; the
// baseline allergen and price rows (whose unique keys are expressions) are
// replaced wholesale for source `luka_baseline`.
import { readFileSync } from "node:fs";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const data = JSON.parse(readFileSync(new URL("../supabase/seed-data.json", import.meta.url), "utf8"));
const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

const PLAN = [
  ["ingredients", "id"],
  ["ingredient_names", "ingredient_id,normalized_name,language_code"],
  ["ingredient_nutrition", "ingredient_id,source_id"],
  ["ingredient_allergens", null],
  ["ingredient_prices", null],
  ["statcan_product_map", "product_label"],
  ["dish_archetypes", "id"],
  ["recipes", "id"],
  ["dish_origins", "recipe_id,country_code,relation_type"],
  ["recipe_ingredients", "id"],
  ["recipe_steps", "recipe_id,step_number"],
  ["meal_plates", "id"],
  ["meal_plate_items", "plate_id,recipe_id"],
];

async function req(method, path, body, prefer) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...(prefer ? { prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} → ${res.status} ${await res.text()}`);
}

for (const [table, conflict] of PLAN) {
  const rows = data[table] ?? [];
  if (!rows.length) continue;
  if (!conflict) await req("DELETE", `${table}?source_id=eq.luka_baseline`);
  for (let i = 0; i < rows.length; i += 400) {
    const batch = rows.slice(i, i + 400);
    if (conflict) await req("POST", `${table}?on_conflict=${conflict}`, batch, "resolution=merge-duplicates,return=minimal");
    else await req("POST", table, batch, "return=minimal");
  }
  console.log(`${table}: ${rows.length}`);
}
console.log("Seed loaded.");
