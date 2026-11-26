import { NextResponse } from "next/server";
import { generateStructured, untrusted } from "@/lib/ai/gateway";
import { normalizeRecipe } from "@/lib/ai/normalize";
import { SYSTEM, parsePrompt } from "@/lib/ai/prompts";
import { SingleRecipeOut } from "@/lib/ai/schemas";
import { fetchPublicPage, recipeTextFromHtml } from "@/lib/server/fetchPage";
import { fail, guard } from "../../ai/_util";

export const maxDuration = 60;

/**
 * Saves a recipe from a link into the household's OWN library (private, never
 * shared). Reads the page's schema.org Recipe data; no blog text is stored
 * beyond what the household keeps for itself.
 */
export async function POST(req: Request) {
  const g = await guard(req);
  if ("res" in g) return g.res;
  try {
    const body = (await req.json()) as { url?: string };
    const raw = String(body.url ?? "").trim();
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      return NextResponse.json({ error: "Paste a full link, starting with https://" }, { status: 400 });
    }
    if (/(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname)) {
      return NextResponse.json({ error: "LUKA can't read videos. Open the video, copy its description (where the recipe usually is) and use “Paste from anywhere”." }, { status: 422 });
    }
    const page = await fetchPublicPage(u.toString());
    const found = recipeTextFromHtml(page.html);
    if (!found) return NextResponse.json({ error: "Couldn't find a recipe on that page. Copy the recipe text and use “Paste from anywhere”." }, { status: 422 });
    const out = await generateStructured({ schema: SingleRecipeOut, system: SYSTEM, prompt: parsePrompt(untrusted(page.url, found.text.slice(0, 20000))), effort: "low" });
    const n = normalizeRecipe(out.recipe, { type: "user", credit: new URL(page.url).hostname.replace(/^www\./, ""), url: page.url });
    if (!n) return NextResponse.json({ error: "Couldn't turn that page into a recipe." }, { status: 422 });
    return NextResponse.json({ recipes: [n.recipe], ingredients: n.ingredients });
  } catch (e) {
    if (e instanceof Error && !("status" in e) && /link|page|redirect|web/i.test(e.message)) return NextResponse.json({ error: e.message }, { status: 422 });
    return fail(e);
  }
}
