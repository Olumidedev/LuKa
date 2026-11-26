import { NextResponse } from "next/server";
import { generateStructured, untrusted } from "@/lib/ai/gateway";
import { normalizeRecipe } from "@/lib/ai/normalize";
import { SYSTEM, parsePrompt } from "@/lib/ai/prompts";
import { SingleRecipeOut } from "@/lib/ai/schemas";
import { fail, guard } from "../_util";

export const maxDuration = 60;
const MAX_CHARS = 20_000;

/** Turns pasted recipe text into a household's own recipe (not shared). */
export async function POST(req: Request) {
  const g = await guard(req);
  if ("res" in g) return g.res;
  try {
    const body = (await req.json()) as { text?: string; credit?: string; url?: string };
    const text = String(body.text ?? "").slice(0, MAX_CHARS);
    if (text.trim().length < 40) return NextResponse.json({ error: "Paste the whole recipe: ingredients and method." }, { status: 400 });
    const out = await generateStructured({ schema: SingleRecipeOut, system: SYSTEM, prompt: parsePrompt(untrusted("pasted-recipe", text)), effort: "low" });
    const n = normalizeRecipe(out.recipe, { type: "user", credit: body.credit?.slice(0, 120), url: body.url });
    if (!n) return NextResponse.json({ error: "Couldn't find a recipe in that text." }, { status: 422 });
    return NextResponse.json({ recipes: [n.recipe], ingredients: n.ingredients });
  } catch (e) {
    return fail(e);
  }
}
