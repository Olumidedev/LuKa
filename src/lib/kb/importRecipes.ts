import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateBatchStructured } from "../ai/batch";
import { untrusted } from "../ai/gateway";
import { SYSTEM } from "../ai/prompts";
import { SingleRecipeOut } from "../ai/schemas";
import { withRun } from "../connectors/runs";
import { IMPORT_UA, mealDbFacts, parseWikibooks, publicDomainLikely, type Archive, type MealDbMeal, type SourceFacts } from "../connectors/recipeSources";
import { ALL_COUNTRIES } from "../data/countries";
import { ingestRecipeSubmission, toPositionalSteps, type SourceChannel } from "./intake";

type Mode = "facts_only" | "adapt_open" | "modernize_pd";

interface Adapt {
  mode: Mode;
  facts: SourceFacts;
  country: string;
  channel: SourceChannel;
  license: string | null;
  attribution: string;
  licenseVerified: boolean;
  licenseNotes: string;
}

const INSTRUCTIONS: Record<Mode, string> = {
  facts_only:
    "You have only FACTS about a dish: its name, country and ingredient list. Write the method yourself, in your own words, the way a home cook from that country would make it. Do not reproduce any publisher's wording.",
  adapt_open:
    "Adapt this openly licensed recipe (CC BY-SA). Keep the dish, its ingredients and the substance of its steps. Give every ingredient a quantity for 4 portions where the source has none, and tidy the wording.",
  modernize_pd:
    "This is a historic, public-domain recipe. Modernise it for today's kitchen: metric quantities for 4 portions, modern equipment, safe cooking temperatures, and plain wording. Keep the dish's character and name.",
};

async function vocabulary(db: SupabaseClient) {
  const { data } = await db.from("ingredients").select("app_key, canonical_name").order("app_key").limit(1000);
  return data ?? [];
}

async function alreadyImported(db: SupabaseClient, url: string): Promise<boolean> {
  const [{ count: a }, { count: b }] = await Promise.all([
    db.from("recipe_submissions").select("id", { count: "exact", head: true }).eq("normalized_recipe->>source_url", url),
    db.from("recipes").select("id", { count: "exact", head: true }).eq("source_url", url),
  ]);
  return (a ?? 0) + (b ?? 0) > 0;
}

