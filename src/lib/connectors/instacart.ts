/**
 * Instacart Developer Platform: a checkout handoff only. LUKA sends item names
 * and amounts (no household details) and gets back a shoppable link; it never
 * reads Instacart prices into its own data.
 */
export interface ListLine {
  name: string;
  /** Total amount in LUKA's unit. */
  amount: number;
  unit: "g" | "ml" | "pc";
  display: string;
}

export interface InstacartLineItem {
  name: string;
  display_text: string;
  line_item_measurements: { quantity: number; unit: string }[];
}

const UNIT: Record<ListLine["unit"], string> = { g: "gram", ml: "milliliter", pc: "each" };

/** Search-friendly product name: drops LUKA's local-name notes ("Fluted pumpkin leaves (ugu)" → "fluted pumpkin leaves"). */
export function productName(name: string): string {
  const main = name.replace(/\s*\([^)]*\)/g, "").split(" / ")[0].trim();
  return main.toLowerCase().slice(0, 100);
}

export function toLineItems(lines: ListLine[]): InstacartLineItem[] {
  return lines
    .filter((l) => l.name.trim() && l.amount > 0)
    .slice(0, 100)
    .map((l) => {
      const m = [{ quantity: Math.round(l.amount * 100) / 100, unit: UNIT[l.unit] }];
      if (l.unit === "g" && l.amount >= 1000) m.push({ quantity: Math.round(l.amount / 10) / 100, unit: "kilogram" });
      return { name: productName(l.name), display_text: l.display.slice(0, 120), line_item_measurements: m };
    });
}

export const instacartBase = () => (process.env.INSTACART_ENV === "production" ? "https://connect.instacart.com" : "https://connect.dev.instacart.tools");

/** Stable key for a list, so the same list reuses its link (Instacart asks partners to cache links). */
export function listKey(lines: ListLine[]): string {
  const s = lines.map((l) => `${l.name}|${Math.round(l.amount)}|${l.unit}`).sort().join(";");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
