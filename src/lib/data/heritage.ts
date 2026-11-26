import type { MealType, PlateRole, Recipe } from "../types";

/**
 * Heritage dishes that model LUKA's cross-cultural palette: peer expressions of
 * shared culinary archetypes (never flattened into one generic label), and the
 * complete regional plates they belong to. Quantities are for 4 adult portions.
 */
function h(
  id: string,
  name: string,
  countries: string[],
  meals: string,
  activeMin: number,
  totalMin: number,
  spice: 0 | 1 | 2 | 3,
  batch: boolean,
  plateRole: PlateRole,
  archetype: string,
  ing: string,
  steps: string[],
  extra: Partial<Recipe> = {},
): Recipe {
  return {
    id,
    name,
    countries,
    meals: meals.split("") as MealType[],
    activeMin,
    totalMin,
    spice,
    batch,
    ingredients: ing
      .trim()
      .split(/\s+/)
      .map((p) => {
        const [key, qty] = p.split(":");
        return { key, qty: Number(qty) };
      }),
    steps,
    source: { type: "library" },
    plateRole,
    archetype,
    ...extra,
  };
}

export const HERITAGE: Recipe[] = [
  h("ng_rice_and_beans", "Nigerian Rice & Beans", ["Nigeria"], "ld", 20, 70, 1, true, "main_one_pot", "legume-and-rice-staple",
    "honeybeans:300 parboiledrice:400 palmoil:60 onion:150 scotch:5 crayfish:10 stock:300", [
      "Pick through {honeybeans} for stones, rinse, and boil in plenty of water until just tender but holding shape [t40]. Don't salt yet: salt toughens the skins.",
      "Rinse {parboiledrice} until the water runs clear. Add it to the beans with {stock} and enough hot water to cover by 2 cm. Cover and cook on low until the rice is soft and the water is absorbed [t25].",
      "Warm {palmoil} gently (no smoke), fry sliced {onion} and pounded {scotch} until soft and fragrant [t5], then stir in {crayfish}.",
      "Fold the palm-oil sauce through the rice and beans and season with salt. The grains should be separate, the beans creamy inside.",
    ], { flavorTags: ["savoury", "earthy", "palm-oil"], localNames: [{ name: "Rice and beans", lang: "en", region: "NG" }] }),

  h("ng_dodo", "Dodo (Fried Ripe Plantain)", ["Nigeria"], "bld", 10, 15, 0, false, "sweet_side", "fried-ripe-plantain",
    "plantain:1000 oil:400", [
      "Use plantains with mostly black skins: they're sweetest. Peel {plantain} and cut on the diagonal into 1 cm slices; salt lightly.",
      "Heat {oil} in a deep pan to about 175 °C: a slice should sizzle at once.",
      "Fry in batches without crowding until deep golden with caramelised edges, turning once [t4].",
      "Drain on paper. Dodo is done when the edges are dark amber and the centre is soft and sweet.",
    ], { flavorTags: ["sweet", "caramelised"], localNames: [{ name: "Dòdò", lang: "yo", region: "NG" }] }),

  h("jm_rice_and_peas", "Jamaican Rice & Peas", ["Jamaica"], "ld", 10, 40, 1, true, "base_starch", "legume-and-rice-staple",
    "kidneybeans:400 coconutmilk:400 rice:400 scallion:60 garlic:10 thyme:3 allspice:3 scotch:10", [
      "Pour {kidneybeans} with their liquid and {coconutmilk} into a pot. Add crushed {garlic}, {thyme}, {allspice} and bruised {scallion}; top up with water to make about 900 ml liquid.",
      "Bring to a simmer, add a whole {scotch} (don't burst it: it perfumes rather than burns) and season well with salt.",
      "Stir in rinsed {rice}, cover tightly and cook on the lowest heat [t25] until the liquid is absorbed.",
      "Lift out the scotch bonnet and scallion. Fluff with a fork: the rice should be pale pink and fragrant with coconut.",
    ], { flavorTags: ["coconut", "allspice", "savoury"], localNames: [{ name: "Rice and peas", lang: "en", region: "JM" }] }),

  h("jm_fried_ripe_plantain", "Jamaican Fried Ripe Plantain", ["Jamaica"], "bld", 10, 15, 0, false, "sweet_side", "fried-ripe-plantain",
    "plantain:750 oil:150", [
      "Peel ripe {plantain} (yellow with plenty of black spots) and slice lengthwise or on a long diagonal, about 1 cm thick.",
      "Shallow-fry in {oil} over medium heat, turning once, until both sides are golden brown and glossy [t6].",
      "Drain briefly. Serve warm beside jerk, ackee or rice and peas.",
    ], { flavorTags: ["sweet", "caramelised"] }),

  h("jm_jerk_chicken", "Jamaican Jerk Chicken", ["Jamaica"], "d", 25, 90, 3, true, "protein_main", "smoky-spiced-chicken",
    "chicken:1200 scallion:100 scotch:15 allspice:6 thyme:3 garlic:20 ginger:20 lime:70 soysauce:30 sugar:20 oil:30", [
      "Blend {scallion}, {scotch}, {allspice}, {thyme}, {garlic}, {ginger}, the juice of {lime}, {soysauce}, {sugar} and {oil} into a thick marinade.",
      "Slash {chicken} to the bone, rub the marinade into every cut and marinate at least 2 hours, ideally overnight [t120].",
      "Roast at 200 °C, or grill over medium coals, turning, until charred at the edges and cooked through [t45].",
      "Rest 5 minutes. Jerk is ready when the skin is blistered and dark in places and the juices run clear.",
    ], { flavorTags: ["smoky", "spicy", "allspice"] }),

  h("in_pazham_pori", "Pazham Pori (Kerala Plantain Fritters)", ["India"], "b", 15, 25, 0, false, "sweet_side", "fried-ripe-plantain",
    "plantain:750 flour:150 sugar:30 turmeric:1 oil:500", [
      "Whisk {flour}, {sugar}, {turmeric} and a pinch of salt with about 180 ml water into a smooth batter that coats a spoon.",
      "Peel ripe {plantain} (Kerala nendran if you can find it) and slice lengthwise into thin, long strips.",
      "Heat {oil} to about 175 °C. Dip each strip in batter and fry until puffed and golden on both sides [t4].",
      "Drain and serve hot with tea, the way it's eaten at Kerala tea shops in the evening.",
    ], { flavorTags: ["sweet", "crisp"], localNames: [{ name: "Ethakka appam", lang: "ml", region: "IN" }] }),
];

