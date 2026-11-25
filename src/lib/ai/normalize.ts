import { INGREDIENTS } from "../data/ingredients";
import type { Aisle, Allergen, Ingredient, Kind, MealType, Recipe, Unit } from "../types";

/**
 * Turns untrusted model output into catalogue-shaped data. Nothing from the
 * model is trusted for safety: allergens and kinds are re-derived from
 * ingredient names with keyword rules and unioned with whatever the model
 * declared, so the deterministic gate always has a conservative view.
 */

const ALLERGEN_WORDS: [Allergen, RegExp][] = [
  ["gluten", /\b(wheat|flour|bread|pasta|noodle|couscous|semolina|barley|rye|bulgur|farro|seitan|soy sauce|roti|chapati|naan|pita|injera|dumpling|biscuit|cracker|panko|breadcrumb)/i],
  ["dairy", /\b(milk|butter|cheese|cream|yog(h)?urt|ghee|paneer|labneh|kefir|whey|custard)\b/i],
  ["egg", /\beggs?\b|\bmayonnaise\b/i],
  ["peanut", /\b(peanut|groundnut|suya spice|yaji)/i],
  ["treenut", /\b(almond|cashew|walnut|pecan|pistachio|hazelnut|macadamia|brazil nut|pine nut)/i],
  ["fish", /\b(fish|salmon|cod|tuna|mackerel|sardine|anchov|tilapia|catfish|stockfish|saltfish|herring|trout|snapper|bonito|dashi)/i],
  ["shellfish", /\b(shrimp|prawn|crayfish|crab|lobster|scallop|mussel|clam|oyster|krill|shrimp paste|belacan|periwinkle)/i],
  ["soy", /\b(soy|soya|tofu|tempeh|miso|edamame|kecap)/i],
  ["sesame", /\b(sesame|tahini|za'?atar|benne)/i],
  ["mustard", /\bmustard\b/i],
];

const KIND_WORDS: [Kind, RegExp][] = [
  ["pork", /\b(pork|bacon|ham|lard|chorizo|pancetta|prosciutto|gammon)/i],
  ["beef", /\b(beef|steak|oxtail|cow ?foot|tripe|shaki|brisket|veal)/i],
  ["lamb", /\b(lamb|mutton)/i],
  ["goat", /\bgoat\b/i],
  ["poultry", /\b(chicken|turkey|duck|guinea fowl|quail|hen)\b/i],
  ["shellfish", ALLERGEN_WORDS[6][1]],
  ["fish", ALLERGEN_WORDS[5][1]],
  ["egg", /\beggs?\b/i],
  ["dairy", ALLERGEN_WORDS[1][1]],
  ["honey", /\bhoney\b/i],
  ["alcohol", /\b(wine|beer|rum|brandy|sherry|mirin|sake|vodka|whisk(e)?y|stout)\b/i],
];

export function allergensFromName(name: string): Allergen[] {
  // Rice noodles are the one common "noodle" without wheat; everything else is flagged conservatively.
  const n = name.replace(/rice (noodles?|vermicelli)/i, "rice");
  return ALLERGEN_WORDS.filter(([, re]) => re.test(n)).map(([a]) => a);
}

export function kindFromName(name: string): Kind | undefined {
  return KIND_WORDS.find(([, re]) => re.test(name))?.[0];
}

const AISLES: Aisle[] = ["produce", "protein", "dairy", "bakery", "grains", "canned", "condiments", "spices", "oils"];
const PRICE_PER_100: Record<Aisle, number> = { produce: 0.6, protein: 1.8, dairy: 0.9, bakery: 0.6, grains: 0.5, canned: 0.5, condiments: 1, spices: 6, oils: 1 };
const SHELF: Record<Aisle, number> = { produce: 6, protein: 3, dairy: 10, bakery: 5, grains: 180, canned: 365, condiments: 180, spices: 365, oils: 365 };

export interface RawIngredient {
  id?: unknown;
  name?: unknown;
  qty?: unknown;
  unit?: unknown;
  aisle?: unknown;
  allergens?: unknown;
}
export interface RawRecipe {
  name?: unknown;
  countries?: unknown;
  meals?: unknown;
  activeMin?: unknown;
  totalMin?: unknown;
  spice?: unknown;
  batch?: unknown;
  ingredients?: unknown;
  steps?: unknown;
  credit?: unknown;
  url?: unknown;
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max) : "");
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);

