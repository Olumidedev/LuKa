import { describe, expect, it } from "vitest";
import { listKey, productName, toLineItems } from "./instacart";

describe("Instacart handoff", () => {
  it("turns LUKA list lines into Instacart line items with supported units", () => {
    const items = toLineItems([
      { name: "Fluted pumpkin leaves (ugu)", amount: 500, unit: "g", display: "Fluted pumpkin leaves (ugu): 2 × 250 g bunch" },
      { name: "Tomatoes", amount: 6, unit: "pc", display: "Tomatoes: 6 tomatoes" },
      { name: "Long-grain rice", amount: 2000, unit: "g", display: "Long-grain rice: 1 × 2 kg bag" },
      { name: "Coconut milk", amount: 800, unit: "ml", display: "Coconut milk: 2 × 400 ml can" },
      { name: "Nothing", amount: 0, unit: "g", display: "" },
    ]);
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ name: "fluted pumpkin leaves", display_text: "Fluted pumpkin leaves (ugu): 2 × 250 g bunch", line_item_measurements: [{ quantity: 500, unit: "gram" }] });
    expect(items[1].line_item_measurements).toEqual([{ quantity: 6, unit: "each" }]);
    expect(items[2].line_item_measurements[1]).toEqual({ quantity: 2, unit: "kilogram" });
    expect(items[3].line_item_measurements[0].unit).toBe("milliliter");
  });
  it("names products for search", () => {
    expect(productName("Kale / callaloo greens")).toBe("kale");
    expect(productName("Basil / scent leaf")).toBe("basil");
  });
  it("gives the same list the same key", () => {
    const a = [{ name: "A", amount: 1, unit: "g" as const, display: "" }, { name: "B", amount: 2, unit: "pc" as const, display: "" }];
    expect(listKey(a)).toBe(listKey([...a].reverse()));
    expect(listKey(a)).not.toBe(listKey([a[0]]));
  });
});
