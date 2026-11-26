"use client";

import { useState } from "react";
import { call, useFeatures } from "@/lib/ai/client";
import type { Place } from "@/lib/connectors/places";
import { track } from "@/lib/analytics";
import type { StoreKind } from "@/lib/data/specialty";
import { Button, Sheet, Tag } from "../ui";

export interface NearbyQuery {
  want: "grocers" | "restaurants";
  title: string;
  /** Text for an OpenStreetMap search that shares no location with LUKA. */
  mapsQuery: string;
  kinds?: StoreKind[];
  categories?: string[];
}

const coarse = (n: number) => Math.round(n * 100) / 100;

/** Specialty grocers or restaurants nearby. Location is read once, rounded to ~1 km, and never saved. */
export function NearbySheet({ query, onClose }: { query: NearbyQuery | null; onClose: () => void }) {
  const features = useFeatures();
  const [state, setState] = useState<"idle" | "locating" | "searching" | "done" | "error">("idle");
  const [places, setPlaces] = useState<Place[]>([]);
  const [msg, setMsg] = useState("");

  const close = () => {
    setState("idle");
    setPlaces([]);
    setMsg("");
    onClose();
  };

  const osmSearch = query ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(query.mapsQuery)}` : "#";

  const search = () => {
    if (!query) return;
    if (!("geolocation" in navigator)) {
      setState("error");
      setMsg("This browser can't share a location.");
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setState("searching");
        try {
          const res = await call<{ places: Place[] }>("/api/nearby", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ lat: coarse(pos.coords.latitude), lon: coarse(pos.coords.longitude), want: query.want, kinds: query.kinds, categories: query.categories }),
          });
          setPlaces(res.places);
          setState("done");
          track("nearby_searched", { want: query.want, results: res.places.length });
        } catch (e) {
          setState("error");
          setMsg(e instanceof Error ? e.message : "Couldn't search right now.");
        }
      },
      () => {
        setState("error");
        setMsg("Location is off for LUKA.");
      },
      { enableHighAccuracy: false, maximumAge: 600_000, timeout: 15_000 },
    );
  };

  const osmLink = (label: string) => (
    <a href={osmSearch} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:bg-sunk">
      {label}
    </a>
  );

  return (
    <Sheet open={!!query} onClose={close} title={query?.title ?? ""}>
      <div className="grid gap-4">
        {!features.nearby ? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Tag tone="saffron">Premium · coming soon</Tag>
              <span className="text-muted">LUKA will list specialty grocers and restaurants near you.</span>
            </p>
            <div>{osmLink("Search OpenStreetMap for now")}</div>
          </>
        ) : state === "idle" ? (
          <>
            <p className="text-sm text-muted">LUKA uses your approximate location (to about 1 km) once, for this search, and doesn&apos;t save it.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={search}>
                Use my location
              </Button>
              {osmLink("Search a map instead")}
            </div>
          </>
        ) : state === "locating" || state === "searching" ? (
          <p className="text-sm text-muted">{state === "locating" ? "Finding where you are…" : "Looking nearby…"}</p>
        ) : state === "error" ? (
          <>
            <p className="text-sm text-danger">{msg}</p>
            <div>{osmLink("Search a map instead")}</div>
          </>
        ) : (
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
                      Map
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing listed nearby yet. Community maps miss many small shops.</p>
            )}
            <p className="text-[12px] text-muted">
              Powered by{" "}
              <a className="underline" href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">
                Geoapify
              </a>{" "}
              ·{" "}
              <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                © OpenStreetMap contributors
              </a>
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}