/**
 * Map a free-text ingredient to the catalogue. A match is rejected if the name
 * suggests an allergen or kind the catalogue item doesn't carry (e.g. "peanut
 * butter" must never resolve to plain butter), so safety data is never lost.
 */
export function matchCatalogue(id: string, name: string): string | null {
  const n = name.toLowerCase();
  const all = Object.values(INGREDIENTS);
  const hit =
    INGREDIENTS[id] ??
    all.find((i) => i.name.toLowerCase() === n) ??
    all.find((i) => new RegExp(`\\b${i.key.replace(/s$/, "")}s?\\b`).test(n));
  if (!hit) return null;
  const named = allergensFromName(name);
  if (named.some((a) => !hit.allergens.includes(a))) return null;
  const k = kindFromName(name);
  if (k && k !== hit.kind) return null;
  return hit.key;
}

const UNIT_TO: Record<string, [Unit, number]> = {
  g: ["g", 1], gram: ["g", 1], grams: ["g", 1], kg: ["g", 1000], oz: ["g", 28.35], lb: ["g", 453.6], lbs: ["g", 453.6],
  ml: ["ml", 1], l: ["ml", 1000], litre: ["ml", 1000], liter: ["ml", 1000],
  cup: ["ml", 240], cups: ["ml", 240], tbsp: ["ml", 15], tablespoon: ["ml", 15], tablespoons: ["ml", 15], tsp: ["ml", 5], teaspoon: ["ml", 5], teaspoons: ["ml", 5],
};

/** "500 g yam", "2 cups rice", "3 eggs", "1/2 tsp cumin" → a raw ingredient. Deterministic, no model. */
export function parseIngredientLine(line: string): RawIngredient | null {
  if (/^\s*$|to taste|^\s*[-*•]?\s*(salt|water|pepper|salt and pepper|black pepper)\s*$/i.test(line)) return null;
  const m = line.trim().replace(/^[-*•]\s*/, "").match(/^(\d+\s+\d\/\d|\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?)\s*([a-zA-Z]+)?\.?\s+(?:of\s+)?(.+)$/);
  if (!m) return line.trim() ? { name: line.trim(), qty: 1, unit: "pc" } : null;
  const q = m[1].includes("/")
    ? m[1].split(/\s+/).reduce((s, part) => s + (part.includes("/") ? Number(part.split("/")[0]) / Number(part.split("/")[1]) : Number(part)), 0)
    : Number(m[1].replace(",", "."));
  const u = m[2]?.toLowerCase();
  const conv = u ? UNIT_TO[u] : undefined;
  const name = conv ? m[3] : `${u && !conv ? `${m[2]} ` : ""}${m[3]}`;
  if (conv) return { name, qty: q * conv[1], unit: conv[0] };
  // A bare count: whole items, or countable produce sold by weight.
  const key = matchCatalogue("", name);
  const ing = key ? INGREDIENTS[key] : undefined;
  if (ing && ing.unit !== "pc" && ing.countable) return { name, qty: q * ing.pack, unit: ing.unit };
  return { name, qty: q, unit: "pc" };
}

