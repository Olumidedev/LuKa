import { NextResponse } from "next/server";
import { runWeeklyGapAgent } from "@/lib/kb/gapAgent";
import { batchProvider } from "@/lib/ai/batch";
import { aiConfigured } from "@/lib/ai/gateway";
import { authorizeJob } from "@/lib/server/cron";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function run(req: Request) {
  const who = await authorizeJob(req);
  if (!who) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const db = supabaseAdmin();
  if (!db || (!aiConfigured() && batchProvider() !== "ollama")) return NextResponse.json({ error: "Needs Supabase and a model (Claude key or Ollama)." }, { status: 503 });
  try {
    const out = await runWeeklyGapAgent(db, { minSelections: Number(new URL(req.url).searchParams.get("min") ?? 3) });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gap agent failed." }, { status: 500 });
  }
}
export const GET = run; // Vercel Cron
export const POST = run; // Admin → Run now
