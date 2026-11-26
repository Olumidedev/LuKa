/**
 * Nearby specialty grocers and restaurants via Geoapify Places (OpenStreetMap
 * data), cached in Supabase (PostGIS). Pure helpers here; the API route does
 * the fetching and caching.
 *
 * Privacy: coordinates arrive rounded to ~1 km; the cache stores only places
 * and ~5 km search cells, never who searched or from exactly where.
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
  website?: string;
  /** Opens the place in OpenStreetMap. */
  url: string;
  tags?: string[];
}

/** About 1.1 km of precision: enough to find shops, too coarse to identify a home. */
export const coarse = (n: number) => Math.round(n * 100) / 100;

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLon - aLon) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export const SEARCH_RADIUS_M = { grocer: 10_000, restaurant: 6_000 } as const;
/** Cache cells are 0.05° (≈5.5 km); each fetch covers the cell plus the search radius. */
const CELL = 0.05;
export const GROCER_CATEGORIES = ["commercial.supermarket", "commercial.convenience", "commercial.food_and_drink", "commercial.marketplace"];

export function cellCenter(lat: number, lon: number) {
  const la = Math.floor(lat / CELL) * CELL + CELL / 2;
  const lo = Math.floor(lon / CELL) * CELL + CELL / 2;
  return { lat: Math.round(la * 1000) / 1000, lon: Math.round(lo * 1000) / 1000 };
}
export function cellKey(kind: Place["kind"], category: string, lat: number, lon: number) {
  const c = cellCenter(lat, lon);
  return `${kind}:${category}:${c.lat.toFixed(3)}:${c.lon.toFixed(3)}`;
}
/** Radius that covers the whole cell plus the search radius from any point in it. */
export const fetchRadius = (kind: Place["kind"]) => SEARCH_RADIUS_M[kind] + 4_500;

export function geoapifyUrl(kind: Place["kind"], categories: string[], lat: number, lon: number, apiKey: string): string {
  const c = cellCenter(lat, lon);
  const u = new URL("https://api.geoapify.com/v2/places");
  u.searchParams.set("categories", categories.join(","));
  u.searchParams.set("filter", `circle:${c.lon},${c.lat},${fetchRadius(kind)}`);
  u.searchParams.set("bias", `proximity:${c.lon},${c.lat}`);
  u.searchParams.set("limit", "500");
  u.searchParams.set("apiKey", apiKey);
  return u.toString();
}

export interface CacheRow {
  id: string;
  name: string;
  kind: Place["kind"];
  categories: string[];
  geom: string;
  address: string | null;
  website: string | null;
  fetched_at: string;
}

interface GeoFeature {
  properties?: { place_id?: string; name?: string; categories?: string[]; address_line2?: string; formatted?: string; website?: string; lat?: number; lon?: number };
  geometry?: { type: string; coordinates?: [number, number] };
}

export function parseGeoapify(json: { features?: GeoFeature[] }, kind: Place["kind"], now = new Date()): CacheRow[] {
  const out = new Map<string, CacheRow>();
  for (const f of json.features ?? []) {
    const p = f.properties ?? {};
    const lon = p.lon ?? f.geometry?.coordinates?.[0];
    const lat = p.lat ?? f.geometry?.coordinates?.[1];
    if (!p.place_id || !p.name || lat == null || lon == null) continue;
    out.set(p.place_id, {
      id: `geoapify:${p.place_id}`,
      name: p.name.slice(0, 200),
      kind,
      categories: (p.categories ?? []).filter((c) => c.startsWith("catering.") || c.startsWith("commercial.")).slice(0, 20),
      geom: `SRID=4326;POINT(${lon} ${lat})`,
      address: (p.address_line2 ?? p.formatted ?? null)?.slice(0, 300) ?? null,
      website: p.website && /^https?:\/\//.test(p.website) ? p.website.slice(0, 300) : null,
      fetched_at: now.toISOString(),
    });
  }
  return [...out.values()];
}

/** Regex for specialty grocers' names (safe for Postgres ~*). */
export const namePattern = (kinds: StoreKind[]) => kinds.map((k) => STORE_NAME_PATTERN[k]).join("|").replace(/[^a-z0-9|& ]/gi, "") || null;

export function toPlace(r: { id: string; name: string; categories: string[]; lat: number; lon: number; distance_m: number; address: string | null; website: string | null }, kind: Place["kind"]): Place {
  return {
    id: r.id,
    name: r.name,
    kind,
    lat: r.lat,
    lon: r.lon,
    distanceKm: Math.round(r.distance_m / 100) / 10,
    address: r.address ?? undefined,
    website: r.website ?? undefined,
    url: `https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=18/${r.lat}/${r.lon}`,
    tags: r.categories
      .filter((c) => c.startsWith("catering.restaurant.") || c === "commercial.supermarket" || c === "commercial.convenience")
      .map((c) => c.split(".").pop()!.replace(/_/g, " "))
      .slice(0, 3),
  };
}
