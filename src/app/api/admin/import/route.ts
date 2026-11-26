import { NextResponse } from "next/server";
import { aiConfigured } from "@/lib/ai/gateway";
import { importFromMealDb, importFromWikibooks, importPublicDomain } from "@/lib/kb/importRecipes";
import { requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Admin → Data → Import: licensed sources only. Everything lands in the review queue. */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const db = supabaseAdmin();
  if (!db || !aiConfigured()) return NextResponse.json({ error: "Needs Supabase and the Claude key." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const limit = Math.max(1, Math.min(6, Number(b.limit) || 3));
  try {
    switch (b.kind) {
      case "themealdb":
        return NextResponse.json(await importFromMealDb(db, { country: String(b.country ?? ""), limit }));
      case "wikibooks":
        return NextResponse.json(await importFromWikibooks(db, { category: String(b.category ?? ""), country: String(b.country ?? ""), limit }));
      case "public_domain":
        return NextResponse.json(
          await importPublicDomain(db, {
            title: String(b.title ?? ""),
            country: String(b.country ?? ""),
            text: String(b.text ?? "").slice(0, 12000),
            book: String(b.book ?? "").slice(0, 200),
            year: Number(b.year) || null,
            url: String(b.url ?? ""),
            archive: (["gutenberg", "internet_archive", "feeding_america"].includes(String(b.archive)) ? b.archive : "other") as "gutenberg",
            confirmed: b.confirmed === true,
          }),
        );
      default:
        return NextResponse.json({ error: "Unknown source." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed." }, { status: 500 });
  }
}
