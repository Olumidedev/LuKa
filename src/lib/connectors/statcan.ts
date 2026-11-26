import type { SupabaseClient } from "@supabase/supabase-js";
import { unzipSync, strFromU8 } from "fflate";
import { parseCsv } from "./nutrition";
import { withRun } from "./runs";

/**
 * Statistics Canada Table 18-10-0245-01, "Monthly average retail prices for
 * selected products". Canada-level series only; each mapped product becomes a
 * dated price assertion with a normalised $/kg.
 */
export const STATCAN_TABLE_ZIP = "https://www150.statcan.gc.ca/n1/tbl/csv/18100245-eng.zip";

export interface MapRow {
  product_label: string;
  ingredient_id: string;
  grams_per_product: number | null;
  per_unit: boolean;
}

export interface PriceRow {
  ingredient_id: string;
  source_id: "statcan_18100245";
  geography_code: "CA";
  currency_code: "CAD";
  price_amount: number;
  pack_quantity: number;
  pack_unit: "g" | "kg" | "pc";
  normalized_price_per_kg: number;
  period_start: string;
  source_series_id: string;
  source_record_ref: string;
  verified_at: string;
}

/** Turns table rows into price assertions for the mapped products, latest `months` periods. */
export function statcanToPrices(csv: string, map: MapRow[], months = 3): PriceRow[] {
  const rows = parseCsv(csv);
  const h = rows[0];
  const at = (name: string) => h.indexOf(name);
  const [iDate, iGeo, iProd, iVal, iVec, iCoord] = ["REF_DATE", "GEO", "Products", "VALUE", "VECTOR", "COORDINATE"].map(at);
  if ([iDate, iGeo, iProd, iVal].some((i) => i < 0)) throw new Error("Unexpected StatCan CSV layout.");
  const byLabel = new Map(map.map((m) => [m.product_label.trim(), m]));
  const canada = rows.slice(1).filter((r) => r[iGeo] === "Canada" && byLabel.has(r[iProd].trim()) && r[iVal] !== "");
  const periods = [...new Set(canada.map((r) => r[iDate]))].sort().slice(-months);
  const now = new Date().toISOString();
  const out: PriceRow[] = [];
  for (const r of canada) {
    if (!periods.includes(r[iDate])) continue;
    const m = byLabel.get(r[iProd].trim())!;
    const value = Number(r[iVal]);
    if (!Number.isFinite(value)) continue;
    const perKg = /per kilogram/i.test(m.product_label);
    const grams = perKg ? 1000 : Number(m.grams_per_product);
    if (!grams) continue;
    out.push({
      ingredient_id: m.ingredient_id,
      source_id: "statcan_18100245",
      geography_code: "CA",
      currency_code: "CAD",
      price_amount: value,
      pack_quantity: perKg ? 1 : m.per_unit ? 1 : grams,
      pack_unit: perKg ? "kg" : m.per_unit ? "pc" : "g",
      normalized_price_per_kg: +((value / grams) * 1000).toFixed(2),
      period_start: `${r[iDate]}-01`,
      source_series_id: iVec >= 0 ? r[iVec] : m.product_label,
      source_record_ref: `18-10-0245-01 ${iCoord >= 0 ? r[iCoord] : ""} ${r[iProd].trim()} ${r[iDate]}`.trim(),
      verified_at: now,
    });
  }
  return out;
}

export async function syncStatcanPrices(db: SupabaseClient, opts: { months?: number; zip?: Uint8Array } = {}) {
  return withRun(db, "statcan_18100245", "sync-statcan-prices", async () => {
    let zip = opts.zip;
    if (!zip) {
      const res = await fetch(STATCAN_TABLE_ZIP, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`Statistics Canada answered ${res.status}`);
      zip = new Uint8Array(await res.arrayBuffer());
    }
    const files = unzipSync(zip, { filter: (f) => f.name === "18100245.csv" });
    const csv = files["18100245.csv"];
    if (!csv) throw new Error("18100245.csv missing from the download.");
    const { data: map, error } = await db.from("statcan_product_map").select("product_label, ingredient_id, grams_per_product, per_unit");
    if (error) throw new Error(error.message);
    const prices = statcanToPrices(strFromU8(csv), (map ?? []) as MapRow[], opts.months ?? 3);
    if (!prices.length) return { seen: 0, upserted: 0, details: { note: "no mapped Canada-level rows" } };
    const from = prices.map((p) => p.period_start).sort()[0];
    // Replace the window idempotently (the unique key is an expression, so no PostgREST upsert).
    await db.from("ingredient_prices").delete().eq("source_id", "statcan_18100245").eq("geography_code", "CA").gte("period_start", from);
    for (let i = 0; i < prices.length; i += 500) {
      const { error: insErr } = await db.from("ingredient_prices").insert(prices.slice(i, i + 500));
      if (insErr) throw new Error(insErr.message);
    }
    return { seen: prices.length, upserted: prices.length, details: { periods: [...new Set(prices.map((p) => p.period_start))], products: new Set(prices.map((p) => p.ingredient_id)).size } };
  });
}
