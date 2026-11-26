import { describe, expect, it } from "vitest";
import { EMBEDDING_DIMS, embedTexts, embeddingText } from "./embeddings";

describe("recipe embeddings", () => {
  it("embeds names in every language with cuisine, role, flavours and ingredients", () => {
    const t = embeddingText({ id: "ng_dodo", title: "Dodo", summary: null, cuisine_tags: ["Nigeria"], local_dish_names: { yo: "Dòdò" }, plate_role: "sweet_side", flavor_tags: ["sweet", "caramelised"], ingredients: ["Ripe plantains", "Vegetable oil"] });
    expect(t).toBe("Dodo (Dòdò). Cuisine: Nigeria. Plate role: sweet side. Flavours: sweet, caramelised. Ingredients: Ripe plantains, Vegetable oil");
  });
  it("calls Workers AI bge-m3 and checks the vector size", async () => {
    const calls: string[] = [];
    const ok = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
      const n = JSON.parse(String(init?.body)).text.length;
      return new Response(JSON.stringify({ success: true, result: { shape: [n, EMBEDDING_DIMS], data: Array.from({ length: n }, () => Array(EMBEDDING_DIMS).fill(0.01)) } }));
    }) as typeof fetch;
    const v = await embedTexts(["a", "b"], { CLOUDFLARE_ACCOUNT_ID: "acct", CLOUDFLARE_AI_TOKEN: "tok" }, ok);
    expect(v).toHaveLength(2);
    expect(calls[0]).toBe("https://api.cloudflare.com/client/v4/accounts/acct/ai/run/@cf/baai/bge-m3");
    const wrong = (async () => new Response(JSON.stringify({ success: true, result: { data: [[1, 2, 3]] } }))) as typeof fetch;
    await expect(embedTexts(["a"], { CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: "t" }, wrong)).rejects.toThrow(/dims/);
    await expect(embedTexts(["a"], {})).rejects.toThrow(/CLOUDFLARE/);
  });
});
