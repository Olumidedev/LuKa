import { NextResponse } from "next/server";
import { coarse, fromGoogle, type Place } from "@/lib/connectors/places";
import { STORE_LABEL, type StoreKind } from "@/lib/data/specialty";
import { requireUser } from "@/lib/server/auth";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function viaGoogle(want: "grocers" | "restaurants", lat: number, lon: number, kinds: StoreKind[], cuisineNames: string[]) {
  const key = process.env.GOOGLE_MAPS_API_KEY!;
  const queries = want === "grocers" ? kinds.slice(0, 3).map((k) => `${STORE_LABEL[k]} grocery store`) : cuisineNames.slice(0, 2).map((c) => `${c} restaurant`);
  const all: Place[] = [];
  for (const textQuery of queries) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        // Only the fields shown: keeps each call in the cheaper SKU.
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri",
      },
      body: JSON.stringify({ textQuery, maxResultCount: 8, locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius: want === "grocers" ? 12000 : 6000 } } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Google Places answered ${res.status}`);
    const data = (await res.json()) as { places?: Parameters<typeof fromGoogle>[0][] };
    for (const p of data.places ?? []) {
      const pl = fromGoogle(p, want === "grocers" ? "grocer" : "restaurant", { lat, lon });
      if (pl && !all.some((x) => x.id === pl.id)) all.push(pl);
    }
  }
  return all.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 15);
}

/** Google Places search (when GOOGLE_MAPS_API_KEY is set; the key never reaches the browser). Coarse location, nothing stored or logged. */
export async function POST(req: Request) {
  if (!rateLimit(`nearby:${clientIp(req)}`, 10)) return NextResponse.json({ error: "One moment. Too many searches." }, { status: 429 });
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { lat?: number; lon?: number; want?: string; kinds?: string[]; cuisineNames?: string[] };
  const lat = coarse(Number(b.lat));
  const lon = coarse(Number(b.lon));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return NextResponse.json({ error: "Location unavailable." }, { status: 400 });
  const want = b.want === "restaurants" ? "restaurants" : "grocers";
  const kinds = (b.kinds ?? []).filter((k): k is StoreKind => k in STORE_LABEL).slice(0, 6);
  const cuisineNames = (b.cuisineNames ?? []).map((s) => String(s).slice(0, 40)).slice(0, 4);
  if (!process.env.GOOGLE_MAPS_API_KEY) return NextResponse.json({ error: "Nearby search runs on OpenStreetMap from your browser." }, { status: 501 });
  try {
    return NextResponse.json({ places: await viaGoogle(want, lat, lon, kinds, cuisineNames), source: "google" }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[nearby] google:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't search nearby right now. Try again in a minute." }, { status: 502 });
  }
}
