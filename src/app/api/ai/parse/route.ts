import { NextResponse } from "next/server";
import { generateJSON, untrusted } from "@/lib/ai/gateway";
import { normalizeRecipe, type RawRecipe } from "@/lib/ai/normalize";
import { parsePrompt } from "@/lib/ai/prompts";
import { fail, guard } from "../_util";

const MAX_CHARS = 20_000;

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  try {
    const body = (await req.json()) as { text?: string; credit?: string; url?: string };
    const text = String(body.text ?? "").slice(0, MAX_CHARS);
    if (text.trim().length < 40) return NextResponse.json({ error: "Paste the whole recipe: ingredients and method." }, { status: 400 });
    const out = (await generateJSON(parsePrompt(untrusted("pasted-recipe", text)))) as { recipe?: RawRecipe };
    const n = out.recipe && normalizeRecipe(out.recipe, { type: "user", credit: body.credit?.slice(0, 120), url: body.url });
    if (!n) return NextResponse.json({ error: "Couldn't find a recipe in that text." }, { status: 422 });
    return NextResponse.json({ recipes: [n.recipe], ingredients: n.ingredients });
  } catch (e) {
    return fail(e);
  }
}
