import { REGIONS } from "./countries";
import type { CuisinePick } from "../types";

/**
 * Ingredients big-box stores often don't stock, and the kind of shop that
 * usually does. Used to point people to local specialty grocers.
 */
export type StoreKind = "african" | "caribbean" | "latin" | "south_asian" | "asian" | "middle_eastern";

export const STORE_LABEL: Record<StoreKind, string> = {
  african: "African",
  caribbean: "Caribbean",
  latin: "Latin American",
  south_asian: "South Asian",
  asian: "Asian",
  middle_eastern: "Middle Eastern & halal",
};

export const SPECIALTY: Record<string, StoreKind[]> = {
  ugu: ["african"],
  yam: ["african", "caribbean"],
  egusi: ["african"],
  garri: ["african"],
  crayfish: ["african"],
  palmoil: ["african"],
  honeybeans: ["african"],
  sausage: ["african"],
  scotch: ["african", "caribbean"],
  plantain: ["african", "caribbean", "latin"],
  greenplantain: ["african", "caribbean", "latin"],
  ackee: ["caribbean"],
  saltfish: ["caribbean", "african"],
  jerkpaste: ["caribbean"],
  masarepa: ["latin"],
  chipotle: ["latin"],
  tortilla: ["latin"],
  poha: ["south_asian"],
  paneer: ["south_asian"],
  gochujang: ["asian"],
  miso: ["asian"],
  mirin: ["asian"],
  kecapmanis: ["asian"],
  fishsauce: ["asian"],
  lemongrass: ["asian", "south_asian"],
  greencurrypaste: ["asian"],
  zaatar: ["middle_eastern"],
};

/** Words in shop names that signal each kind of grocer (OpenStreetMap search). */
export const STORE_NAME_PATTERN: Record<StoreKind, string> = {
  african: "afric|afro|naija|nigeri|ghana|kenya|ethiop|somali|eritre|camero|congo|tropical",
  caribbean: "caribbean|jamaic|west indi|trini|haiti|guyan|island",
  latin: "latin|latino|mexic|hispan|tienda|mercado|carnicer|bodega|colombia|peru|brasil|brazil",
  south_asian: "indian|india|desi|pakistan|bangla|sri lank|punjab|patel|apna",
  asian: "asian|asia|korean|japan|chinese|china|thai|vietnam|viet|filipin|oriental|h mart|t&t|ranch|oriental",
  middle_eastern: "halal|middle east|arab|persian|iran|turk|leban|levant|afghan|mediterr",
};

/** Geoapify restaurant categories (catering.restaurant.*) per region. */
const REGION_CUISINES: Record<string, string[]> = {
  "West Africa": ["african"],
  "Central Africa": ["african"],
  "East Africa": ["african", "ethiopian"],
  "Southern Africa": ["african"],
  "North Africa": ["moroccan", "arab", "mediterranean"],
  Caribbean: ["caribbean", "jamaican", "cuban"],
  "Mexico & Central America": ["mexican", "tacos", "latin_american"],
  "South America": ["brazilian", "peruvian", "argentinian", "bolivian", "latin_american"],
  "Middle East & Levant": ["lebanese", "syrian", "persian", "turkish", "arab", "kebab"],
  "South Asia": ["indian", "pakistani", "nepalese", "afghan", "curry"],
  "East Asia": ["chinese", "japanese", "korean", "taiwanese", "dumpling", "ramen"],
  "Southeast Asia": ["thai", "vietnamese", "filipino", "indonesian", "malaysian", "malay"],
  "Central Asia": ["uzbek"],
  "Mediterranean Europe": ["italian", "greek", "spanish", "portuguese", "mediterranean"],
  "Western & Northern Europe": ["french", "german", "irish", "belgian", "swedish", "danish", "european"],
  "Eastern Europe & Caucasus": ["russian", "ukrainian", "georgian", "hungarian", "czech", "balkan"],
  "North America": ["american", "barbecue"],
  "Oceania & Pacific": ["hawaiian"],
};

/** Country picks whose own cuisine has a Geoapify category. */
const COUNTRY_CUISINE: Record<string, string> = {
  Jamaica: "jamaican",
  Ethiopia: "ethiopian",
  Cuba: "cuban",
  Mexico: "mexican",
  Brazil: "brazilian",
  Peru: "peruvian",
  Lebanon: "lebanese",
  Syria: "syrian",
  Iran: "persian",
  Turkey: "turkish",
  India: "indian",
  Pakistan: "pakistani",
  Nepal: "nepalese",
  Afghanistan: "afghan",
  China: "chinese",
  Japan: "japanese",
  "South Korea": "korean",
  Taiwan: "taiwanese",
  Thailand: "thai",
  Vietnam: "vietnamese",
  Philippines: "filipino",
  Indonesia: "indonesian",
  Malaysia: "malaysian",
  Morocco: "moroccan",
  Italy: "italian",
  Greece: "greek",
  Spain: "spanish",
  Portugal: "portuguese",
  France: "french",
  Germany: "german",
};

const REGION_STORE: Record<string, StoreKind> = {
  "West Africa": "african",
  "Central Africa": "african",
  "East Africa": "african",
  "Southern Africa": "african",
  "North Africa": "middle_eastern",
  Caribbean: "caribbean",
  "Mexico & Central America": "latin",
  "South America": "latin",
  "Middle East & Levant": "middle_eastern",
  "South Asia": "south_asian",
  "East Asia": "asian",
  "Southeast Asia": "asian",
};

const regionOf = (country: string) => REGIONS.find((r) => r.countries.includes(country))?.name;

function pickRegions(picks: CuisinePick[]): string[] {
  return [...new Set(picks.map((p) => (p.type === "region" ? p.value : regionOf(p.value))).filter((x): x is string => !!x))];
}

/** Geoapify restaurant categories for cuisine picks, most specific first. */
export function restaurantCategories(picks: CuisinePick[]): string[] {
  const own = picks.filter((p) => p.type === "country").map((p) => COUNTRY_CUISINE[p.value]).filter((x): x is string => !!x);
  const fromRegions = pickRegions(picks).flatMap((r) => REGION_CUISINES[r] ?? []);
  return [...new Set([...own, ...fromRegions])].slice(0, 8).map((c) => `catering.restaurant.${c}`);
}

/** Which kinds of specialty grocer serve a household's cuisines and this list's hard-to-find items. */
export function storeKinds(picks: CuisinePick[], itemKeys: string[] = []): StoreKind[] {
  const kinds = new Set<StoreKind>();
  for (const r of pickRegions(picks)) if (REGION_STORE[r]) kinds.add(REGION_STORE[r]);
  for (const k of itemKeys) for (const s of SPECIALTY[k] ?? []) kinds.add(s);
  return [...kinds];
}
