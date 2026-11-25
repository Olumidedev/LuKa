import { describe, expect, it } from "vitest";
import { INGREDIENTS, SAFE_TEMPS } from "../data/ingredients";
import { LIBRARY } from "../data/recipes";
import { REGIONS, regionOf } from "../data/countries";
import { defaultState } from "../state/defaults";
import type { AppState, Member } from "../types";
import { buildCookCard } from "./cookcard";
import { buildContext } from "./context";
import { gateRecipe } from "./gate";
import { buildPlan, skipDay, MEALS } from "./planner";
import { computeShopping, planEntries, weeklyTrip } from "./shopping";
import { planDates } from "./dates";

const member = (over: Partial<Member>): Member => ({
  id: Math.random().toString(36).slice(2),
  name: "Ada",
  age: "adult",
  allergies: [],
  diet: "",
  rules: [],
  spice: "medium",
  stage: "",
  dislikes: "",
  cooks: true,
  ...over,
});

const stateWith = (over: Partial<AppState>): AppState => ({ ...defaultState(), onboarded: true, ...over });

describe("library integrity", () => {
  it("every recipe references catalogue ingredients and valid step placeholders", () => {
    for (const r of LIBRARY) {
      const keys = new Set(r.ingredients.map((i) => i.key));
      for (const i of r.ingredients) expect(INGREDIENTS[i.key], `${r.id}: ${i.key}`).toBeDefined();
      for (const s of r.steps) {
        for (const m of s.matchAll(/\{([a-z0-9_]+)/g)) expect(keys.has(m[1]), `${r.id}: {${m[1]}}`).toBe(true);
      }
      for (const c of r.countries) expect(regionOf(c), `${r.id}: ${c}`).toBeDefined();
    }
  });

  it("covers every meal type and well over 100 countries", () => {
    for (const m of MEALS) expect(LIBRARY.filter((r) => r.meals.includes(m)).length).toBeGreaterThan(10);
    expect(REGIONS.flatMap((r) => r.countries).length).toBeGreaterThan(150);
  });

  it("has a safe temperature for every animal protein in the library", () => {
    const proteins = Object.values(INGREDIENTS).filter((i) => ["poultry", "beef", "pork"].includes(i.kind ?? "") || i.key === "salmon" || i.key === "whitefish");
    for (const p of proteins) expect(SAFE_TEMPS[p.key], p.key).toBeDefined();
  });
});

describe("allergen gate", () => {
  it("never lets a flagged allergen through, for any recipe", () => {
    const allergens = ["gluten", "dairy", "egg", "peanut", "treenut", "fish", "shellfish", "soy", "sesame", "mustard"] as const;
    for (const a of allergens) {
      const ms = [member({ allergies: [a] })];
      for (const r of LIBRARY) {
        const contains = r.ingredients.some((i) => INGREDIENTS[i.key].allergens.includes(a));
        expect(gateRecipe(r, ms, INGREDIENTS).ok, `${r.id} / ${a}`).toBe(!contains);
      }
    }
  });

  it("applies religious rules household-wide", () => {
    const ms = [member({ rules: ["halal"] }), member({ name: "Tunde" })];
    const griot = LIBRARY.find((r) => r.id === "ht_griot")!;
    const salmon = LIBRARY.find((r) => r.id === "jp_salmon")!; // mirin contains alcohol
    expect(gateRecipe(griot, ms, INGREDIENTS).ok).toBe(false);
    expect(gateRecipe(salmon, ms, INGREDIENTS).ok).toBe(false);
  });

  it("swaps a vegetarian member's portion instead of excluding the dish", () => {
    const ms = [member({ name: "Ada" }), member({ name: "Kemi", diet: "vegetarian" })];
    const jollof = LIBRARY.find((r) => r.id === "ng_jollof")!;
    const g = gateRecipe(jollof, ms, INGREDIENTS);
    expect(g.ok).toBe(true);
    expect(g.adjusts[0].swaps[0]).toMatchObject({ from: "chicken", to: "chickpeas" });
    expect(g.notes[0]).toContain("Kemi");
  });

  it("excludes the dish when the only swap would hit someone's allergy", () => {
    const ms = [member({ diet: "vegan" }), member({ name: "Bola", allergies: ["soy"] })];
    const shak = LIBRARY.find((r) => r.id === "tn_shakshuka")!; // eggs -> tofu (soy)
    expect(gateRecipe(shak, ms, INGREDIENTS).ok).toBe(false);
  });

  it("adds a mild set-aside note for spicy dishes", () => {
    const ms = [member({}), member({ name: "Tobi", age: "child", spice: "mild" })];
    const jerk = LIBRARY.find((r) => r.id === "jm_jerk")!;
    expect(gateRecipe(jerk, ms, INGREDIENTS).notes.join(" ")).toMatch(/Set aside a portion for Tobi/);
  });
});

describe("planner", () => {
  const base = () =>
    stateWith({
      members: [member({ name: "Ada" }), member({ name: "Tunde", allergies: ["peanut"] }), member({ name: "Tobi", age: "child", spice: "mild", cooks: false })],
      cuisines: [{ type: "country", value: "Nigeria" }, { type: "region", value: "Caribbean" }],
    });

  it("fills a 5-weekday plan Monday to Friday with no allergens", () => {
    const ctx = buildContext(base());
    const plan = buildPlan(ctx, "5day", "2026-11-30", 1);
    expect(plan.days.map((d) => d.date)).toEqual(planDates("5day", "2026-11-30"));
    for (const d of plan.days)
      for (const m of MEALS) {
        const id = d.meals[m].recipeId;
        expect(id).toBeTruthy();
        expect(ctx.gates.get(id!)!.ok).toBe(true);
        expect(ctx.byId.get(id!)!.ingredients.some((i) => i.key === "peanuts")).toBe(false);
      }
  });

  it("is deterministic for a seed and changes with a reshuffle", () => {
    const ctx = buildContext(base());
    const a = buildPlan(ctx, "14day", "2026-11-25", 7);
    const b = buildPlan(ctx, "14day", "2026-11-25", 7);
    const c = buildPlan(ctx, "14day", "2026-11-25", 8);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it("stays on the picked cuisines when the library allows", () => {
    const ctx = buildContext(base());
    const plan = buildPlan(ctx, "14day", "2026-11-25", 3);
    const ids = plan.days.flatMap((d) => MEALS.map((m) => d.meals[m].recipeId!));
    const onCuisine = ids.filter((id) => ctx.byId.get(id)!.countries.some((c) => c === "Nigeria" || regionOf(c) === "Caribbean" || regionOf(c) === "West Africa"));
    expect(onCuisine.length / ids.length).toBeGreaterThan(0.9);
  });

  it("uses most of the fresh food it buys (ingredient chaining)", () => {
    const ctx = buildContext(base());
    for (const seed of [1, 2, 3, 4, 5]) {
      const plan = buildPlan(ctx, "14day", "2026-11-25", seed);
      const trips = computeShopping(ctx, planEntries(ctx, plan), weeklyTrip);
      for (const t of trips) expect(t.freshUsed ?? 1).toBeGreaterThan(0.75);
    }
  });

  it("turns batch dinners into next-day lunches and keeps pins on regenerate", () => {
    const ctx = buildContext(base());
    const plan = buildPlan(ctx, "14day", "2026-11-25", 11);
    expect(plan.days.some((d) => d.meals.l.leftoverOf != null)).toBe(true);
    plan.days[3].meals.d = { recipeId: "jm_curry", pinned: true };
    const again = buildPlan(ctx, "14day", "2026-11-25", 12, plan);
    expect(again.days[3].meals.d).toMatchObject({ recipeId: "jm_curry", pinned: true });
  });

  it("skipping a day pushes meals back one day", () => {
    const ctx = buildContext(base());
    const plan = buildPlan(ctx, "5day", "2026-11-30", 2);
    const { plan: moved, dropped } = skipDay(plan, 1);
    expect(moved.days[1].skipped).toBe(true);
    expect(moved.days[2].meals.d.recipeId).toBe(plan.days[1].meals.d.recipeId);
    expect(dropped.length).toBeGreaterThan(0);
  });
});

describe("shopping list", () => {
  it("subtracts what is already at home", () => {
    const s = stateWith({ members: [member({})], cuisines: [{ type: "country", value: "Nigeria" }] });
    const ctx = buildContext(s);
    const plan = buildPlan(ctx, "5day", "2026-11-30", 1);
    const before = computeShopping(ctx, planEntries(ctx, plan), weeklyTrip)[0];
    const firstKey = before.items[0].key;
    const ctx2 = buildContext({ ...s, pantry: [{ key: firstKey, qty: null }] });
    const after = computeShopping(ctx2, planEntries(ctx2, plan), weeklyTrip)[0];
    expect(after.items.find((i) => i.key === firstKey)).toBeUndefined();
    expect(after.covered.find((i) => i.key === firstKey)).toBeDefined();
    expect(after.total).toBeLessThan(before.total);
  });
});

describe("cook card", () => {
  it("scales quantities and parses timers", () => {
    const s = stateWith({ members: [member({}), member({ name: "B" })] });
    const ctx = buildContext(s);
    const card = buildCookCard(ctx, LIBRARY.find((r) => r.id === "ng_yamegg")!, 2);
    expect(card.ingredients.join(" ")).toContain("3 eggs");
    expect(card.steps[0].some((p) => p.t === "timer" && p.min === 15)).toBe(true);
    expect(card.safety.join(" ")).toMatch(/Egg/);
  });
});