export interface ArchetypeSeed {
  slug: string;
  label: string;
  description: string;
}

export const ARCHETYPES: ArchetypeSeed[] = [
  { slug: "fried-ripe-plantain", label: "Fried ripe plantain", description: "Ripe plantain fried until caramelised, as a side or snack, across West Africa, the Caribbean, Latin America and South India." },
  { slug: "legume-and-rice-staple", label: "Legumes cooked with rice", description: "Rice simmered with beans or peas as an everyday staple: rice and beans, rice and peas, moros, waakye." },
  { slug: "smoky-spiced-chicken", label: "Smoky spiced chicken", description: "Chicken marinated in a pungent spice paste and roasted or grilled until charred." },
  { slug: "tomato-pepper-rice", label: "Rice cooked in tomato and pepper", description: "Rice steamed in a reduced tomato-pepper base: jollof and its relatives." },
  { slug: "leafy-green-stew", label: "Stewed leafy greens", description: "Greens cooked down with aromatics, oil and often protein: efo riro, callaloo, palak, sukuma wiki." },
  { slug: "stewed-legumes", label: "Spiced stewed legumes", description: "Lentils, beans or chickpeas simmered with aromatics: dal, misir wot, red red, curry chana." },
  { slug: "eggs-in-tomato-sauce", label: "Eggs in a spiced tomato sauce", description: "Eggs cooked in or with a peppery tomato base: shakshuka, huevos rancheros, yam and egg sauce." },
  { slug: "bean-fritters-and-cakes", label: "Bean fritters and steamed bean cakes", description: "Ground beans whipped and fried or steamed: akara, moi moi." },
  { slug: "maize-porridge-and-swallow", label: "Maize porridge and swallows", description: "Cornmeal cooked thick or soft: ugali, pap, cornmeal porridge, arepas." },
  { slug: "braised-chicken-in-sauce", label: "Chicken braised in a rich sauce", description: "Chicken simmered in a spiced sauce: curry chicken, yassa, karahi, adobo, machboos." },
];

