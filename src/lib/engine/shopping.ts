import type { Ingredient, MealType, PantryItem, Plan } from "../types";
import type { EngineContext } from "./context";
import { recipeNeeds, type Need } from "./quantities";

export const PERISHABLE_DAYS = 10;
export const isPerishable = (ing: Ingredient) => ing.shelf < PERISHABLE_DAYS;

/**
 * Pack-aware running inventory shared by the planner (for scoring) and the
 * shopping list (for buying). Perishable leftovers don't survive into the next
 * weekly shop; long-life leftovers do.
 */
export class Inventory {
  private left = new Map<string, { qty: number; trip: number }>();

  constructor(private ings: Record<string, Ingredient>, pantry: PantryItem[] = []) {
    for (const p of pantry) this.left.set(p.key, { qty: p.qty ?? Number.POSITIVE_INFINITY, trip: 0 });
  }

  available(key: string, trip: number): number {
    const e = this.left.get(key);
    const ing = this.ings[key];
    if (!e || !ing) return 0;
    if (e.trip !== trip && isPerishable(ing)) return 0;
    return e.qty;
  }

  /** Uses `qty`, buying whole packs as needed. Returns what came from stock and what was bought. */
  consume(key: string, qty: number, trip: number): { fromStock: number; packs: number; leftover: number } {
    const ing = this.ings[key];
    if (!ing) return { fromStock: 0, packs: 0, leftover: 0 };
    const have = this.available(key, trip);
    if (have >= qty) {
      this.left.set(key, { qty: have - qty, trip: have === Number.POSITIVE_INFINITY ? 0 : trip });
      return { fromStock: qty, packs: 0, leftover: have - qty };
    }
    const need = qty - have;
    const packs = Math.ceil(need / ing.pack - 1e-9);
    const leftover = have + packs * ing.pack - qty;
    this.left.set(key, { qty: leftover, trip });
    return { fromStock: have, packs, leftover };
  }
}

export interface ShopUse {
  day: number;
  meal: MealType;
  recipeId: string;
  qty: number;
}

export interface ShopItem {
  key: string;
  ing: Ingredient;
  need: number;
  fromHome: number;
  packs: number;
  cost: number;
  uses: ShopUse[];
  /** Share of what you buy that the plan actually uses (perishables only). */
  utilization: number | null;
}

export interface ShopTrip {
  index: number;
  days: number[];
  items: ShopItem[];
  covered: ShopItem[];
  total: number;
  freshUsed: number | null;
}

export interface MealEntry {
  day: number;
  meal: MealType;
  recipeId: string;
  needs: Need[];
}

/** The meals in a plan that are actually cooked, with their scaled needs. */
export function planEntries(ctx: EngineContext, plan: Plan): MealEntry[] {
  const out: MealEntry[] = [];
  plan.days.forEach((day, i) => {
    if (day.skipped) return;
    for (const meal of ["b", "l", "d"] as MealType[]) {
      const slot = day.meals[meal];
      if (!slot.recipeId || slot.leftoverOf != null) continue;
      const r = ctx.byId.get(slot.recipeId);
      const gate = ctx.gates.get(slot.recipeId);
      if (!r || !gate) continue;
      const next = plan.days[i + 1];
      const feeds = meal === "d" && next && next.meals.l.leftoverOf === i;
      out.push({ day: i, meal, recipeId: r.id, needs: recipeNeeds(r, ctx.state.members, gate, ctx.portions * (feeds ? 2 : 1)) });
    }
  });
  return out;
}

export function computeShopping(ctx: EngineContext, entries: MealEntry[], tripOf: (day: number) => number): ShopTrip[] {
  const tripCount = entries.reduce((m, e) => Math.max(m, tripOf(e.day) + 1), 1);
  const inv = new Inventory(ctx.ings, ctx.state.pantry);
  const trips: ShopTrip[] = [];

  for (let t = 0; t < tripCount; t++) {
    const agg = new Map<string, { need: number; uses: ShopUse[] }>();
    const days = new Set<number>();
    for (const e of entries) {
      if (tripOf(e.day) !== t) continue;
      days.add(e.day);
      for (const n of e.needs) {
        const a = agg.get(n.key) ?? { need: 0, uses: [] };
        a.need += n.qty;
        a.uses.push({ day: e.day, meal: e.meal, recipeId: e.recipeId, qty: n.qty });
        agg.set(n.key, a);
      }
    }
    const items: ShopItem[] = [];
    const covered: ShopItem[] = [];
    let total = 0;
    let freshUsedNum = 0;
    let freshBought = 0;
    for (const [key, a] of agg) {
      const ing = ctx.ings[key];
      if (!ing) continue;
      const r = inv.consume(key, a.need, t);
      const bought = r.packs * ing.pack;
      const cost = r.packs * ing.price;
      const fromHome = Math.min(r.fromStock, a.need);
      const usedFromBought = a.need - fromHome;
      const utilization = r.packs > 0 && isPerishable(ing) ? usedFromBought / bought : null;
      if (utilization != null) {
        freshUsedNum += usedFromBought;
        freshBought += bought;
      }
      const item: ShopItem = { key, ing, need: a.need, fromHome, packs: r.packs, cost, uses: a.uses, utilization };
      (r.packs > 0 ? items : covered).push(item);
      total += cost;
    }
    trips.push({ index: t, days: [...days].sort((x, y) => x - y), items, covered, total, freshUsed: freshBought ? freshUsedNum / freshBought : null });
  }
  return trips;
}

export const weeklyTrip = (day: number) => Math.floor(day / 7);
