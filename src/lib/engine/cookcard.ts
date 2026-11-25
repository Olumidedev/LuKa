import { SAFE_TEMPS } from "../data/ingredients";
import type { Recipe } from "../types";
import type { EngineContext } from "./context";
import { formatAmountWithName, recipeNeeds, roundQty } from "./quantities";

/**
 * A recipe prepared for a specific household and portion count: scaled
 * ingredients, steps split into plain/bold/timer parts, member notes and the
 * deterministic safety checks. Plain data only, so it can be shared in a
 * handoff link and rendered without trusting any HTML.
 */
export type StepPart = { t: "text"; v: string } | { t: "qty"; v: string } | { t: "timer"; min: number };

export interface CookCard {
  title: string;
  /** "For 3 people", "For 3 people + tomorrow's lunch". */
  serves: string;
  countries: string[];
  portions: number;
  activeMin: number;
  totalMin: number;
  ingredients: string[];
  steps: StepPart[][];
  notes: string[];
  safety: string[];
  source?: string;
}

export function parseStep(step: string, amount: (key: string, factor: number) => string | null): StepPart[] {
  const parts: StepPart[] = [];
  const re = /\{([a-z0-9_]+)(?:\*([0-9.]+))?\}|\[t(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(step))) {
    if (m.index > last) parts.push({ t: "text", v: step.slice(last, m.index) });
    if (m[3]) parts.push({ t: "timer", min: Number(m[3]) });
    else {
      const txt = amount(m[1], m[2] ? Number(m[2]) : 1);
      parts.push(txt ? { t: "qty", v: txt } : { t: "text", v: m[1].replace(/_/g, " ") });
    }
    last = re.lastIndex;
  }
  if (last < step.length) parts.push({ t: "text", v: step.slice(last) });
  return parts;
}

export function stepText(parts: StepPart[]): string {
  return parts
    .map((p) => (p.t === "timer" ? `(${p.min} minute timer)` : p.v))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCookCard(ctx: EngineContext, recipe: Recipe, portions: number, doubled = false): CookCard {
  const gate = ctx.gates.get(recipe.id);
  const needs = gate ? recipeNeeds(recipe, ctx.state.members, gate, portions) : [];
  const needMap = new Map(needs.map((n) => [n.key, n.qty]));
  const amount = (key: string, factor: number) => {
    const ing = ctx.ings[key];
    const q = needMap.get(key);
    // Steps use the same post-swap amounts as the ingredient list; a fully swapped item reads as its name.
    if (!ing || q == null) return ing ? ing.name.toLowerCase() : null;
    return formatAmountWithName(q * factor, ing);
  };
  const people = ctx.state.members.length;
  const ingredients = needs
    .filter((n) => roundQty(n.qty, ctx.ings[n.key].unit) > 0)
    .map((n) => formatAmountWithName(n.qty, ctx.ings[n.key]));
  const safety = [...new Set(recipe.ingredients.map((ri) => SAFE_TEMPS[ri.key]).filter(Boolean) as string[])];
  if (recipe.batch) safety.push("Leftovers: cool within 2 hours, refrigerate, and reheat to 74 °C / 165 °F.");
  return {
    title: recipe.name,
    serves: `For ${people} ${people === 1 ? "person" : "people"}${doubled ? " + tomorrow's lunch" : ""}`,
    countries: recipe.countries,
    portions,
    activeMin: recipe.activeMin,
    totalMin: recipe.totalMin,
    ingredients,
    steps: recipe.steps.map((s) => parseStep(s, amount)),
    notes: gate?.notes ?? [],
    safety,
    source: recipe.source.credit ?? (recipe.source.type === "ai" ? "Written with AI, checked by Luka's allergen gate" : undefined),
  };
}