export function normalizeRecipe(raw: RawRecipe, source: Recipe["source"]): { recipe: Recipe; ingredients: Record<string, Ingredient> } | null {
  const name = str(raw.name, 120);
  const rawIngs = Array.isArray(raw.ingredients) ? (raw.ingredients as RawIngredient[]).slice(0, 40) : [];
  const steps = Array.isArray(raw.steps) ? (raw.steps as unknown[]).map((s) => str(s, 600)).filter(Boolean).slice(0, 20) : [];
  if (!name || !rawIngs.length || !steps.length) return null;

  const custom: Record<string, Ingredient> = {};
  const idMap = new Map<string, string>();
  const ingredients: Recipe["ingredients"] = [];
  for (const ri of rawIngs) {
    const iname = str(ri.name, 80);
    if (!iname) continue;
    const rid = slug(str(ri.id, 40) || iname);
    const qty = num(ri.qty, 0.5, 5000, 100);
    const cat = matchCatalogue(rid, iname);
    let key: string;
    let qtyIn = qty;
    if (cat) {
      key = cat;
      // Bring the amount into the catalogue's unit (1 ml ≈ 1 g is close enough for a shopping list).
      const cu = INGREDIENTS[cat].unit;
      if (ri.unit === "pc" && cu !== "pc") qtyIn = qty * INGREDIENTS[cat].pack;
      else if (ri.unit !== "pc" && cu === "pc") qtyIn = Math.max(1, Math.round(qty / 50));
    }
    else {
      key = `x_${rid}`;
      const unit: Unit = ri.unit === "ml" || ri.unit === "pc" ? ri.unit : "g";
      const aisle: Aisle = AISLES.includes(ri.aisle as Aisle) ? (ri.aisle as Aisle) : "produce";
      const declared = Array.isArray(ri.allergens) ? (ri.allergens as unknown[]).filter((a): a is Allergen => typeof a === "string" && ALLERGEN_WORDS.some(([x]) => x === a)) : [];
      const pack = unit === "pc" ? Math.max(1, Math.ceil(qty)) : Math.max(50, Math.ceil(qty / 50) * 50);
      custom[key] = {
        key,
        name: iname[0].toUpperCase() + iname.slice(1),
        unit,
        aisle,
        pack,
        packLabel: unit === "pc" ? "each" : `${pack} ${unit}`,
        price: Math.round((unit === "pc" ? pack * 0.8 : (pack / 100) * PRICE_PER_100[aisle]) * 100) / 100,
        shelf: SHELF[aisle],
        allergens: [...new Set([...declared, ...allergensFromName(iname)])],
        kind: kindFromName(iname),
        nutrition: { kcal: 0, protein: 0, fiber: 0, iron: 0, folate: 0, calcium: 0, omega3: 0 },
        custom: true,
      };
    }
    idMap.set(rid, key);
    const existing = ingredients.find((x) => x.key === key);
    if (existing) existing.qty += qtyIn;
    else ingredients.push({ key, qty: qtyIn });
  }
  if (!ingredients.length) return null;

  // Re-point {placeholders} from the model's ids to our keys; drop anything unknown.
  const fixedSteps = steps.map((s) =>
    s.replace(/\{([a-zA-Z0-9_]+)(\*[0-9.]+)?\}/g, (_m, id: string, f = "") => {
      const k = idMap.get(slug(id));
      return k ? `{${k}${f}}` : id.replace(/_/g, " ");
    }),
  );

  const meals = (Array.isArray(raw.meals) ? raw.meals : ["d"]).filter((m): m is MealType => m === "b" || m === "l" || m === "d");
  const countries = (Array.isArray(raw.countries) ? raw.countries : []).map((c) => str(c, 60)).filter(Boolean).slice(0, 3);

  const recipe: Recipe = {
    id: `${source.type}_${slug(name)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    countries: countries.length ? countries : ["Your kitchen"],
    meals: meals.length ? meals : ["d"],
    activeMin: num(raw.activeMin, 1, 240, 30),
    totalMin: num(raw.totalMin, 1, 1440, 45),
    spice: num(raw.spice, 0, 3, 1) as Recipe["spice"],
    batch: raw.batch === true,
    ingredients,
    steps: fixedSteps,
    source: {
      ...source,
      credit: str(raw.credit, 120) || source.credit,
      url: (() => {
        const u = str(raw.url, 500) || source.url;
        return u && /^https:\/\//.test(u) ? u : undefined;
      })(),
    },
  };
  return { recipe, ingredients: custom };
}
