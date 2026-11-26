import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const runTool = vi.fn(async () => ({ found: true, ingredient: "Fluted pumpkin leaves", nutrition_per_100g: { iron_mg: 2.1, source_id: "fao_wafct_2019" } }));
const askSousChef = vi.fn(async () => ({ text: "from claude", toolsUsed: [] }));
vi.mock("./sousChef", async (orig) => ({ ...(await orig<typeof import("./sousChef")>()), runTool, askSousChef }));
vi.mock("../ai/gateway", () => ({ aiConfigured: () => !!process.env.ANTHROPIC_API_KEY, AIError: class extends Error {} }));

const ctx = { householdId: "h", regionCode: "CA", allergenExclusions: ["peanut"], dietaryRestrictions: [] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const completion = (message: unknown) => json(200, { id: "x", object: "chat.completion", created: 1, model: "m", choices: [{ index: 0, finish_reason: "stop", message }] });

describe("sous-chef provider chain", () => {
  let calls: { host: string; body: Record<string, unknown> }[];
  beforeEach(() => {
    calls = [];
    vi.stubEnv("GROQ_API_KEY", "g");
    vi.stubEnv("ANTHROPIC_API_KEY", "a");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    runTool.mockClear();
  });

  it("orders configured providers and skips ones without keys", async () => {
    const { chainOrder } = await import("./chatChain");
    expect(chainOrder()).toEqual(["groq", "anthropic"]);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(chainOrder()).toEqual(["groq"]);
  });

  it("answers from Groq using read-only tools scoped to the household", async () => {
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      const u = new URL(typeof url === "string" ? url : url instanceof URL ? url : url.url);
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({ host: u.host, body });
      const hasToolResult = body.messages.some((m: { role: string }) => m.role === "tool");
      return hasToolResult
        ? completion({ role: "assistant", content: "Ugu has 2.1 mg iron per 100 g (FAO/INFOODS WAFCT 2019)." })
        : completion({ role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "lookup_ingredient_facts", arguments: '{"name":"ugu"}' } }] });
    });
    const { askWithFallback } = await import("./chatChain");
    const out = await askWithFallback({} as never, ctx, [{ role: "user", content: "Is ugu high in iron?" }]);
    expect(out.provider).toBe("groq");
    expect(out.text).toContain("2.1 mg");
    expect(runTool).toHaveBeenCalledWith({}, ctx, "lookup_ingredient_facts", { name: "ugu" });
    expect(calls.every((c) => c.host === "api.groq.com")).toBe(true);
    expect(String((calls[0].body.messages as { content: string }[])[0].content)).toContain("peanut");
    expect((calls[0].body.tools as unknown[]).length).toBe(4);
  });

  it("falls back to Claude when Groq is rate-limited", async () => {
    vi.stubGlobal("fetch", async () => json(429, { error: { message: "rate limited" } }));
    const { askWithFallback } = await import("./chatChain");
    const out = await askWithFallback({} as never, ctx, [{ role: "user", content: "hi" }]);
    expect(out.provider).toBe("anthropic");
    expect(out.skipped).toEqual(["groq: HTTP 429"]);
  });
});
