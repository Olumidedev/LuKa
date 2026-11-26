import type { MealType, Plan, PlanDay, Recipe, Slot } from "../types";
import type { EngineContext } from "./context";
import { cuisineMatch } from "./cuisine";
import { planDates } from "./dates";
import { badges, householdFocus, perServing } from "./nutrition";
import { recipeNeeds, type Need } from "./quantities";
import { Inventory, isPerishable, weeklyTrip } from "./shopping";

/**
 * Deterministic planner (BRD v3.2: neuro-symbolic split).
 *
 * The model never does arithmetic. Recipes (curated or AI-written) are the
 * creative layer; this greedy, seeded solver chooses and sequences them to:
 *   • stay inside the household's safety gate (hard),
 *   • reuse perishables already opened in the same weekly shop ("buy once"),
 *   • turn batch dinners into next-day lunches ("cook once, eat twice"),
 *   • rotate across the picked cuisines and avoid repeats,
 *   • quietly favour life-stage nutrients and use-soon pantry items.
 */

export const MEALS: MealType[] = ["b", "l", "d"];
const MEAL_ROLES = new Set(["main_one_pot", "protein_main", "soup_stew"]);
export const MEAL_LABEL: Record<MealType, string> = { b: "Breakfast", l: "Lunch", d: "Dinner" };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const emptySlot = (): Slot => ({ recipeId: null });
const emptyDay = (date: string): PlanDay => ({ date, meals: { b: emptySlot(), l: emptySlot(), d: emptySlot() } });

interface Candidate {
  recipe: Recipe;
  match: number;
  pick: string | null;
  needs: Need[];
  badges: string[];
  dislikeHits: number;
}

export function candidatesFor(ctx: EngineContext, meal: MealType): Candidate[] {
  const picks = ctx.state.cuisines;
  const all: Candidate[] = [];
  for (const recipe of ctx.recipes) {
    if (!recipe.meals.includes(meal)) continue;
    // Sides and bases (dodo, rice & peas) complete a plate; they aren't a meal on their own.
    if (recipe.plateRole && !MEAL_ROLES.has(recipe.plateRole)) continue;
    const gate = ctx.gates.get(recipe.id);
    if (!gate?.ok) continue;
    const m = picks.length ? cuisineMatch(recipe, picks) : { score: 1, pick: null, neighbour: false };
    all.push({
      recipe,
      match: m.score,
      pick: m.pick,
      needs: recipeNeeds(recipe, ctx.state.members, gate, ctx.portions),
      badges: badges(perServing(recipe, ctx.ings)),
      dislikeHits: gate.dislikeHits,
    });
  }
  const matched = all.filter((c) => c.match > 0);
  if (matched.length >= 3) return matched;
  // Too few on-cuisine options for this meal: allow the rest of the library, ranked lower.
  return all.map((c) => (c.match > 0 ? c : { ...c, match: -1 }));
}

