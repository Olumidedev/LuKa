export type Unit = "g" | "ml" | "pc";

export type Aisle =
  | "produce"
  | "protein"
  | "dairy"
  | "bakery"
  | "grains"
  | "canned"
  | "condiments"
  | "spices"
  | "oils";

/** Canada's priority allergens (CFIA) — the set the deterministic gate enforces. */
export type Allergen =
  | "gluten"
  | "dairy"
  | "egg"
  | "peanut"
  | "treenut"
  | "fish"
  | "shellfish"
  | "soy"
  | "sesame"
  | "mustard";

/** What an ingredient *is*, for diet and religious rules (separate from allergens). */
export type Kind =
  | "poultry"
  | "beef"
  | "pork"
  | "lamb"
  | "goat"
  | "fish"
  | "shellfish"
  | "egg"
  | "dairy"
  | "honey"
  | "alcohol";

/** Nutrition per 100 g / 100 ml, or per piece for unit "pc". */
export interface Nutrition {
  kcal: number;
  protein: number;
  fiber: number;
  iron: number; // mg
  folate: number; // µg
  calcium: number; // mg
  omega3: number; // g
}

export interface Ingredient {
  key: string;
  name: string;
  unit: Unit;
  aisle: Aisle;
  /** Smallest amount a store sells (in `unit`). */
  pack: number;
  /** How one pack is described on the list, e.g. "1 kg bag", "tomato". */
  packLabel: string;
  /** Plural/countable packs ("tomato" → "4 tomatoes") vs. sized packs ("2 × 1 kg bag"). */
  countable?: boolean;
  /** Estimated CAD price per pack (Toronto baseline; replaced by the price book later). */
  price: number;
  /** Days it keeps once bought (fridge/pantry). < 10 counts as perishable. */
  shelf: number;
  allergens: Allergen[];
  kind?: Kind;
  /** Hot chilli: drives the "set aside a mild portion" note. */
  chili?: boolean;
  nutrition: Nutrition;
  /** Ingredients that came from AI or user input rather than the curated catalogue. */
  custom?: boolean;
}

export type MealType = "b" | "l" | "d";

export interface RecipeIngredient {
  key: string;
  qty: number; // for 4 adult portions
}

export interface Recipe {
  id: string;
  name: string;
  /** One country, or several for a fusion dish. */
  countries: string[];
  meals: MealType[];
  activeMin: number;
  totalMin: number;
  spice: 0 | 1 | 2 | 3;
  /** Good for "cook once, eat twice": doubles tonight, covers tomorrow's lunch. */
  batch: boolean;
  ingredients: RecipeIngredient[];
  /**
   * Steps use `{key}` or `{key*0.5}` to insert the scaled quantity and `[t12]`
   * for a 12-minute timer.
   */
  steps: string[];
  source: { type: "library" | "ai" | "user"; credit?: string; url?: string };
  /** Where this dish sits on a plate. Sides and bases aren't scheduled alone; they pair with mains. */
  plateRole?: PlateRole;
  /** Cross-cultural family this dish belongs to (e.g. "fried-ripe-plantain"). */
  archetype?: string;
  /** Local names, e.g. [{ name: "Dòdò", lang: "yo", region: "NG" }]. */
  localNames?: { name: string; lang?: string; region?: string }[];
  flavorTags?: string[];
  /** Knowledge-base trust and ratings, when loaded from the catalog. */
  verification?: "unverified" | "source_verified" | "curated";
  rating?: { avg: number; count: number };
}

export type PlateRole = "main_one_pot" | "base_starch" | "protein_main" | "vegetable_side" | "sweet_side" | "soup_stew" | "condiment";

export type AgeGroup = "adult" | "teen" | "child" | "toddler";
export type Diet = "" | "vegetarian" | "vegan" | "pescatarian";
export type Rule = "halal" | "kosher" | "nopork" | "nobeef";
export type SpiceLevel = "mild" | "medium" | "hot";
export type LifeStage = "" | "ttc" | "pregnant" | "breastfeeding" | "athlete" | "senior";

export interface Member {
  id: string;
  name: string;
  age: AgeGroup;
  allergies: Allergen[];
  diet: Diet;
  rules: Rule[];
  spice: SpiceLevel;
  stage: LifeStage;
  dislikes: string;
  cooks: boolean;
}

export interface CuisinePick {
  type: "country" | "region";
  value: string;
}

export type PlanType = "instant" | "5day" | "14day";

export interface Slot {
  recipeId: string | null;
  /** Set when this meal is leftovers of the previous day's dinner. */
  leftoverOf?: number;
  pinned?: boolean;
  cookId?: string;
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  skipped?: boolean;
  meals: Record<MealType, Slot>;
}

export interface Plan {
  type: "5day" | "14day";
  start: string;
  days: PlanDay[];
  seed: number;
}

export interface PantryItem {
  key: string;
  /** Amount on hand in the ingredient's unit; null = "enough". */
  qty: number | null;
  /** Needs using within this many days (from a fridge scan or manual flag). */
  useWithinDays?: number;
}

export interface Store {
  id: string;
  name: string;
  loyalty?: string;
}

export interface Settings {
  nutrition: "badges" | "numbers" | "off";
  leftovers: boolean;
  rotation: boolean;
  takeoutPerPerson: number;
}

export interface InstantState {
  meal: MealType;
  maxMin: number; // 0 = any
  pickId: string | null;
}

export interface AppState {
  version: 1;
  onboarded: boolean;
  members: Member[];
  cuisines: CuisinePick[];
  planType: PlanType;
  plan: Plan | null;
  instant: InstantState;
  pantry: PantryItem[];
  /** Grocery keys ticked "in cart" while shopping. */
  inCart: Record<string, boolean>;
  stores: Store[];
  aisleStore: Partial<Record<Aisle, string>>;
  settings: Settings;
  customRecipes: Recipe[];
  customIngredients: Record<string, Ingredient>;
}
