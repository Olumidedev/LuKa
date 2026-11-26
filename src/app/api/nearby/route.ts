import { NextResponse } from "next/server";
import { GROCER_CATEGORIES, SEARCH_RADIUS_M, cellKey, coarse, geoapifyUrl, namePattern, parseGeoapify, toPlace, type Place } from "@/lib/connectors/places";
import { STORE_LABEL, type StoreKind } from "@/lib/data/specialty";
import { requireUser } from "@/lib/server/auth";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";
import { supabaseAdmin } from "@/lib/server/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FRESH_MS = 30 * 86_400_000;

/**
 * Specialty grocers or restaurants near a coarse (~1 km) location.
 * Answered from the Supabase cache; Geoapify is only called for an area
 * (≈5 km cell) and category that hasn't been fetched in the last 30 days.
 */
export async function POST(req: Request) {
  if (!rateLimit(`nearby:${clientIp(req)}`, 10)) return NextResponse.json({ error: "One moment. Too many searches." }, { status: 429 });
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const key = process.env.GEOAPIFY_API_KEY;
  const db = supabaseAdmin();
  if (!key || !db) return NextResponse.json({ error: "Nearby search is coming soon." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { lat?: number; lon?: number; want?: string; kinds?: string[]; categories?: string[] };
  const lat = coarse(Number(b.lat));
  const lon = coarse(Number(b.lon));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return NextResponse.json({ error: "Location unavailable." }, { status: 400 });
  const kind: Place["kind"] = b.want === "restaurants" ? "restaurant" : "grocer";
  const kinds = (b.kinds ?? []).filter((k): k is StoreKind => k in STORE_LABEL).slice(0, 6);
  const categories = (b.categories ?? []).filter((c) => /^catering\.restaurant\.[a-z_]+$/.test(String(c))).slice(0, 8);
  if (kind === "restaurant" && !categories.length) return NextResponse.json({ places: [] });

  try {
    // 1. Which parts of this area are missing or stale in the cache?
    const wanted = kind === "grocer" ? ["all"] : categories;
    const cells = wanted.map((c) => ({ category: c, cell: cellKey(kind, c, lat, lon) }));
    const { data: known } = await db.from("nearby_search_cells").select("cell, fetched_at").in("cell", cells.map((c) => c.cell));
    const fresh = new Set((known ?? []).filter((k) => Date.now() - Date.parse(k.fetched_at as string) < FRESH_MS).map((k) => k.cell as string));
    const missing = cells.filter((c) => !fresh.has(c.cell));

    // 2. Fetch only those from Geoapify (one request), then store places and cells.
    let fetched = 0;
    if (missing.length) {
      const cats = kind === "grocer" ? GROCER_CATEGORIES : missing.map((m) => m.category);
      const res = await fetch(geoapifyUrl(kind, cats, lat, lon, key), { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Geoapify answered ${res.status}`);
      const rows = parseGeoapify(await res.json(), kind);
      fetched = rows.length;
      for (let i = 0; i < rows.length; i += 250) {
        const { error } = await db.from("nearby_places").upsert(rows.slice(i, i + 250), { onConflict: "id" });
        if (error) throw new Error(`cache: ${error.message}`);
      }
      await db.from("nearby_search_cells").upsert(missing.map((m) => ({ cell: m.cell, fetched_at: new Date().toISOString(), results: rows.length })), { onConflict: "cell" });
    }

    // 3. Answer from the cache.
    const { data, error } = await db.rpc("nearby_places_within", {
      p_lat: lat,
      p_lon: lon,
      p_radius_m: SEARCH_RADIUS_M[kind],
      p_kind: kind,
      p_categories: kind === "restaurant" ? categories : null,
      p_name_pattern: kind === "grocer" ? namePattern(kinds) : null,
      p_limit: 15,
    });
    if (error) throw new Error(`cache read: ${error.message}`);
    const places = ((data ?? []) as Parameters<typeof toPlace>[0][]).map((r) => toPlace(r, kind));
    return NextResponse.json({ places, cached: !missing.length, fetched }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[nearby]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't search nearby right now. Try again in a minute." }, { status: 502 });
  }
}
