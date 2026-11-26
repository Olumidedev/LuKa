"use client";

import { useState } from "react";
import { call, useFeatures } from "@/lib/ai/client";
import { searchOsm, type Place } from "@/lib/connectors/places";
import { track } from "@/lib/analytics";
import type { StoreKind } from "@/lib/data/specialty";
import { Button, Sheet } from "../ui";

export interface NearbyQuery {
  want: "grocers" | "restaurants";
  title: string;
  /** What to search for on Google Maps without sharing a location with LUKA. */
  mapsQuery: string;
  kinds?: StoreKind[];
  cuisines?: string[];
  cuisineNames?: string[];
}

const coarse = (n: number) => Math.round(n * 100) / 100;

/** Finds specialty grocers or restaurants nearby. Location is read once, rounded to ~1 km, and never saved. */
export function NearbySheet({ query, onClose }: { query: NearbyQuery | null; onClose: () => void }) {
  const features = useFeatures();
  const [state, setState] = useState<"idle" | "locating" | "searching" | "done" | "error">("idle");
  const [places, setPlaces] = useState<Place[]>([]);
  const [source, setSource] = useState<"osm" | "google">("osm");
  const [msg, setMsg] = useState("");

  const close = () => {
    setState("idle");
    setPlaces([]);
    setMsg("");
    onClose();
  };

  const search = () => {
    if (!query) return;
    if (!("geolocation" in navigator)) {
      setState("error");
      setMsg("This browser can't share a location. Use the Google Maps search instead.");
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setState("searching");
        try {
          const lat = coarse(pos.coords.latitude);
          const lon = coarse(pos.coords.longitude);
          const res =
            features.places === "google"
              ? await call<{ places: Place[]; source: "osm" | "google" }>("/api/nearby", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ lat, lon, want: query.want, kinds: query.kinds, cuisineNames: query.cuisineNames }),
                })
              : { places: await searchOsm(query.want, lat, lon, { kinds: query.kinds, cuisines: query.cuisines }), source: "osm" as const };
          setPlaces(res.places);
          setSource(res.source);
          setState("done");
          track("nearby_searched", { want: query.want, results: res.places.length });
        } catch (e) {
          setState("error");
          console.warn("[nearby]", e);
          setMsg("Couldn't search nearby right now. Google Maps works instead.");
        }
      },
      () => {
        setState("error");
        setMsg("Location is off for LUKA. You can still search on Google Maps below.");
      },
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 15_000 },
    );
  };

  const maps = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.mapsQuery)}` : "#";

  return (
    <Sheet open={!!query} onClose={close} title={query?.title ?? ""}>
      <div className="grid gap-4">
        {state === "idle" && (
          <>
            <p className="text-sm text-muted">
              LUKA uses your approximate location (to about 1 km) once, for this search, and doesn&apos;t save it. {features.places === "google" ? "Results come from Google Maps." : "Your browser asks OpenStreetMap directly."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={search}>
                Use my location
              </Button>
              <a href={maps} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:bg-sunk">
                Search on Google Maps instead
              </a>
            </div>
          </>
        )}
        {(state === "locating" || state === "searching") && <p className="text-sm text-muted">{state === "locating" ? "Finding where you are…" : "Looking nearby…"}</p>}
        {state === "error" && (
          <>
            <p className="text-sm text-danger">{msg}</p>
            <a href={maps} target="_blank" rel="noopener noreferrer" className="justify-self-start text-sm font-semibold underline">
              Search on Google Maps
            </a>
          </>
        )}
        {state === "done" && (
          <>
            {places.length ? (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {places.map((p) => (
                  <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-[13px] text-muted">
                        {p.distanceKm} km{p.address ? ` · ${p.address}` : ""}
                        {p.tags?.length ? ` · ${p.tags.join(", ")}` : ""}
                      </p>
                    </div>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-sm font-semibold text-[#065F46] underline dark:text-leaf">
                      Open map
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing tagged nearby yet. Community maps miss many small shops, so try Google Maps too.</p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
              <a href={maps} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                More on Google Maps
              </a>
              {source === "osm" ? (
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                  © OpenStreetMap contributors
                </a>
              ) : (
                <span>Results from Google Maps</span>
              )}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
