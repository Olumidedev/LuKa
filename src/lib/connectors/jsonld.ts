/** Parsing helpers for a household's private recipe import (no network). */

export function privateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return privateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}


type Json = Record<string, unknown>;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

/** Finds a schema.org Recipe in a page's JSON-LD and returns it as plain text. */
export function recipeTextFromHtml(html: string): { title: string; text: string } | null {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const isRecipe = (o: Json) => asArray(o["@type"]).some((t) => String(t).toLowerCase() === "recipe");
  const find = (v: unknown): Json | null => {
    for (const o of asArray(v)) {
      if (!o || typeof o !== "object") continue;
      const j = o as Json;
      if (isRecipe(j)) return j;
      const inner = find(j["@graph"]);
      if (inner) return inner;
    }
    return null;
  };
  for (const b of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(b.trim());
    } catch {
      continue;
    }
    const r = find(parsed);
    if (!r) continue;
    const steps = asArray(r.recipeInstructions).flatMap((s) => {
      if (typeof s === "string") return [s];
      const o = s as Json;
      if (asArray(o["@type"]).includes("HowToSection")) return asArray(o.itemListElement).map((x) => String((x as Json).text ?? x));
      return [String(o.text ?? o.name ?? "")];
    });
    const clean = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
    const title = clean(String(r.name ?? ""));
    const text = [
      title,
      r.recipeYield ? `Serves: ${clean(String(asArray(r.recipeYield)[0]))}` : "",
      r.totalTime ? `Total time: ${String(r.totalTime)}` : "",
      "Ingredients:",
      ...asArray(r.recipeIngredient).map((i) => `- ${clean(String(i))}`),
      "Method:",
      ...steps.map((s, n) => `${n + 1}. ${clean(s)}`).filter((s) => s.length > 3),
    ]
      .filter(Boolean)
      .join("\n");
    return { title, text };
  }
  return null;
}
