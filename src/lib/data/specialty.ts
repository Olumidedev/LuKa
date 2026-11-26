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

/** OpenStreetMap `cuisine=*` values per region, for restaurants. */
const REGION_CUISINES: Record<string, string> = {
  "West Africa": "african|west_african|nigerian|ghanaian|senegalese|ivorian|liberian|sierra_leonean",
  "Central Africa": "african|cameroonian|congolese",
  "East Africa": "african|ethiopian|eritrean|somali|kenyan|ugandan|tanzanian",
  "Southern Africa": "african|south_african|zimbabwean",
  "North Africa": "moroccan|algerian|tunisian|egyptian|libyan|north_african",
  Caribbean: "caribbean|jamaican|trinidadian|haitian|cuban|dominican|puerto_rican|barbadian|guyanese",
  "Mexico & Central America": "mexican|salvadoran|guatemalan|honduran|latin_american",
  "South America": "brazilian|colombian|peruvian|venezuelan|argentinian|chilean|ecuadorian|latin_american",
  "Middle East & Levant": "lebanese|syrian|turkish|persian|iranian|iraqi|palestinian|middle_eastern|arab|kebab|falafel",
  "South Asia": "indian|pakistani|bangladeshi|sri_lankan|nepalese|afghan",
  "East Asia": "chinese|japanese|korean|taiwanese|cantonese|sushi|ramen",
  "Southeast Asia": "thai|vietnamese|filipino|indonesian|malaysian|singaporean|cambodian|laotian|burmese",
  "Central Asia": "uzbek|kazakh|central_asian",
  "Mediterranean Europe": "italian|greek|spanish|portuguese|pizza",
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

/** Restaurant cuisine tags for a household's picks (country names add their own demonym when OSM uses it). */
export function cuisineTags(picks: CuisinePick[]): string[] {
  const own = picks.filter((p) => p.type === "country").map((p) => p.value.toLowerCase().replace(/\s+/g, "_"));
  const fromRegions = pickRegions(picks).flatMap((r) => (REGION_CUISINES[r] ?? "").split("|")).filter(Boolean);
  return [...new Set([...fromRegions, ...own])].slice(0, 40);
}

/** Which kinds of specialty grocer serve a household's cuisines and this list's hard-to-find items. */
export function storeKinds(picks: CuisinePick[], itemKeys: string[] = []): StoreKind[] {
  const kinds = new Set<StoreKind>();
  for (const r of pickRegions(picks)) if (REGION_STORE[r]) kinds.add(REGION_STORE[r]);
  for (const k of itemKeys) for (const s of SPECIALTY[k] ?? []) kinds.add(s);
  return [...kinds];
}
