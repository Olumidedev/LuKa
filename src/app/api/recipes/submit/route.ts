import { NextResponse } from "next/server";
import { ALL_COUNTRIES } from "@/lib/data/countries";
import { parseIngredientLine } from "@/lib/ai/normalize";
import { ingestRecipeSubmission } from "@/lib/kb/intake";
import { requireUser } from "@/lib/server/auth";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { MealType } from "@/lib/types";

export const dynamic = "force-dynamic";

/** "Share with the LUKA community": a family recipe goes to the review queue. */
export async function POST(req: Request) {
  if (!rateLimit(`submit:${clientIp(req)}`, 5)) return NextResponse.json({ error: "Too many submissions. Try again in a minute." }, { status: 429 });
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to share a recipe." }, { status: 401 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "Sharing isn't switched on." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as {
    title?: string; country?: string; meals?: MealType[]; minutes?: number; ingredients?: string; steps?: string; credit?: string; consent?: boolean;
  };
  if (!b.consent) return NextResponse.json({ error: "Confirm you're happy to share this recipe." }, { status: 400 });
  const title = String(b.title ?? "").trim().slice(0, 140);
  const country = String(b.country ?? "");
  if (!title || !ALL_COUNTRIES.includes(country)) return NextResponse.json({ error: "Add a dish name and pick a country from the list." }, { status: 400 });
  const lines = String(b.ingredients ?? "").split("\n").map((l) => parseIngredientLine(l)).filter((x) => x !== null);
  const steps = String(b.steps ?? "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 25);
  const { data: m } = await db.from("household_members").select("household_id").eq("user_id", user.id).limit(1).maybeSingle();
  const minutes = Math.min(600, Math.max(5, Number(b.minutes) || 45));
  try {
    const res = await ingestRecipeSubmission(db, {
      sourceChannel: "family_share",
      originType: "user",
      householdId: (m?.household_id as string) ?? null,
      userId: user.id,
      licenseVerified: true,
      licenseNotes: "Shared by the cook as their own family recipe.",
      raw: {
        title,
        cuisine_tags: [country],
        meals: (b.meals ?? ["d"]).filter((x) => ["b", "l", "d"].includes(x)),
        prep_minutes: Math.min(60, minutes),
        cook_minutes: Math.max(0, minutes - 60),
        credit: String(b.credit ?? "").slice(0, 120) || undefined,
        ingredients: lines.map((l) => ({ name: String(l.name), quantity: Number(l.qty) || 1, unit: (l.unit === "ml" || l.unit === "pc" ? l.unit : "g") as "g" | "ml" | "pc" })),
        steps,
      },
    });
    return NextResponse.json({ id: res.id, status: res.status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't submit." }, { status: 500 });
  }
}