export function buildPlan(ctx: EngineContext, type: "5day" | "14day", start: string, seed: number, prev?: Plan | null): Plan {
  const rng = mulberry32(seed);
  const { members, settings, pantry } = ctx.state;
  const dates = planDates(type, start);
  const days = dates.map(emptyDay);

  // Keep pinned meals and skipped days from the previous plan.
  if (prev) {
    for (const pd of prev.days) {
      const i = dates.indexOf(pd.date);
      if (i < 0) continue;
      if (pd.skipped) days[i].skipped = true;
      for (const m of MEALS) {
        const s = pd.meals[m];
        if (s.pinned && s.recipeId && s.leftoverOf == null && ctx.gates.get(s.recipeId)?.ok) days[i].meals[m] = { ...s };
      }
    }
  }

  const pools = Object.fromEntries(MEALS.map((m) => [m, candidatesFor(ctx, m)])) as Record<MealType, Candidate[]>;
  const inv = new Inventory(ctx.ings, pantry);
  const lastUsed = new Map<string, number>();
  const timesUsed = new Map<string, number>();
  const pickUses = new Map<string, number>();
  const focus = householdFocus(members);
  const useSoon = new Map(pantry.filter((p) => p.useWithinDays != null).map((p) => [p.key, p.useWithinDays!]));

  const score = (c: Candidate, day: number, meal: MealType) => {
    const trip = weeklyTrip(day);
    let s = c.match * 2 + rng() * 2.5;
    const last = lastUsed.get(c.recipe.id);
    if (last != null && day - last <= 2) s -= 10;
    s -= (meal === "b" ? 1.5 : 4) * (timesUsed.get(c.recipe.id) ?? 0);
    if (c.pick) s -= 0.8 * (pickUses.get(c.pick) ?? 0);
    if (meal === "b" && c.recipe.activeMin > 20) s -= 1.5;
    if (meal === "l" && c.recipe.activeMin > 30) s -= 1;
    for (const n of c.needs) {
      const ing = ctx.ings[n.key];
      if (!ing || ing.aisle === "spices" || ing.aisle === "oils") continue;
      const avail = inv.available(n.key, trip);
      if (avail > 0 && Number.isFinite(avail)) {
        const cover = Math.min(1, avail / n.qty);
        s += (isPerishable(ing) ? 3 : ing.shelf < 60 ? 1 : 0.3) * cover;
      } else if (avail === Number.POSITIVE_INFINITY) {
        s += 0.8; // already at home
      } else if (isPerishable(ing)) {
        const packs = Math.ceil(n.qty / ing.pack - 1e-9);
        const waste = (packs * ing.pack - n.qty) / ing.pack;
        s -= 1.2 * waste;
      }
      const soon = useSoon.get(n.key);
      if (soon != null && day < soon) s += 4;
    }
    for (const b of c.badges) if (focus.has(b as never)) s += 1.2;
    s -= 5 * c.dislikeHits;
    return s;
  };

  days.forEach((day, i) => {
    if (day.skipped) return;
    for (const meal of MEALS) {
      const slot = day.meals[meal];
      if (slot.leftoverOf != null) continue;
      let recipe: Recipe | undefined;
      if (slot.recipeId) recipe = ctx.byId.get(slot.recipeId);
      else {
        let best: Candidate | undefined;
        let bestS = -Infinity;
        for (const c of pools[meal]) {
          const s = score(c, i, meal);
          if (s > bestS) {
            bestS = s;
            best = c;
          }
        }
        recipe = best?.recipe;
        if (recipe) day.meals[meal] = { recipeId: recipe.id };
      }
      if (!recipe) continue;

      const next = days[i + 1];
      const feeds =
        meal === "d" && settings.leftovers && recipe.batch && next && !next.skipped && !next.meals.l.pinned && !next.meals.l.recipeId;
      if (feeds) next.meals.l = { recipeId: recipe.id, leftoverOf: i };

      const gate = ctx.gates.get(recipe.id)!;
      for (const n of recipeNeeds(recipe, members, gate, ctx.portions * (feeds ? 2 : 1))) inv.consume(n.key, n.qty, weeklyTrip(i));
      lastUsed.set(recipe.id, i);
      timesUsed.set(recipe.id, (timesUsed.get(recipe.id) ?? 0) + 1);
      const pick = cuisineMatch(recipe, ctx.state.cuisines).pick;
      if (pick) pickUses.set(pick, (pickUses.get(pick) ?? 0) + 1);
    }
  });

  const plan: Plan = { type, start, days, seed };
  assignCooks(ctx, plan);
  return plan;
}

/** Fair rotation across members who cook; pinned assignments are kept. */
export function assignCooks(ctx: EngineContext, plan: Plan) {
  const { members, settings } = ctx.state;
  const cooks = members.filter((m) => m.cooks);
  const pool = cooks.length ? cooks : members.slice(0, 1);
  if (!pool.length) return;
  let k = 0;
  for (const day of plan.days) {
    for (const m of MEALS) {
      const s = day.meals[m];
      if (!s.recipeId || s.leftoverOf != null) continue;
      if (s.pinned && s.cookId && pool.some((p) => p.id === s.cookId)) continue;
      s.cookId = settings.rotation ? pool[k++ % pool.length].id : pool[0].id;
    }
  }
}

/** "Reshuffle & rescue": skipping a day pushes every later meal back one day. */
export function skipDay(plan: Plan, idx: number): { plan: Plan; dropped: string[] } {
  const days: PlanDay[] = structuredClone(plan.days);
  const last = days[days.length - 1];
  const dropped = MEALS.map((m) => last.meals[m]).filter((s) => s.recipeId && s.leftoverOf == null).map((s) => s.recipeId!);
  for (let j = days.length - 1; j > idx; j--) {
    const src = days[j - 1];
    days[j].skipped = src.skipped && j - 1 !== idx ? true : undefined;
    days[j].meals = structuredClone(src.meals);
    for (const m of MEALS) if (days[j].meals[m].leftoverOf != null) days[j].meals[m].leftoverOf! += 1;
  }
  days[idx] = { ...emptyDay(days[idx].date), skipped: true };
  return { plan: { ...plan, days }, dropped };
}

export interface Alternative {
  recipe: Recipe;
  shared: string[];
}

