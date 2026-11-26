/** Lightweight name matching for linking canonical ingredients to external food records. */
const STOP = new Set(["and", "or", "with", "the", "of", "in", "a", "fresh", "plain", "raw", "per", "canned", "dried"]);

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[^a-z]+/)
    .map((t) => t.replace(/(ies)$/, "y").replace(/(oes|es|s)$/, (m) => (m === "oes" ? "o" : m === "es" ? "" : "")))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** 0–1 overlap score between two names (Dice coefficient on tokens), with a nudge for "raw" records. */
export function nameScore(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  const dice = (2 * hit) / (ta.size + tb.size);
  return Math.min(1, dice + (/\braw\b/i.test(b) ? 0.05 : 0));
}

/** Search phrases that find the right record where the display name alone wouldn't. */
export const SEARCH_HINTS: Record<string, string> = {
  plantain: "plantains yellow raw",
  greenplantain: "plantains green raw",
  chicken: "chicken thigh meat and skin raw",
  beef: "beef chuck for stew raw",
  beefmince: "beef ground 85% lean raw",
  sirloin: "beef top sirloin raw",
  pork: "pork shoulder raw",
  salmon: "salmon atlantic raw",
  whitefish: "cod atlantic raw",
  saltfish: "cod atlantic dried and salted",
  eggs: "egg whole raw",
  scotch: "peppers hot chili red raw",
  redpepper: "peppers sweet red raw",
  rice: "rice white long-grain raw",
  parboiledrice: "rice white long-grain parboiled raw",
  blackeyed: "cowpeas common blackeyes mature seeds raw",
  honeybeans: "cowpeas common blackeyes crowder southern mature seeds raw",
  lentils: "lentils pink or red raw",
  chickpeas: "chickpeas canned drained",
  yam: "yam raw",
  ugu: "pumpkin leaves raw",
  kale: "kale raw",
  coconutmilk: "coconut milk canned",
  palmoil: "oil palm",
  garri: "cassava flour",
  egusi: "seeds watermelon seed kernels dried",
  yogurt: "yogurt plain whole milk",
  milk: "milk whole 3.25%",
  cheese: "cheese feta",
};