/** Claude standardises one source recipe; the result waits in the review queue. */
export async function adaptAndSubmit(db: SupabaseClient, a: Adapt, vocab?: { app_key: string; canonical_name: string }[]) {
  const kb = vocab ?? (await vocabulary(db));
  const source = [
    `Dish: ${a.facts.title}`,
    `Country: ${a.country}`,
    a.facts.summary ? `About: ${a.facts.summary}` : "",
    `Ingredients:\n${a.facts.ingredients.map((i) => `- ${i}`).join("\n")}`,
    a.facts.steps.length ? `Method:\n${a.facts.steps.map((s, n) => `${n + 1}. ${s}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const out = await generateBatchStructured({
    schema: SingleRecipeOut,
    system: SYSTEM,
    prompt: `${INSTRUCTIONS[a.mode]}
Use LUKA's canonical ingredients wherever they fit, with exactly these ids: ${kb.map((i) => `${i.app_key}=${i.canonical_name}`).join("; ")}. Only add a new ingredient when the dish truly needs it.
Set countries to ["${a.country}"] and credit to "".

${untrusted(a.facts.sourceUrl, source.slice(0, 12000))}`,
  });
  const r = out.recipe;
  const names = new Map(kb.map((k) => [k.app_key, k.canonical_name]));
  return ingestRecipeSubmission(db, {
    sourceChannel: a.channel,
    originType: "claude",
    licenseVerified: a.licenseVerified,
    licenseNotes: a.licenseNotes,
    rawPayload: { facts: a.facts, mode: a.mode },
    raw: {
      title: a.facts.title,
      summary: a.facts.summary,
      cuisine_tags: [a.country],
      meals: r.meals,
      prep_minutes: r.activeMin,
      cook_minutes: Math.max(0, r.totalMin - r.activeMin),
      spice: r.spice,
      batch: r.batch,
      credit: a.attribution,
      attribution: a.attribution,
      license: a.license ?? undefined,
      source_url: a.facts.sourceUrl,
      origin_ref: a.facts.originRef,
      ingredients: r.ingredients.map((i) => ({ name: names.get(i.id) ?? i.name, quantity: i.qty, unit: i.unit, allergens: i.allergens })),
      steps: toPositionalSteps(r.steps, r.ingredients.map((i) => i.id)),
    },
  });
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "user-agent": IMPORT_UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── TheMealDB: facts only ─────────────────────────────── */
export async function importFromMealDb(db: SupabaseClient, opts: { country: string; limit?: number }) {
  if (!ALL_COUNTRIES.includes(opts.country)) throw new Error("Pick a country from LUKA's list.");
  const key = process.env.THEMEALDB_API_KEY || "1"; // "1" is TheMealDB's development key
  return withRun(db, "themealdb", `facts:${opts.country}`, async () => {
    const areas = await getJson<{ meals: { strArea: string; strCountry: string }[] }>(`https://www.themealdb.com/api/json/v1/${key}/list.php?a=list`);
    const area = areas.meals.find((a) => a.strCountry === opts.country)?.strArea;
    if (!area) return { seen: 0, upserted: 0, details: { note: `TheMealDB has no ${opts.country} dishes` } };
    const list = await getJson<{ meals: { idMeal: string }[] | null }>(`https://www.themealdb.com/api/json/v1/${key}/filter.php?a=${encodeURIComponent(area)}`);
    const vocab = await vocabulary(db);
    const filed: string[] = [];
    let seen = 0;
    for (const { idMeal } of list.meals ?? []) {
      if (filed.length >= (opts.limit ?? 4)) break;
      seen++;
      const facts = mealDbFacts((await getJson<{ meals: MealDbMeal[] }>(`https://www.themealdb.com/api/json/v1/${key}/lookup.php?i=${idMeal}`)).meals[0]);
      if (await alreadyImported(db, facts.sourceUrl)) continue;
      const res = await adaptAndSubmit(
        db,
        {
          mode: "facts_only",
          facts,
          country: opts.country,
          channel: "reference_import",
          license: null,
          attribution: "LUKA kitchen (dish listed on TheMealDB)",
          licenseVerified: false,
          licenseNotes: "Facts only (name, country, ingredients). Method written by LUKA: check it doesn't echo the original source before approving.",
        },
        vocab,
      );
      filed.push(res.id);
    }
    return { seen, upserted: filed.length, details: { area, filed } };
  });
}

/* ── Wikibooks: CC BY-SA ───────────────────────────────── */
const WB = "https://en.wikibooks.org/w/api.php";

export async function importFromWikibooks(db: SupabaseClient, opts: { category: string; country: string; limit?: number }) {
  if (!ALL_COUNTRIES.includes(opts.country)) throw new Error("Pick a country from LUKA's list.");
  const cat = opts.category.replace(/^Category:/i, "").trim();
  return withRun(db, "wikibooks_cookbook", `category:${cat}`, async () => {
    const members = await getJson<{ query?: { categorymembers: { title: string; ns: number }[] } }>(
      `${WB}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(`Category:${cat}`)}&cmnamespace=102&cmlimit=100&format=json&formatversion=2`,
    );
    const vocab = await vocabulary(db);
    const filed: string[] = [];
    const skipped: string[] = [];
    let seen = 0;
    for (const m of members.query?.categorymembers ?? []) {
      if (filed.length >= (opts.limit ?? 4)) break;
      seen++;
      await pause(1100); // Wikimedia asks automated clients to go gently
      const page = await getJson<{ parse?: { wikitext: string; revid: number } }>(
        `${WB}?action=parse&page=${encodeURIComponent(m.title)}&prop=wikitext|revid&format=json&formatversion=2&maxlag=5`,
      );
      if (!page.parse) continue;
      const facts = parseWikibooks(m.title, page.parse.wikitext, page.parse.revid);
      if (facts.ingredients.length < 2 || facts.steps.length < 2) {
        skipped.push(m.title);
        continue;
      }
      if (await alreadyImported(db, facts.sourceUrl)) continue;
      const res = await adaptAndSubmit(
        db,
        {
          mode: "adapt_open",
          facts,
          country: opts.country,
          channel: "permitted_open_source",
          license: "CC BY-SA 4.0",
          attribution: `Adapted by LUKA from "${facts.title}", Wikibooks Cookbook contributors`,
          licenseVerified: true,
          licenseNotes: "Wikibooks text is CC BY-SA 4.0: keep the attribution and licence; the adapted recipe stays CC BY-SA.",
        },
        vocab,
      );
      filed.push(res.id);
    }
    return { seen, upserted: filed.length, details: { category: cat, filed, skipped } };
  });
}

/* ── Public-domain cookbooks (pasted) ──────────────────── */
export async function importPublicDomain(
  db: SupabaseClient,
  opts: { title: string; country: string; text: string; book: string; year: number | null; url: string; archive: Archive; confirmed: boolean },
) {
  if (!ALL_COUNTRIES.includes(opts.country)) throw new Error("Pick a country from LUKA's list.");
  if (opts.text.trim().length < 80) throw new Error("Paste the whole recipe from the book.");
  if (!/^https:\/\//.test(opts.url)) throw new Error("Add the link to the book's page.");
  const verified = publicDomainLikely(opts.year) || opts.confirmed;
  const facts: SourceFacts = {
    title: opts.title.trim().slice(0, 140),
    country: opts.country,
    ingredients: [],
    steps: [opts.text.trim().slice(0, 10000)],
    sourceUrl: opts.url,
    originRef: `${opts.archive}:${opts.book}${opts.year ? ` (${opts.year})` : ""}`,
  };
  if (await alreadyImported(db, `${opts.url}#${encodeURIComponent(facts.title)}`)) throw new Error("That recipe is already imported.");
  facts.sourceUrl = `${opts.url}#${encodeURIComponent(facts.title)}`;
  return withRun(db, "public_domain_books", `${opts.archive}:${opts.book}`.slice(0, 120), async () => {
    const res = await adaptAndSubmit(db, {
      mode: "modernize_pd",
      facts,
      country: opts.country,
      channel: "public_domain",
      license: "Public domain source; LUKA adaptation",
      attribution: `Adapted by LUKA from ${opts.book}${opts.year ? ` (${opts.year})` : ""}`,
      licenseVerified: verified,
      licenseNotes: verified
        ? `Public domain: ${publicDomainLikely(opts.year) ? `published ${opts.year}` : "confirmed by the importer"}.`
        : "Publication year unknown or after 1929: confirm it is public domain before approving.",
    });
    return { seen: 1, upserted: 1, details: { id: res.id } };
  });
}
