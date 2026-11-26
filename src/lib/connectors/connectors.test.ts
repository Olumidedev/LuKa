import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nameScore } from "./match";
import { cnfToNutrition, fdcToNutrition, parseCsv, parseWafctCsv } from "./nutrition";
import { offToAllergens } from "./openfoodfacts";
import { statcanToPrices } from "./statcan";

const fx = (f: string) => readFileSync(path.join(import.meta.dirname, "__fixtures__", f), "utf8");

describe("nutrition parsers (real API responses)", () => {
  it("reads USDA FoodData Central nutrients by number", () => {
    const n = fdcToNutrition(JSON.parse(fx("fdc-food-168215.json")));
    expect(n).toMatchObject({ energy_kcal: 152, protein_g: 1.25, fat_g: 0.07, carbs_g: 36.66, fiber_g: 2.2, sodium_mg: 2 });
    expect(n.micronutrients.iron_mg).toBe(0.75);
    expect(n.micronutrients.calcium_mg).toBeGreaterThan(0);
  });

  it("reads Health Canada CNF amounts", () => {
    const n = cnfToNutrition(JSON.parse(fx("cnf-amount-1661.json")));
    expect(n).toMatchObject({ energy_kcal: 122, protein_g: 1.3, carbs_g: 31.89, fat_g: 0.37, fiber_g: 2.3, sodium_mg: 4 });
    expect(n.micronutrients).toMatchObject({ iron_mg: 0.6, calcium_mg: 3, folate_ug: 22 });
  });

  it("maps WAFCT columns by INFOODS tagname, including bracketed values", () => {
    const rows = parseWafctCsv(fx("wafct-synthetic.csv"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ code: "TEST01", nutrition: { energy_kcal: 30, protein_g: 3.1, fiber_g: 2.4, micronutrients: { iron_mg: 2.2, folate_ug: 95 } } });
  });
});

describe("Open Food Facts allergens (real product)", () => {
  it("maps contains and traces to LUKA keys", () => {
    const a = offToAllergens(JSON.parse(fx("off-737628064502.json")));
    expect(a.contains.sort()).toEqual(["peanut", "sesame", "soy"]);
    expect(a.mayContain).toEqual([]); // peanut traces already declared as contains
    expect(a.packLabel).toBe("155 g");
  });
});

describe("Statistics Canada prices (real table rows)", () => {
  const map = [
    { product_label: "Tomatoes, per kilogram", ingredient_id: "tomato", grams_per_product: null, per_unit: false },
    { product_label: "Eggs, 1 dozen", ingredient_id: "eggs", grams_per_product: 600, per_unit: false },
    { product_label: "Lemons, unit", ingredient_id: "lemon", grams_per_product: 100, per_unit: true },
    { product_label: "Tofu, 350 grams", ingredient_id: "tofu", grams_per_product: 350, per_unit: false },
  ];
  it("keeps Canada-level rows only and normalises to $/kg", () => {
    const p = statcanToPrices(fx("statcan-sample.csv"), map, 3);
    const by = Object.fromEntries(p.map((r) => [r.ingredient_id, r]));
    expect(p).toHaveLength(4); // Ontario row and unmapped rice ignored
    expect(by.tomato).toMatchObject({ price_amount: 4.71, pack_unit: "kg", normalized_price_per_kg: 4.71, period_start: "2026-09-01" });
    expect(by.eggs.normalized_price_per_kg).toBe(8.05);
    expect(by.lemon).toMatchObject({ pack_unit: "pc", normalized_price_per_kg: 10.4 });
    expect(by.tofu.normalized_price_per_kg).toBe(7.91); // label has a trailing space in the source
  });
});

describe("helpers", () => {
  it("parses quoted CSV with escaped quotes", () => {
    expect(parseCsv('a,"b ""x"", c"\r\n1,2\n')).toEqual([["a", 'b "x", c'], ["1", "2"]]);
  });
  it("scores names sensibly", () => {
    expect(nameScore("plantains yellow raw", "Plantains, yellow, raw")).toBeGreaterThan(0.9);
    expect(nameScore("plantains yellow raw", "Plantains, green, raw")).toBeLessThan(nameScore("plantains yellow raw", "Plantains, yellow, raw"));
  });
});
