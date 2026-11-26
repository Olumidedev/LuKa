import { describe, expect, it } from "vitest";
import { privateAddress, recipeTextFromHtml } from "./jsonld";

const page = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":["Recipe"],"name":"Efo Riro","recipeYield":["4"],"recipeIngredient":["500 g spinach","2 tbsp palm oil"],
"recipeInstructions":[{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Blend the &amp; peppers."}]},{"@type":"HowToStep","text":"Stir in the <b>spinach</b>."}]}]}</script></head></html>`;

describe("recipeTextFromHtml", () => {
  it("reads schema.org recipes inside @graph and sections", () => {
    const r = recipeTextFromHtml(page)!;
    expect(r.title).toBe("Efo Riro");
    expect(r.text).toContain("- 500 g spinach");
    expect(r.text).toContain("1. Blend the & peppers.");
    expect(r.text).toContain("2. Stir in the spinach.");
  });
  it("returns null without recipe data", () => {
    expect(recipeTextFromHtml("<html><script type='application/ld+json'>{\"@type\":\"Article\"}</script></html>")).toBeNull();
    expect(recipeTextFromHtml("<script type='application/ld+json'>{broken</script>")).toBeNull();
  });
});

describe("privateAddress", () => {
  it("blocks internal addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) expect(privateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "151.101.1.1", "2606:4700::1111"]) expect(privateAddress(ip)).toBe(false);
  });
});
