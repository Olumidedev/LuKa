import { ALLERGEN_LABELS, DIET_SWAPS } from "../data/ingredients";
import type { Allergen, Ingredient, Kind, Member, Recipe } from "../types";

/**
 * Deterministic safety & diet gate (BRD v3.2 FR-7).
 *
 * No model is consulted here. A recipe either passes for the whole household
 * or it is excluded. Allergies and religious rules exclude outright; personal
 * diets (vegetarian, vegan, pescatarian) are handled with per-member portion
 * swaps when every offending ingredient has a safe swap, and excluded
 * otherwise.
 */

export const PORTION: Record<Member["age"], number> = { adult: 1, teen: 1.1, child: 0.6, toddler: 0.35 };

export function householdPortions(members: Member[]): number {
  const total = members.reduce((s, m) => s + PORTION[m.age], 0);
  return total > 0 ? total : 1;
}

const MEAT: Kind[] = ["poultry", "beef", "pork", "lamb", "goat"];
const DIET_FORBIDS: Record<Exclude<Member["diet"], "">, Kind[]> = {
  pescatarian: MEAT,
  vegetarian: [...MEAT, "fish", "shellfish"],
  vegan: [...MEAT, "fish", "shellfish", "egg", "dairy", "honey"],
};

export interface Swap {
  from: string;
  to: string | null;
  ratio: number;
}

export interface MemberAdjust {
  memberId: string;
  name: string;
  swaps: Swap[];
}

export interface GateResult {
  ok: boolean;
  /** Why it was excluded (empty when ok). */
  reasons: string[];
  /** Per-member portion swaps (diets). */
  adjusts: MemberAdjust[];
  /** Cook-facing notes: spice set-asides, pregnancy doneness, pasteurization. */
  notes: string[];
  /** Number of disliked-ingredient hits, for soft scoring. */
  dislikeHits: number;
}

function names(ms: Member[]): string {
  const n = ms.map((m) => m.name || "someone");
  return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

export function forbiddenKindsForRules(members: Member[]): { kinds: Set<Kind>; meatDairy: boolean } {
  const kinds = new Set<Kind>();
  let meatDairy = false;
  for (const m of members) {
    for (const rule of m.rules) {
      if (rule === "halal") {
        kinds.add("pork");
        kinds.add("alcohol");
      }
      if (rule === "kosher") {
        kinds.add("pork");
        kinds.add("shellfish");
        meatDairy = true;
      }
      if (rule === "nopork") kinds.add("pork");
      if (rule === "nobeef") kinds.add("beef");
    }
  }
  return { kinds, meatDairy };
}

export function gateRecipe(recipe: Recipe, members: Member[], ings: Record<string, Ingredient>): GateResult {
  const reasons: string[] = [];
  const notes: string[] = [];
  const adjusts: MemberAdjust[] = [];
  let dislikeHits = 0;

  const items = recipe.ingredients.map((ri) => ({ ri, ing: ings[ri.key] }));
  const missing = items.filter((x) => !x.ing);
  if (missing.length) {
    return { ok: false, reasons: [`Unknown ingredient: ${missing.map((m) => m.ri.key).join(", ")}`], adjusts, notes, dislikeHits };
  }

  // 1. Allergies — household-wide hard exclusion.
  const allergic = new Map<Allergen, Member[]>();
  for (const m of members) for (const a of m.allergies) allergic.set(a, [...(allergic.get(a) ?? []), m]);
  for (const { ing } of items) {
    for (const a of ing.allergens) {
      const who = allergic.get(a);
      if (who) reasons.push(`Contains ${ALLERGEN_LABELS[a].toLowerCase()} (${ing.name}) — ${names(who)}`);
    }
  }

  // 2. Religious / household rules — hard exclusion.
  const { kinds, meatDairy } = forbiddenKindsForRules(members);
  for (const { ing } of items) {
    if (ing.kind && kinds.has(ing.kind)) reasons.push(`${ing.name} isn't allowed by your household's rules`);
  }
  if (meatDairy) {
    const hasMeat = items.some(({ ing }) => ing.kind && MEAT.includes(ing.kind));
    const hasDairy = items.some(({ ing }) => ing.kind === "dairy");
    if (hasMeat && hasDairy) reasons.push("Mixes meat and dairy (kosher)");
  }

  const householdAllergens = new Set(allergic.keys());

  // 3. Personal diets — swap the member's portion, or exclude.
  for (const m of members) {
    if (!m.diet) continue;
    const forbids = DIET_FORBIDS[m.diet];
    const swaps: Swap[] = [];
    for (const { ri, ing } of items) {
      if (!ing.kind || !forbids.includes(ing.kind)) continue;
      const sw = DIET_SWAPS[ri.key];
      if (!sw) {
        reasons.push(`${ing.name} has no ${m.diet} swap for ${m.name || "a member"}`);
        continue;
      }
      const [to, ratio] = sw;
      if (to) {
        const target = ings[to];
        const unsafe = !target || target.allergens.some((a) => householdAllergens.has(a)) || (target.kind && forbids.includes(target.kind));
        if (unsafe) {
          reasons.push(`No safe ${m.diet} swap for ${ing.name}`);
          continue;
        }
      }
      swaps.push({ from: ri.key, to, ratio });
    }
    if (swaps.length) adjusts.push({ memberId: m.id, name: m.name, swaps });
  }

  // 4. Notes (never block).
  const chilis = items.filter(({ ing }) => ing.chili).map(({ ing }) => ing.name.toLowerCase());
  const mild = members.filter((m) => m.spice === "mild");
  if (recipe.spice >= 2 && mild.length && chilis.length) {
    notes.push(`Set aside a portion for ${names(mild)} before adding the ${[...new Set(chilis)].join(" and ")}.`);
  }
  const pregnant = members.filter((m) => m.stage === "pregnant");
  if (pregnant.length) {
    const keys = new Set(recipe.ingredients.map((i) => i.key));
    if (keys.has("eggs")) notes.push(`Cook ${names(pregnant)}'s eggs until the yolks are firm.`);
    if (keys.has("sirloin")) notes.push(`Cook ${names(pregnant)}'s beef to 71 °C / 160 °F.`);
    if (keys.has("cheese")) notes.push("Check the cheese is made from pasteurized milk.");
  }
  for (const m of members) {
    const words = m.dislikes
      .split(",")
      .map((w) => w.trim().toLowerCase())
      .filter((w) => w.length > 2);
    for (const w of words) {
      const hit = items.find(({ ing }) => ing.name.toLowerCase().includes(w));
      if (hit) {
        dislikeHits++;
        notes.push(`${m.name || "Someone"} isn't keen on ${w} — serve it on the side.`);
      }
    }
  }
  for (const a of adjusts) {
    const parts = a.swaps.map((s) => (s.to ? `${ings[s.to].name.toLowerCase()} instead of ${ings[s.from].name.toLowerCase()}` : `leave out the ${ings[s.from].name.toLowerCase()}`));
    notes.unshift(`${a.name || "A member"}'s portion: ${parts.join("; ")}.`);
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], adjusts, notes, dislikeHits };
}
