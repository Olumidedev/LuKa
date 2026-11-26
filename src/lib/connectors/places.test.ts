import { describe, expect, it } from "vitest";
import { cuisineTags, storeKinds } from "../data/specialty";
import { coarse, fromGoogle, overpassQuery, parseOverpass } from "./places";

describe("nearby places", () => {
  it("rounds location to about a kilometre", () => {
    expect(coarse(43.653226)).toBe(43.65);
    expect(coarse(-79.383184)).toBe(-79.38);
  });
  it("maps a Nigerian + Jamaican household to grocers and restaurant cuisines", () => {
    const picks = [{ type: "country" as const, value: "Nigeria" }, { type: "country" as const, value: "Jamaica" }];
    expect(storeKinds(picks, ["ugu", "gochujang"])).toEqual(["african", "caribbean", "asian"]);
    const tags = cuisineTags(picks);
    expect(tags).toContain("nigerian");
    expect(tags).toContain("jamaican");
  });
  it("builds Overpass queries with coarse coordinates and no injection", () => {
    const q = overpassQuery("grocers", 43.653226, -79.383184, { kinds: ["african"] });
    expect(q).toContain("around:12000,43.65,-79.38");
    expect(q).toContain('["name"~"afric|afro');
    const bad = overpassQuery("restaurants", 1, 2, { cuisines: ['x"];out;(node'] });
    expect(bad).not.toContain('"];out;(');
    expect(overpassQuery("grocers", 1, 2, { kinds: [] })).toBe("");
  });
  it("parses Overpass results, nearest first, deduplicated", () => {
    const from = { lat: 43.65, lon: -79.38 };
    const places = parseOverpass(
      {
        elements: [
          { type: "node", id: 1, lat: 43.7, lon: -79.4, tags: { name: "Far African Market", shop: "supermarket" } },
          { type: "way", id: 2, center: { lat: 43.66, lon: -79.38 }, tags: { name: "Naija Foods", shop: "convenience", "addr:housenumber": "12", "addr:street": "Queen St" } },
          { type: "node", id: 3, lat: 43.66, lon: -79.38, tags: { name: "Naija Foods" } },
          { type: "node", id: 4, lat: 43.66, lon: -79.38, tags: {} },
        ],
      },
      "grocers",
      from,
    );
    expect(places.map((p) => p.name)).toEqual(["Naija Foods", "Far African Market"]);
    expect(places[0].address).toBe("12 Queen St");
    expect(places[0].url).toBe("https://www.openstreetmap.org/way/2");
    expect(places[0].distanceKm).toBeCloseTo(1.1, 1);
  });
  it("reads Google Places (New) results", () => {
    const p = fromGoogle({ id: "abc", displayName: { text: "Jamaica Patty Co" }, location: { latitude: 43.66, longitude: -79.38 }, googleMapsUri: "https://maps.google.com/?cid=1" }, "restaurant", { lat: 43.65, lon: -79.38 });
    expect(p?.source).toBe("google");
    expect(p?.url).toBe("https://maps.google.com/?cid=1");
  });
});

describe("searchOsm", () => {
  it("falls back to a mirror when the main instance refuses", async () => {
    const { searchOsm } = await import("./places");
    const hosts: string[] = [];
    const fake = (async (url: string) => {
      hosts.push(new URL(url).host);
      if (hosts.length === 1) return new Response("no", { status: 406 });
      return new Response(JSON.stringify({ elements: [{ type: "node", id: 9, lat: 43.66, lon: -79.38, tags: { name: "Roywoods", cuisine: "caribbean;jamaican" } }] }), { status: 200 });
    }) as typeof fetch;
    const out = await searchOsm("restaurants", 43.6532, -79.3832, { cuisines: ["jamaican"] }, fake);
    expect(hosts).toEqual(["overpass-api.de", "overpass.private.coffee"]);
    expect(out[0].tags).toEqual(["caribbean", "jamaican"]);
  });
});
