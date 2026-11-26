/**
 * Nearby specialty grocers and restaurants. Pure helpers (no network) so they
 * can be tested; the API route does the fetching.
 *
 * Privacy: callers pass coordinates already rounded to about 1 km; nothing
 * here stores or logs them.
 */
import { STORE_NAME_PATTERN, type StoreKind } from "../data/specialty";

export interface Place {
  id: string;
  name: string;
  kind: "grocer" | "restaurant";
  lat: number;
  lon: number;
  distanceKm: number;
  address?: string;
  /** Opens directions or the place page in the person's own maps app. */
  url: string;
  source: "osm" | "google";
  tags?: string[];
}

/** About 1.1 km of precision: enough to find shops, too coarse to identify a home. */
export const coarse = (n: number) => Math.round(n * 100) / 100;

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

const safeRe = (s: string) => s.replace(/[^a-z0-9_|& ]/gi, "");

const SHOPS = "supermarket|convenience|greengrocer|deli|butcher|food|grocery|seafood|spices";

export function overpassQuery(want: "grocers" | "restaurants", lat: number, lon: number, opts: { kinds?: StoreKind[]; cuisines?: string[] }): string {
  const around = `(around:${want === "grocers" ? 12000 : 6000},${coarse(lat)},${coarse(lon)})`;
  if (want === "grocers") {
    const names = safeRe((opts.kinds ?? []).map((k) => STORE_NAME_PATTERN[k]).join("|"));
    if (!names) return "";
    return `[out:json][timeout:20];(nwr["shop"~"^(${SHOPS})$"]["name"~"${names}",i]${around};nwr["shop"]["origin"]${around};);out center tags 80;`;
  }
  const cuisines = safeRe((opts.cuisines ?? []).join("|"));
  if (!cuisines) return "";
  return `[out:json][timeout:20];nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["cuisine"~"(^|;)(${cuisines})($|;)",i]${around};out center tags 80;`;
}

interface OsmEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function parseOverpass(json: { elements?: OsmEl[] }, want: "grocers" | "restaurants", from: { lat: number; lon: number }, limit = 15): Place[] {
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const e of json.elements ?? []) {
    const t = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!t.name || lat == null || lon == null) continue;
    const key = `${t.name.toLowerCase()}@${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    out.push({
      id: `osm:${e.type}/${e.id}`,
      name: t.name,
      kind: want === "grocers" ? "grocer" : "restaurant",
      lat,
      lon,
      distanceKm: Math.round(distanceKm(from.lat, from.lon, lat, lon) * 10) / 10,
      address: [street, t["addr:city"]].filter(Boolean).join(", ") || undefined,
      url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      source: "osm",
      tags: (want === "restaurants" ? t.cuisine : t.origin ?? t.shop)?.split(";").map((x) => x.trim().replace(/_/g, " ")).slice(0, 3),
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}

/** Google Places (New) Text Search result → Place. */
export function fromGoogle(p: { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; googleMapsUri?: string }, kind: Place["kind"], from: { lat: number; lon: number }): Place | null {
  if (!p.displayName?.text || !p.location) return null;
  return {
    id: `google:${p.id}`,
    name: p.displayName.text,
    kind,
    lat: p.location.latitude,
    lon: p.location.longitude,
    distanceKm: Math.round(distanceKm(from.lat, from.lon, p.location.latitude, p.location.longitude) * 10) / 10,
    address: p.formattedAddress,
    url: p.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.displayName.text)}&query_place_id=${p.id}`,
    source: "google",
  };
}
