import type { CuisinePick } from "../types";

/** Culinary regions → countries. Regions double as "broader palette" groups. */
export const REGIONS: { name: string; countries: string[] }[] = [
  {
    name: "West Africa",
    countries: [
      "Nigeria", "Ghana", "Senegal", "Côte d'Ivoire", "Sierra Leone", "Liberia", "The Gambia", "Mali",
      "Burkina Faso", "Benin", "Togo", "Guinea", "Guinea-Bissau", "Niger", "Cabo Verde", "Mauritania",
    ],
  },
  {
    name: "Central Africa",
    countries: ["Cameroon", "DR Congo", "Republic of the Congo", "Gabon", "Central African Republic", "Chad", "Equatorial Guinea", "Angola", "São Tomé and Príncipe"],
  },
  {
    name: "East Africa",
    countries: ["Ethiopia", "Eritrea", "Kenya", "Tanzania", "Uganda", "Rwanda", "Burundi", "Somalia", "Djibouti", "South Sudan", "Sudan"],
  },
  {
    name: "Southern Africa",
    countries: ["South Africa", "Zimbabwe", "Zambia", "Mozambique", "Malawi", "Botswana", "Namibia", "Lesotho", "Eswatini", "Madagascar", "Mauritius"],
  },
  { name: "North Africa", countries: ["Morocco", "Algeria", "Tunisia", "Libya", "Egypt"] },
  {
    name: "Caribbean",
    countries: [
      "Jamaica", "Trinidad and Tobago", "Haiti", "Barbados", "Dominican Republic", "Cuba", "Puerto Rico", "Guyana",
      "Suriname", "Grenada", "Saint Lucia", "Bahamas", "Antigua and Barbuda", "Saint Vincent and the Grenadines",
      "Dominica", "Saint Kitts and Nevis", "Belize",
    ],
  },
  { name: "Mexico & Central America", countries: ["Mexico", "Guatemala", "El Salvador", "Honduras", "Nicaragua", "Costa Rica", "Panama"] },
  { name: "South America", countries: ["Brazil", "Colombia", "Peru", "Venezuela", "Argentina", "Chile", "Ecuador", "Bolivia", "Paraguay", "Uruguay"] },
  {
    name: "Middle East & Levant",
    countries: ["Lebanon", "Syria", "Palestine", "Jordan", "Israel", "Iraq", "Iran", "Turkey", "Saudi Arabia", "Yemen", "United Arab Emirates", "Oman", "Kuwait", "Qatar", "Bahrain"],
  },
  { name: "South Asia", countries: ["India", "Pakistan", "Bangladesh", "Sri Lanka", "Nepal", "Afghanistan", "Bhutan", "Maldives"] },
  { name: "East Asia", countries: ["China", "Japan", "South Korea", "Taiwan", "Hong Kong", "Mongolia"] },
  { name: "Southeast Asia", countries: ["Thailand", "Vietnam", "Philippines", "Indonesia", "Malaysia", "Singapore", "Cambodia", "Laos", "Myanmar", "Timor-Leste"] },
  { name: "Central Asia", countries: ["Uzbekistan", "Kazakhstan", "Kyrgyzstan", "Tajikistan", "Turkmenistan"] },
  { name: "Mediterranean Europe", countries: ["Italy", "Greece", "Spain", "Portugal", "Cyprus", "Malta", "Croatia"] },
  {
    name: "Western & Northern Europe",
    countries: ["France", "United Kingdom", "Ireland", "Germany", "Netherlands", "Belgium", "Switzerland", "Austria", "Sweden", "Norway", "Denmark", "Finland", "Iceland"],
  },
  {
    name: "Eastern Europe & Caucasus",
    countries: ["Poland", "Ukraine", "Hungary", "Romania", "Czechia", "Slovakia", "Serbia", "Bulgaria", "Bosnia and Herzegovina", "Georgia", "Armenia", "Azerbaijan", "Russia"],
  },
  { name: "North America", countries: ["United States", "Canada"] },
  { name: "Oceania & Pacific", countries: ["Australia", "New Zealand", "Fiji", "Samoa", "Tonga", "Papua New Guinea"] },
];

const regionOfCountry = new Map<string, string>();
for (const r of REGIONS) for (const c of r.countries) regionOfCountry.set(c, r.name);

export function regionOf(country: string): string | undefined {
  return regionOfCountry.get(country);
}

export const ALL_COUNTRIES = REGIONS.flatMap((r) => r.countries).sort((a, b) => a.localeCompare(b));

/** One-tap blends for a broader palette; each expands to real picks. */
export const BLENDS: { name: string; picks: CuisinePick[] }[] = [
  { name: "Afro-Caribbean", picks: [{ type: "region", value: "West Africa" }, { type: "region", value: "Caribbean" }] },
  { name: "Nigerian × Jamaican", picks: [{ type: "country", value: "Nigeria" }, { type: "country", value: "Jamaica" }] },
  {
    name: "Mediterranean",
    picks: [
      { type: "region", value: "Mediterranean Europe" },
      { type: "country", value: "Lebanon" },
      { type: "country", value: "Morocco" },
      { type: "country", value: "Tunisia" },
    ],
  },
  { name: "Pan-African", picks: ["West Africa", "Central Africa", "East Africa", "Southern Africa", "North Africa"].map((v) => ({ type: "region" as const, value: v })) },
  { name: "Latin American", picks: [{ type: "region", value: "Mexico & Central America" }, { type: "region", value: "South America" }] },
  { name: "South × East Asian", picks: [{ type: "region", value: "South Asia" }, { type: "region", value: "East Asia" }] },
  { name: "Silk Road", picks: ["Iran", "Turkey", "Uzbekistan", "Afghanistan", "China"].map((v) => ({ type: "country" as const, value: v })) },
];

export function pickLabel(p: CuisinePick): string {
  return p.type === "region" ? `${p.value} (all)` : p.value;
}

export function samePick(a: CuisinePick, b: CuisinePick) {
  return a.type === b.type && a.value === b.value;
}