/** Built-in library dishes linked to their archetype family. */
export const LIBRARY_ARCHETYPES: Record<string, string> = {
  ng_jollof: "tomato-pepper-rice",
  fx_jerkjollof: "tomato-pepper-rice",
  ng_efo: "leafy-green-stew",
  jm_callaloo: "leafy-green-stew",
  in_palak: "leafy-green-stew",
  ke_sukuma: "leafy-green-stew",
  ng_egusi: "leafy-green-stew",
  in_dal: "stewed-legumes",
  et_misir: "stewed-legumes",
  gh_redred: "stewed-legumes",
  tt_chana: "stewed-legumes",
  lk_dhal: "stewed-legumes",
  fx_currychana_plantain: "stewed-legumes",
  tn_shakshuka: "eggs-in-tomato-sauce",
  mx_rancheros: "eggs-in-tomato-sauce",
  ng_yamegg: "eggs-in-tomato-sauce",
  fx_plantainshak: "eggs-in-tomato-sauce",
  ng_akara: "bean-fritters-and-cakes",
  ng_moimoi: "bean-fritters-and-cakes",
  jm_porridge: "maize-porridge-and-swallow",
  co_arepas: "maize-porridge-and-swallow",
  cu_moros: "legume-and-rice-staple",
  jm_jerk: "smoky-spiced-chicken",
  jm_curry: "braised-chicken-in-sauce",
  sn_yassa: "braised-chicken-in-sauce",
  pk_karahi: "braised-chicken-in-sauce",
  ph_adobo: "braised-chicken-in-sauce",
  sa_machboos: "braised-chicken-in-sauce",
  cm_pouletdg: "braised-chicken-in-sauce",
};

export interface PlateSeed {
  slug: string;
  title: string;
  summary: string;
  country: string; // ISO 3166-1 alpha-2
  cuisine: string;
  items: { recipeId: string; role: PlateRole; anchor?: boolean }[];
}

export const PLATES: PlateSeed[] = [
  {
    slug: "ng-rice-and-beans-with-dodo",
    title: "Nigerian Rice & Beans with Dodo",
    summary: "Creamy honey beans and rice in palm-oil pepper sauce, with sweet fried plantain on the side.",
    country: "NG",
    cuisine: "Nigeria",
    items: [
      { recipeId: "ng_rice_and_beans", role: "main_one_pot", anchor: true },
      { recipeId: "ng_dodo", role: "sweet_side" },
    ],
  },
  {
    slug: "jm-rice-and-peas-jerk-chicken-fried-plantain",
    title: "Jamaican Rice & Peas with Jerk Chicken & Fried Plantain",
    summary: "Sunday-style plate: smoky jerk chicken, coconut rice and peas, and ripe fried plantain.",
    country: "JM",
    cuisine: "Jamaica",
    items: [
      { recipeId: "jm_jerk_chicken", role: "protein_main", anchor: true },
      { recipeId: "jm_rice_and_peas", role: "base_starch" },
      { recipeId: "jm_fried_ripe_plantain", role: "sweet_side" },
    ],
  },
];

