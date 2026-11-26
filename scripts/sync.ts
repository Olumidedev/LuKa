/**
 * Data connector CLI (runs the same modules as the scheduled Vercel jobs).
 *
 *   npx jiti scripts/sync.ts nutrition usda_fdc [--limit 25] [--keys plantain,ugu]
 *   npx jiti scripts/sync.ts nutrition hc_cnf   [--limit 25]
 *   npx jiti scripts/sync.ts prices [--months 3]
 *   npx jiti scripts/sync.ts wafct path/to/wafct.csv path/to/codes.json   (codes.json: {"ugu": "<WAFCT code>", …})
 *   npx jiti scripts/sync.ts off <app_key> <barcode>
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; nutrition from USDA also uses USDA_FDC_API_KEY.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { importWafct, syncNutrition } from "../src/lib/connectors/nutrition";
import { enrichFromBarcode } from "../src/lib/connectors/openfoodfacts";
import { syncStatcanPrices } from "../src/lib/connectors/statcan";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
const db = createClient(url, key, { auth: { persistSession: false } });

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

let result: unknown;
if (cmd === "nutrition") {
  const source = rest[0] === "hc_cnf" ? "hc_cnf" : "usda_fdc";
  result = await syncNutrition(db, { source, limit: Number(flag("limit") ?? 25), apiKey: process.env.USDA_FDC_API_KEY, onlyKeys: flag("keys")?.split(",") });
} else if (cmd === "prices") {
  result = await syncStatcanPrices(db, { months: Number(flag("months") ?? 3) });
} else if (cmd === "wafct") {
  result = await importWafct(db, readFileSync(rest[0], "utf8"), JSON.parse(readFileSync(rest[1], "utf8")));
} else if (cmd === "off") {
  result = await enrichFromBarcode(db, rest[0], rest[1]);
} else {
  console.error("Commands: nutrition <usda_fdc|hc_cnf>, prices, wafct <csv> <codes.json>, off <app_key> <barcode>");
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));
