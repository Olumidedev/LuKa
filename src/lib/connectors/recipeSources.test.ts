import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanWikitext, mealDbFacts, parseWikibooks, publicDomainLikely } from "./recipeSources";

const fx = (f: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url), "utf8"));

describe("TheMealDB (facts only)", () => {
  const m = fx("themealdb-52937.json").meals[0];
  const f = mealDbFacts(m);
  it("keeps the dish, country and ingredient list", () => {
    expect(f.title).toBe("Jerk chicken with rice & peas");
    expect(f.country).toBe("Jamaica");
    expect(f.ingredients).toContain("12 Chicken Thighs");
    expect(f.ingredients).toContain("800g Kidney Beans");
  });
  it("never copies the method", () => {
    expect(f.steps).toEqual([]);
    expect(JSON.stringify(f)).not.toContain("food processor");
    expect(f.originRef).toContain("bbcgoodfood.com");
  });
});

describe("Wikibooks", () => {
  const p = fx("wikibooks-asun.json").parse;
  const r = parseWikibooks("Cookbook:Asun (Goat in Pepper Sauce)", p.wikitext, p.revid);
  it("reads ingredients and numbered steps without wiki markup", () => {
    expect(r.ingredients[0]).toBe("Goat meat, washed and cut into smaller pieces");
    expect(r.ingredients).toContain("Fresh habanero pepper");
    expect(r.steps).toHaveLength(9);
    expect(r.steps[1]).toMatch(/^Place the marinated goat meat on an electric barbecue grill/);
    expect(r.steps.join(" ")).not.toMatch(/\[\[|\]\]/);
  });
  it("links to the exact revision and lists categories", () => {
    expect(r.sourceUrl).toBe("https://en.wikibooks.org/w/index.php?title=Cookbook%3AAsun_(Goat_in_Pepper_Sauce)&oldid=4514035");
    expect(r.categories).toContain("Nigerian recipes");
    expect(r.summary).toMatch(/^Asun is a Nigerian dish/);
  });
  it("cleans links, templates and bold", () => {
    expect(cleanWikitext("'''Mix''' [[Cookbook:Onion|onions]] {{tmpl}} and [[salt]]<ref>x</ref>")).toBe("Mix onions and salt");
  });
});

describe("public domain", () => {
  it("only assumes public domain before 1930", () => {
    expect(publicDomainLikely(1885)).toBe(true);
    expect(publicDomainLikely(1950)).toBe(false);
    expect(publicDomainLikely(null)).toBe(false);
  });
});