/** Regional and language names for canonical ingredients (keyed by app key). */
export const INGREDIENT_ALIASES: Record<string, { name: string; lang?: string; region?: string; variant?: boolean }[]> = {
  ugu: [
    { name: "ugu", lang: "ig", region: "NG" },
    { name: "ugwu", lang: "ig", region: "NG", variant: true },
    { name: "fluted pumpkin leaves", lang: "en" },
    { name: "telfairia leaves", lang: "en", variant: true },
  ],
  honeybeans: [
    { name: "ewa oloyin", lang: "yo", region: "NG" },
    { name: "honey beans", lang: "en" },
    { name: "Nigerian brown beans", lang: "en", region: "NG", variant: true },
  ],
  scotch: [
    { name: "scotch bonnet", lang: "en" },
    { name: "ata rodo", lang: "yo", region: "NG" },
  ],
  allspice: [{ name: "pimento", lang: "en", region: "JM" }],
  plantain: [
    { name: "ripe plantain", lang: "en" },
    { name: "nendran", lang: "ml", region: "IN", variant: true },
  ],
  kale: [{ name: "callaloo", lang: "en", region: "JM", variant: true }],
  egusi: [{ name: "melon seeds", lang: "en" }],
  garri: [{ name: "gari", lang: "en", variant: true }],
  kidneybeans: [{ name: "red peas", lang: "en", region: "JM" }],
  coconutmilk: [{ name: "coconut milk", lang: "en" }],
  parboiledrice: [{ name: "parboiled rice", lang: "en" }],
  chicken: [{ name: "chicken thighs", lang: "en" }],
  cilantro: [{ name: "coriander leaves", lang: "en", region: "GB" }],
  scallion: [
    { name: "spring onions", lang: "en", region: "GB" },
    { name: "escallion", lang: "en", region: "JM", variant: true },
  ],
};

/** Slugs the spec names explicitly; everything else is derived from the ingredient name. */
export const SLUG_OVERRIDES: Record<string, string> = {
  ugu: "fluted-pumpkin-leaves",
  plantain: "ripe-plantain",
  parboiledrice: "parboiled-rice",
  honeybeans: "honey-beans",
  kidneybeans: "red-kidney-beans",
  coconutmilk: "coconut-milk",
  scotch: "scotch-bonnet-pepper",
  allspice: "allspice",
  chicken: "chicken-thighs",
};

/** ISO country codes and Wikidata items for the countries in the library. */
export const COUNTRY_CODES: Record<string, { code: string; qid?: string }> = {
  Nigeria: { code: "NG", qid: "Q1033" },
  Ghana: { code: "GH", qid: "Q117" },
  Senegal: { code: "SN", qid: "Q1041" },
  Cameroon: { code: "CM", qid: "Q1009" },
  Ethiopia: { code: "ET", qid: "Q115" },
  Kenya: { code: "KE", qid: "Q114" },
  "South Africa": { code: "ZA", qid: "Q258" },
  Jamaica: { code: "JM", qid: "Q766" },
  "Trinidad and Tobago": { code: "TT", qid: "Q754" },
  Haiti: { code: "HT", qid: "Q790" },
  "Dominican Republic": { code: "DO", qid: "Q786" },
  Cuba: { code: "CU", qid: "Q241" },
  Mexico: { code: "MX", qid: "Q96" },
  Peru: { code: "PE", qid: "Q419" },
  Brazil: { code: "BR", qid: "Q155" },
  Colombia: { code: "CO", qid: "Q739" },
  Morocco: { code: "MA", qid: "Q1028" },
  Tunisia: { code: "TN", qid: "Q948" },
  Egypt: { code: "EG", qid: "Q79" },
  Lebanon: { code: "LB", qid: "Q822" },
  Turkey: { code: "TR", qid: "Q43" },
  Iran: { code: "IR", qid: "Q794" },
  "Saudi Arabia": { code: "SA", qid: "Q851" },
  India: { code: "IN", qid: "Q668" },
  Pakistan: { code: "PK", qid: "Q843" },
  "Sri Lanka": { code: "LK", qid: "Q854" },
  China: { code: "CN", qid: "Q148" },
  Japan: { code: "JP", qid: "Q17" },
  "South Korea": { code: "KR", qid: "Q884" },
  Thailand: { code: "TH", qid: "Q869" },
  Vietnam: { code: "VN", qid: "Q881" },
  Philippines: { code: "PH", qid: "Q928" },
  Indonesia: { code: "ID", qid: "Q252" },
  Italy: { code: "IT", qid: "Q38" },
  Greece: { code: "GR", qid: "Q41" },
  Spain: { code: "ES", qid: "Q29" },
  Canada: { code: "CA", qid: "Q16" },
  "United States": { code: "US", qid: "Q30" },
};

