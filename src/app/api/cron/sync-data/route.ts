import { NextResponse } from "next/server";
import { syncNutrition } from "@/lib/connectors/nutrition";
import { syncStatcanPrices } from "@/lib/connectors/statcan";
import { authorizeJob } from "@/lib/server/cron";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Monthly open-data refresh: Statistics Canada prices, then a batch of
 * Canadian Nutrient File and USDA nutrition links (each run continues where
 * the last left off, within rate limits).
 */
async function run(req: Request) {
  const who = await authorizeJob(req);
  if (!who) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 503 });
  const job = new URL(req.url).searchParams.get("job") ?? "all";
  const out: Record<string, unknown> = {};
  const attempt = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (e) {
      out[name] = { error: e instanceof Error ? e.message : String(e) };
    }
  };
  if (job === "all" || job === "prices") await attempt("prices", () => syncStatcanPrices(db, { months: 3 }));
  if (job === "all" || job === "cnf") await attempt("cnf", () => syncNutrition(db, { source: "hc_cnf", limit: 140 }));
  if ((job === "all" || job === "fdc") && process.env.USDA_FDC_API_KEY) await attempt("fdc", () => syncNutrition(db, { source: "usda_fdc", limit: 140, apiKey: process.env.USDA_FDC_API_KEY }));
  return NextResponse.json(out);
}
export const GET = run;
export const POST = run;
