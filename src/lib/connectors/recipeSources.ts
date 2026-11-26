/**
 * Licensed recipe sources (Tier 1 and 2). Parsing only; no network policy here.
 *
 * - TheMealDB: used for FACTS only (dish name, country, ingredient list). Its
 *   method text is often copied from publishers (e.g. BBC Good Food), so LUKA
 *   never stores it; Claude writes a fresh method that a reviewer checks.
 * - Wikibooks Cookbook: CC BY-SA 4.0. Adapted recipes keep that licence and
 *   credit "Wikibooks contributors" with a link to the exact revision.
 * - Public-domain cookbooks: pasted by an admin from Project Gutenberg, the
 *   Internet Archive or Feeding America, then modernised.
 */

export const IMPORT_UA = "LUKA-recipe-importer/0.3 (https://luka-delta.vercel.app/about)";

export interface SourceFacts {
  title: string;
  country: string | null;
  /** Free-text ingredient lines, as the source lists them. */
  ingredients: string[];
  /** Steps when the licence allows adapting them; empty for facts-only sources. */
  steps: string[];
  summary?: string;
  sourceUrl: string;
  originRef: string;
}

/* ── TheMealDB ───────────────────────────────────────── */
export interface MealDbMeal {
  idMeal: string;
  strMeal: string;
  strArea?: string | null;
  strCountry?: string | null;
  strSource?: string | null;
  [k: string]: string | null | undefined;
}

export function mealDbFacts(m: MealDbMeal): SourceFacts {
  const ingredients: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (m[`strIngredient${i}`] ?? "").trim();
    if (!name) continue;
    const measure = (m[`strMeasure${i}`] ?? "").replace(/\s+/g, " ").trim();
    ingredients.push(measure ? `${measure} ${name}` : name);
  }
  return {
    title: m.strMeal.trim(),
    country: m.strCountry?.trim() || null,
    ingredients,
    steps: [], // deliberately not copied
    sourceUrl: `https://www.themealdb.com/meal/${m.idMeal}`,
    originRef: `themealdb:${m.idMeal}${m.strSource ? ` (method source: ${m.strSource})` : ""}`,
  };
}

/* ── Wikibooks ───────────────────────────────────────── */
export function cleanWikitext(s: string): string {
  return s
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[\[(?:File|Image):[^\]]*(?:\[\[[^\]]*\]\][^\]]*)*\]\]/gi, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const INGREDIENT_H = /^ingredients?$/i;
const METHOD_H = /^(procedure|preparation|method|directions|instructions|steps)$/i;

export function parseWikibooks(pageTitle: string, wikitext: string, revid: number): SourceFacts & { categories: string[] } {
  const lines = wikitext.split("\n");
  let section = "";
  const ingredients: string[] = [];
  const steps: string[] = [];
  const intro: string[] = [];
  for (const raw of lines) {
    const h = raw.match(/^(=+)\s*(.*?)\s*\1\s*$/);
    if (h) {
      const name = cleanWikitext(h[2]);
      // Sub-headings (===For the sauce===) stay inside their parent section.
      if (h[1].length === 2) section = INGREDIENT_H.test(name) ? "ing" : METHOD_H.test(name) ? "method" : "other";
      continue;
    }
    if (!section && raw.trim() && !raw.startsWith("{{") && !raw.startsWith("|") && !raw.startsWith("}}") && !raw.startsWith("[[")) intro.push(cleanWikitext(raw));
    if (section === "ing" && /^\*+/.test(raw)) {
      const t = cleanWikitext(raw.replace(/^\*+/, ""));
      if (t) ingredients.push(t);
    }
    if (section === "method" && /^#+/.test(raw)) {
      const t = cleanWikitext(raw.replace(/^#+[*:]?/, ""));
      if (t) steps.push(t);
    }
  }
  const categories = [...wikitext.matchAll(/\[\[Category:([^\]|]+)/g)].map((m) => m[1].trim());
  const title = pageTitle.replace(/^Cookbook:/, "").replace(/_/g, " ").trim();
  return {
    title,
    country: null,
    ingredients,
    steps,
    summary: intro.join(" ").slice(0, 600) || undefined,
    categories,
    sourceUrl: `https://en.wikibooks.org/w/index.php?title=${encodeURIComponent(pageTitle.replace(/ /g, "_"))}&oldid=${revid}`,
    originRef: `wikibooks:${pageTitle}@${revid}`,
  };
}

/* ── Public domain ───────────────────────────────────── */
export type Archive = "gutenberg" | "internet_archive" | "feeding_america" | "other";

/** Works published before 1930 are in the US public domain; anything later needs a human to confirm. */
export function publicDomainLikely(year: number | null | undefined): boolean {
  return !!year && year < 1930;
}
