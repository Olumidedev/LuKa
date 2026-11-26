import { describe, expect, it } from "vitest";
import { restaurantCategories, storeKinds } from "../data/specialty";
import { cellCenter, cellKey, coarse, geoapifyUrl, namePattern, parseGeoapify, toPlace } from "./places";

describe("nearby places (Geoapify + cache)", () => {
  it("rounds location to about a kilometre", () => {
    expect(coarse(43.653226)).toBe(43.65);
    expect(coarse(-79.383184)).toBe(-79.38);
  });
  it("puts nearby searches in the same cache cell", () => {
    expect(cellKey("grocer", "all", 43.651, -79.381)).toBe(cellKey("grocer", "all", 43.66, -79.36));
    expect(cellKey("grocer", "all", 43.651, -79.381)).not.toBe(cellKey("grocer", "all", 43.72, -79.381));
    expect(cellCenter(43.651, -79.381)).toEqual({ lat: 43.675, lon: -79.375 });
  });
  it("maps a Nigerian + Jamaican household to grocers and restaurant categories", () => {
    const picks = [{ type: "country" as const, value: "Nigeria" }, { type: "country" as const, value: "Jamaica" }];
    expect(storeKinds(picks, ["ugu", "gochujang"])).toEqual(["african", "caribbean", "asian"]);
    expect(restaurantCategories(picks)).toEqual(["catering.restaurant.jamaican", "catering.restaurant.african", "catering.restaurant.caribbean", "catering.restaurant.cuban"]);
  });
  it("asks Geoapify for one cell, with the key only in the server URL", () => {
    const u = new URL(geoapifyUrl("restaurant", ["catering.restaurant.african"], 43.651, -79.381, "KEY"));
    expect(u.host).toBe("api.geoapify.com");
    expect(u.searchParams.get("filter")).toBe("circle:-79.375,43.675,10500");
    expect(u.searchParams.get("limit")).toBe("500");
  });
  it("parses Geoapify features into cache rows", () => {
    const rows = parseGeoapify(
      {
        features: [
          { properties: { place_id: "p1", name: "Roywoods", categories: ["catering", "catering.restaurant", "catering.restaurant.jamaican"], address_line2: "12 Queen St, Toronto", website: "https://roywoods.example", lat: 43.651, lon: -79.381 } },
          { properties: { place_id: "p1", name: "Roywoods", lat: 43.651, lon: -79.381 } },
          { properties: { place_id: "p2", lat: 1, lon: 2 } },
          { properties: { place_id: "p3", name: "No coords" } },
          { properties: { place_id: "p4", name: "Bad site", website: "javascript:alert(1)" }, geometry: { type: "Point", coordinates: [-79.4, 43.6] } },
        ],
      },
      "restaurant",
    );
    expect(rows.map((r) => r.id)).toEqual(["geoapify:p1", "geoapify:p4"]);
    expect(rows[1].geom).toBe("SRID=4326;POINT(-79.4 43.6)");
    expect(rows[1].website).toBeNull();
  });
  it("builds a safe name pattern and readable places", () => {
    expect(namePattern(["african"])).toMatch(/^afric\|afro/);
    expect(namePattern([])).toBeNull();
    const p = toPlace({ id: "geoapify:p1", name: "Roywoods", categories: ["catering.restaurant", "catering.restaurant.jamaican"], lat: 43.651, lon: -79.381, distance_m: 1234, address: null, website: null }, "restaurant");
    expect(p.distanceKm).toBe(1.2);
    expect(p.tags).toEqual(["jamaican"]);
    expect(p.url).toContain("openstreetmap.org");
  });
});
