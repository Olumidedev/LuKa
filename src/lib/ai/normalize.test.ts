import { describe, expect, it } from "vitest";
import { INGREDIENTS } from "../data/ingredients";
import { decodeHandoff, encodeHandoff } from "../engine/handoff";
import { matchCatalogue, normalizeRecipe, parseIngredientLine } from "./normalize";

describe("importing untrusted recipes", () => {
  it("never maps an allergen-bearing name onto a safer catalogue item", () => {
    expect(matchCatalogue("", "peanut butter")).not.toBe("butter");
    expect(matchCatalogue("", "almond milk")).not.toBe("milk");
    expect(matchCatalogue("", "fresh spinach")).toBe("spinach");
  });

  it("flags allergens and kinds on unknown ingredients from their names", () => {
    const n = normalizeRecipe(
      { name: "Test", ingredients: [{ name: "smoked shrimp", qty: 50 }, { name: "goat meat", qty: 500 }], steps: ["Cook {smoked_shrimp} with {goat_meat}."] },
      { type: "ai" },
    )!;
    const shrimp = Object.values(n.ingredients).find((i) => i.name === "Smoked shrimp")!;
    const goat = Object.values(n.ingredients).find((i) => i.name === "Goat meat")!;
    expect(shrimp.allergens).toContain("shellfish");
    expect(goat.kind).toBe("goat");
    expect(n.recipe.steps[0]).toMatch(/\{x_smoked_shrimp\}/);
  });

  it("parses everyday ingredient lines without a model", () => {
    expect(parseIngredientLine("500 g yam")).toMatchObject({ name: "yam", qty: 500, unit: "g" });
    expect(parseIngredientLine("1 1/2 cups rice")).toMatchObject({ qty: 360, unit: "ml" });
    expect(parseIngredientLine("3 tomatoes")).toMatchObject({ qty: 3 * INGREDIENTS.tomato.pack, unit: "g" });
    expect(parseIngredientLine("salt to taste")).toBeNull();
  });

  it("drops non-https source links", () => {
    const n = normalizeRecipe({ name: "X", ingredients: [{ name: "rice", qty: 100 }], steps: ["Cook."], url: "javascript:alert(1)" }, { type: "user" })!;
    expect(n.recipe.source.url).toBeUndefined();
  });
});

describe("handoff links", () => {
  it("round-trips a card and rejects junk", () => {
    const card = { title: "Jollof", serves: "For 2 people", countries: ["Nigeria"], portions: 2, activeMin: 30, totalMin: 60, ingredients: ["500 g rice"], steps: [[{ t: "text" as const, v: "Cook " }, { t: "timer" as const, min: 20 }]], notes: [], safety: [] };
    const back = decodeHandoff(encodeHandoff({ card, cook: "Tunde" }))!;
    expect(back.card.title).toBe("Jollof");
    expect(back.cook).toBe("Tunde");
    expect(decodeHandoff("not-base64!!")).toBeNull();
  });
});
