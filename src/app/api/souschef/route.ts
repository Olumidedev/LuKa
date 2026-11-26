import { NextResponse } from "next/server";
import { askWithFallback, chatConfigured } from "@/lib/kb/chatChain";
import type { ChatTurn } from "@/lib/kb/sousChef";
import { requireUser } from "@/lib/server/auth";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
const DAILY = Number(process.env.SOUSCHEF_DAILY_LIMIT || 40);

export async function POST(req: Request) {
  if (!rateLimit(`chef:${clientIp(req)}`, 12)) return NextResponse.json({ error: "One moment. Too many questions at once." }, { status: 429 });
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to ask LUKA." }, { status: 401 });
  const db = supabaseAdmin();
  if (!db || !chatConfigured()) return NextResponse.json({ error: "Ask LUKA isn't switched on yet." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { messages?: ChatTurn[]; householdId?: string };
  const turns = (Array.isArray(body.messages) ? body.messages : [])
    .filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.trim())
    .slice(-16)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 2000) }));
  if (!turns.length || turns[0].role !== "user" || turns[turns.length - 1].role !== "user") return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

  // The household must be one this person belongs to.
  const { data: memberships } = await db.from("household_members").select("household_id").eq("user_id", user.id);
  const ids = (memberships ?? []).map((m) => m.household_id as string);
  const householdId = body.householdId && ids.includes(body.householdId) ? body.householdId : ids[0];
  if (!householdId) return NextResponse.json({ error: "Set up your household first." }, { status: 400 });
  const { data: hh } = await db.from("households").select("region_code, allergen_exclusions, dietary_restrictions").eq("id", householdId).single();

  if (!user.isAdmin) {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await db.from("usage_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("name", "souschef_asked").gte("created_at", since);
    if ((count ?? 0) >= DAILY) return NextResponse.json({ error: "That's today's question limit. Ask again tomorrow." }, { status: 429 });
  }

  try {
    const out = await askWithFallback(db, { householdId, regionCode: hh?.region_code ?? "CA", allergenExclusions: hh?.allergen_exclusions ?? [], dietaryRestrictions: hh?.dietary_restrictions ?? [] }, turns);
    await db.from("usage_events").insert({ device_id: crypto.randomUUID(), user_id: user.id, name: "souschef_asked", props: { tools: out.toolsUsed.length, provider: out.provider, fallbacks: out.skipped.length }, path: "/api/souschef" });
    return NextResponse.json({ text: out.text, provider: out.provider });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status });
  }
}