/** Real labels from Statistics Canada Table 18-10-0245-01 mapped to canonical ingredients. */
export const STATCAN_MAP: { label: string; key: string; grams?: number; perUnit?: boolean }[] = [
  { label: "Chicken thigh, per kilogram", key: "chicken" },
  { label: "Beef stewing cuts, per kilogram", key: "beef" },
  { label: "Ground beef, per kilogram", key: "beefmince" },
  { label: "Beef top sirloin cuts, per kilogram", key: "sirloin" },
  { label: "Pork shoulder cuts, per kilogram", key: "pork" },
  { label: "Salmon, per kilogram", key: "salmon" },
  { label: "Eggs, 1 dozen", key: "eggs", grams: 600 },
  { label: "Tomatoes, per kilogram", key: "tomato" },
  { label: "Onions, per kilogram", key: "onion" },
  { label: "Potatoes, per kilogram", key: "potato" },
  { label: "Sweet potatoes, per kilogram", key: "sweetpotato" },
  { label: "Carrots, 1.36 kilograms", key: "carrot", grams: 1360 },
  { label: "Cabbage, per kilogram", key: "cabbage" },
  { label: "Peppers, per kilogram", key: "redpepper" },
  { label: "Oranges, per kilogram", key: "orange" },
  { label: "Lemons, unit", key: "lemon", grams: 100, perUnit: true },
  { label: "Limes, unit", key: "lime", grams: 70, perUnit: true },
  { label: "Avocado, unit", key: "avocado", grams: 150, perUnit: true },
  { label: "Cucumber, unit", key: "cucumber", grams: 300, perUnit: true },
  { label: "Broccoli, unit", key: "broccoli", grams: 500, perUnit: true },
  { label: "Romaine lettuce, unit", key: "lettuce", grams: 400, perUnit: true },
  { label: "White rice, 2 kilograms", key: "rice", grams: 2000 },
  { label: "Dried lentils, 900 grams", key: "lentils", grams: 900 },
  { label: "Dry or fresh pasta, 500 grams", key: "pasta", grams: 500 },
  { label: "Wheat flour, 2.5 kilograms", key: "flour", grams: 2500 },
  { label: "White sugar, 2 kilograms", key: "sugar", grams: 2000 },
  { label: "Vegetable oil, 3 litres", key: "oil", grams: 3000 },
  { label: "Olive oil, 1 litre", key: "oliveoil", grams: 1000 },
  { label: "Butter, 454 grams", key: "butter", grams: 454 },
  { label: "Milk, 2 litres", key: "milk", grams: 2000 },
  { label: "Yogurt, 500 grams", key: "yogurt", grams: 500 },
  { label: "Tofu, 350 grams", key: "tofu", grams: 350 },
  { label: "Canned tomatoes, 796 millilitres", key: "passata", grams: 796 },
  { label: "Canned baked beans, 398 millilitres", key: "bakedbeans", grams: 398 },
  { label: "Peanuts, 450 grams", key: "peanuts", grams: 450 },
  { label: "Flatbread and pita, 500 grams", key: "flatbread", grams: 500 },
  { label: "White bread, 675 grams", key: "bread", grams: 675 },
  { label: "Soy milk, 1.89 litres", key: "plantmilk", grams: 1890 },
];