/** Swap options for one slot, preferring dishes that reuse what you're already buying. */
export function alternatives(ctx: EngineContext, plan: Plan, day: number, meal: MealType, limit = 6): Alternative[] {
  const current = plan.days[day].meals[meal].recipeId;
  const trip = weeklyTrip(day);
  const inTrip = new Set<string>();
  const inPlan = new Set<string>();
  plan.days.forEach((d, i) => {
    for (const m of MEALS) {
      const s = d.meals[m];
      if (!s.recipeId) continue;
      inPlan.add(s.recipeId);
      if (weeklyTrip(i) !== trip || (i === day && m === meal)) continue;
      ctx.byId.get(s.recipeId)?.ingredients.forEach((ri) => {
        const ing = ctx.ings[ri.key];
        if (ing && isPerishable(ing)) inTrip.add(ri.key);
      });
    }
  });
  return candidatesFor(ctx, meal)
    .filter((c) => c.recipe.id !== current)
    .map((c) => {
      const shared = c.recipe.ingredients.filter((ri) => inTrip.has(ri.key)).map((ri) => ctx.ings[ri.key].name);
      const s = c.match * 1.5 + shared.length - (inPlan.has(c.recipe.id) ? 1.5 : 0);
      return { recipe: c.recipe, shared, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ recipe, shared }) => ({ recipe, shared }));
}

const PREPPABLE = new Set(["onion", "redonion", "garlic", "ginger", "redpepper", "scotch", "scallion", "cilantro", "carrot", "parsley"]);

/** Layer 2 micro-prep anchors, keyed "day-meal". */
export function prepTips(ctx: EngineContext, plan: Plan): Map<string, string[]> {
  const tips = new Map<string, string[]>();
  const add = (k: string, t: string) => tips.set(k, [...(tips.get(k) ?? []), t]);
  plan.days.forEach((day, i) => {
    if (day.skipped) return;
    const cooked = MEALS.filter((m) => day.meals[m].recipeId && day.meals[m].leftoverOf == null);
    for (let a = 0; a < cooked.length; a++) {
      const early = ctx.byId.get(day.meals[cooked[a]].recipeId!);
      if (!early) continue;
      for (let b = a + 1; b < cooked.length; b++) {
        const late = ctx.byId.get(day.meals[cooked[b]].recipeId!);
        if (!late) continue;
        const shared = early.ingredients
          .filter((ri) => PREPPABLE.has(ri.key) && late.ingredients.some((x) => x.key === ri.key))
          .map((ri) => ctx.ings[ri.key].name.toLowerCase().replace(/^yellow /, ""));
        if (shared.length) add(`${i}-${cooked[a]}`, `Chop extra ${shared.join(", ")} now for ${MEAL_LABEL[cooked[b]].toLowerCase()} (${late.name}).`);
      }
    }
    const dinner = day.meals.d;
    const next = plan.days[i + 1];
    if (dinner.recipeId && next?.meals.l.leftoverOf === i) add(`${i}-d`, "Cook a double batch: tomorrow's lunch is covered.");
    if (dinner.recipeId && next && !next.skipped) {
      const usesRice = (id?: string | null) => !!id && !!ctx.byId.get(id)?.ingredients.some((ri) => ri.key === "rice");
      const nextRice = (["b", "l"] as MealType[]).find((m) => next.meals[m].leftoverOf == null && usesRice(next.meals[m].recipeId));
      if (usesRice(dinner.recipeId) && nextRice) {
        add(`${i}-d`, `Cook extra rice tonight for tomorrow's ${MEAL_LABEL[nextRice].toLowerCase()} (${ctx.byId.get(next.meals[nextRice].recipeId!)!.name}).`);
      }
    }
  });
  return tips;
}

export interface InstantOption {
  recipe: Recipe;
  have: string[];
  missing: string[];
  missingCost: number;
}

/** Instant meal: the best dishes for right now, ranked by what's already at home. */
export function instantOptions(ctx: EngineContext, meal: MealType, maxMin: number, limit = 4): InstantOption[] {
  const home = new Set(ctx.state.pantry.map((p) => p.key));
  const soon = new Set(ctx.state.pantry.filter((p) => p.useWithinDays != null && p.useWithinDays <= 3).map((p) => p.key));
  return candidatesFor(ctx, meal)
    .filter((c) => !maxMin || c.recipe.totalMin <= maxMin)
    .map((c) => {
      const core = c.needs.filter((n) => {
        const a = ctx.ings[n.key]?.aisle;
        return a !== "spices" && a !== "oils";
      });
      const have = core.filter((n) => home.has(n.key));
      const missing = core.filter((n) => !home.has(n.key));
      const missingCost = missing.reduce((s, n) => s + Math.ceil(n.qty / ctx.ings[n.key].pack - 1e-9) * ctx.ings[n.key].price, 0);
      const s = (have.length / Math.max(1, core.length)) * 10 + c.match + have.filter((n) => soon.has(n.key)).length * 2 - missing.length * 0.2;
      return {
        s,
        option: {
          recipe: c.recipe,
          have: have.map((n) => ctx.ings[n.key].name),
          missing: missing.map((n) => ctx.ings[n.key].name),
          missingCost,
        },
      };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.option);
}
