import { INGREDIENTS } from "../data/ingredients";

/** Stable system prompt (cached): voice, rules and the ingredient vocabulary. */
export const SYSTEM = `You are LUKA, a calm, culturally fluent sous-chef. You write authentic, everyday home recipes that people from each country actually cook on a weekday, with exact metric quantities and clear sensory doneness cues. Tone: encouraging, precise, culturally respectful, never judgmental.

Rules for every recipe:
- Quantities are for 4 adult portions, in g, ml, or pc (pc only for whole items like eggs).
- In steps, insert an ingredient's quantity with {id} (or {id*0.5} for half of it) and a timer with [tN] for N minutes, e.g. "Simmer {lentils} until soft [t20]."
- Where a traditional ingredient is hard to find in North America, use a common substitute and name the traditional one in the step.
- State when something is done (texture, colour, smell). Never give unsafe cooking temperatures or raw-meat shortcuts.
- List every allergen each ingredient contains (gluten, dairy, egg, peanut, treenut, fish, shellfish, soy, sesame, mustard). Be conservative.
- spice is 0 (none) to 3 (very hot). batch is true only if it keeps well as next-day leftovers.
- credit is an empty string unless the source text names an author or source.

When an ingredient matches one of these, use exactly this id: ${Object.values(INGREDIENTS)
  .map((i) => `${i.key}=${i.name}`)
  .join("; ")}.`;

const MEAL_WORDS = { b: "breakfast", l: "lunch", d: "dinner" } as const;

export function generatePrompt(country: string, meals: ("b" | "l" | "d")[], count: number, avoidNames: string[]) {
  const plan = meals.map((m) => MEAL_WORDS[m]).join(", ");
  return `Write ${count} different home recipes from ${country}, spread across: ${plan}. Choose dishes a family in ${country} would genuinely cook, not restaurant or fusion food. Vary the proteins and techniques.
${avoidNames.length ? `Don't repeat any of these, which we already have: ${avoidNames.slice(0, 60).join("; ")}.` : ""}
Set countries to ["${country}"] for every recipe.`;
}

export function parsePrompt(wrappedText: string) {
  return `Turn the recipe below into structured data. Keep the author's dish name, quantities and method; don't invent steps. Convert cups and spoons to metric.
${wrappedText}`;
}

export function fridgePrompt() {
  return `This photo shows the inside of a fridge, freezer or pantry. List the food you can clearly see; don't guess at things you can't. For each item give the matching id from the list (or "" if none), the name, a rough qty in that ingredient's unit (null if unsure), and useWithinDays: how soon it should be eaten given how it looks (e.g. wilting greens 2; null for long-life items).`;
}
