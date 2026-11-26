import { describe, expect, it } from "vitest";
import { trustBonus } from "../engine/planner";
import { LIBRARY } from "../data/recipes";
import { runChecks, toPositionalSteps, type RawRecipeSubmission } from "./intake";

const base: RawRecipeSubmission = {
  title: "Riz gras",
  cuisine_tags: ["Burkina Faso"],
  prep_minutes: 20,
  cook_minutes: 40,
  ingredients: [
    { name: "rice", quantity: 400, unit: "g" },
    { name: "groundnut paste", quantity: 60, unit: "g", allergens: [] },
  ],
  steps: ["Cook the rice.", "Stir in the paste."],
};

describe("runChecks", () => {
  it("passes a sound submission and finds allergens from names", () => {
    const c = runChecks(base, [], []);
    expect(c.problems).toEqual([]);
    expect(c.allergens).toContain("peanut");
    expect(c.allergen_mismatch).toContain("peanut");
  });
  it("adds allergens from resolved KB ingredients", () => {
    expect(runChecks(base, ["sesame"], []).allergens).toContain("sesame");
  });
  it("flags missing data and undercooked poultry", () => {
    const c = runChecks({ ...base, title: " ", cuisine_tags: [], steps: ["Serve the chicken pink in the middle."], ingredients: [{ name: "x", quantity: 0, unit: "g" }] }, [], ["x"]);
    expect(c.problems).toEqual(expect.arrayContaining(["Missing title", "No cuisine", "Fewer than 2 steps", "Fewer than 2 ingredients", "No quantity for x", "Step 1 suggests undercooked poultry or pork"]));
    expect(c.unresolved).toEqual(["x"]);
  });
  it("warns about implausible amounts", () => {
    const c = runChecks({ ...base, ingredients: [...base.ingredients, { name: "flour", quantity: 9000, unit: "g" }] }, [], []);
    expect(c.warnings.join(" ")).toMatch(/too large/);
  });
});

describe("toPositionalSteps", () => {
  it("re-keys ingredient ids to positions and keeps scale factors", () => {
    expect(toPositionalSteps(["Fry {onion} then add {rice*0.5} and {mystery_spice}."], ["rice", "onion"])).toEqual(["Fry {@2} then add {@1*0.5} and mystery spice."]);
  });
});

describe("trustBonus", () => {
  const r = LIBRARY.find((x) => x.id === "ng_rice_and_beans")!;
  const none = { cuisines: {}, ingredients: {} };
  it("is neutral without signals", () => expect(trustBonus(r, none)).toBe(0));
  it("penalises unverified and rewards ratings and taste", () => {
    expect(trustBonus({ ...r, verification: "unverified" }, none)).toBeLessThan(0);
    expect(trustBonus({ ...r, rating: { avg: 5, count: 10 } }, none)).toBeCloseTo(0.8);
    expect(trustBonus(r, { cuisines: { Nigeria: 1.3 }, ingredients: {} })).toBeCloseTo(0.6);
    expect(trustBonus(r, { cuisines: { Nigeria: 3 }, ingredients: {} })).toBe(3);
  });
});
