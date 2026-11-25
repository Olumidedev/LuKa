import { INGREDIENTS } from "../data/ingredients";

const MEAL_WORDS = { b: "breakfast", l: "lunch", d: "dinner" } as const;

const RECIPE_SHAPE = `{"name": string, "countries": [country names], "meals": ["b"|"l"|"d"], "activeMin": number, "totalMin": number, "spice": 0-3, "batch": boolean (true if it keeps well as next-day leftovers), "credit": string (optional), "ingredients": [{"id": short_snake_case, "name": string, "qty": number, "unit": "g"|"ml"|"pc", "aisle": "produce"|"protein"|"dairy"|"bakery"|"grains"|"canned"|"condiments"|"spices"|"oils", "allergens": [any of "gluten","dairy","egg","peanut","treenut","fish","shellfish","soy","sesame","mustard"]}], "steps": [string]}`;

const STEP_RULES = `Quantities are for 4 adult portions, metric (g, ml, or pc for whole items like eggs).
In steps, insert an ingredient's quantity with {id} (or {id*0.5} for half of it) and a timer with [tN] for N minutes, e.g. "Simmer {lentils} [t20]".
Say plainly when something is done (texture, colour) and never give unsafe cooking temperatures.`;

function catalogue() {
  return Object.values(INGREDIENTS)
    .map((i) => `${i.key}=${i.name}`)
    .join("; ");
}

export function generatePrompt(opts: { country: string; meals: ("b" | "l" | "d")[]; count: number; avoidAllergens: string[]; avoidKinds: string[] }) {
  const meals = opts.meals.map((m) => MEAL_WORDS[m]).join(", ");
  return `You are Luka, a calm, culturally fluent sous-chef helping a household cook at home.
Write ${opts.count} authentic, everyday home recipes from ${opts.country} for: ${meals}. Prefer dishes people from ${opts.country} actually cook at home on a weekday. Where a traditional ingredient is hard to find in North America, use a common substitute and name the traditional one in the step.
${opts.avoidAllergens.length ? `They MUST NOT contain: ${opts.avoidAllergens.join(", ")}.` : ""}
${opts.avoidKinds.length ? `They MUST NOT contain: ${opts.avoidKinds.join(", ")}.` : ""}
When an ingredient matches one of these, use exactly this id: ${catalogue()}.
${STEP_RULES}
Return JSON only: {"recipes": [${RECIPE_SHAPE}]}`;
}

export function parsePrompt(wrappedText: string) {
  return `Turn the recipe below into structured data. Keep the author's dish name, quantities and method; do not invent steps. If amounts are in cups or spoons, convert to metric. Put the author or source name in "credit" if given.
When an ingredient matches one of these, use exactly this id: ${catalogue()}.
${STEP_RULES}
${wrappedText}
Return JSON only: {"recipe": ${RECIPE_SHAPE}}`;
}

export function fridgePrompt() {
  return `This photo shows the inside of a fridge, freezer or pantry. List the food you can clearly see. Don't guess at things you can't see.
For each item give: "id" (one of these ids if it matches, otherwise ""), "name", "qty" (rough amount in grams, millilitres, or pieces for eggs; null if unsure) and "useWithinDays" (how soon it should be eaten given how it looks, e.g. wilting greens 2; null for long-life items).
Ids: ${catalogue()}.
Return JSON only: {"items": [{"id": string, "name": string, "qty": number|null, "useWithinDays": number|null}]}`;
}
