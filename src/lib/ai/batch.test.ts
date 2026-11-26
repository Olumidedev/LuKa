import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
const generateStructured = vi.fn(async () => ({ from: "claude" }));
vi.mock("./gateway", () => ({ generateStructured, AIError: class extends Error {} }));

describe("batch generation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses Claude unless Ollama is configured", async () => {
    const { batchProvider } = await import("./batch");
    expect(batchProvider({})).toBe("anthropic");
    expect(batchProvider({ BATCH_LLM: "ollama" })).toBe("anthropic");
    expect(batchProvider({ BATCH_LLM: "ollama", OLLAMA_BASE_URL: "https://ollama.example.com" })).toBe("ollama");
  });

  it("requires https for a remote Ollama", async () => {
    const { ollamaBaseUrl } = await import("./batch");
    expect(ollamaBaseUrl("https://ollama.example.com/")).toBe("https://ollama.example.com/v1");
    expect(ollamaBaseUrl("http://localhost:11434")).toBe("http://localhost:11434/v1");
    expect(() => ollamaBaseUrl("http://203.0.113.5:11434")).toThrow(/https/);
  });

  it("asks Ollama for schema-constrained JSON and validates it", async () => {
    vi.stubEnv("BATCH_LLM", "ollama");
    vi.stubEnv("OLLAMA_BASE_URL", "https://ollama.example.com");
    vi.stubEnv("OLLAMA_API_KEY", "secret");
    let sent: Record<string, unknown> = {};
    let auth = "";
    vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      auth = new Headers(init?.headers).get("authorization") ?? "";
      expect(String(url)).toBe("https://ollama.example.com/v1/chat/completions");
      return new Response(JSON.stringify({ id: "x", object: "chat.completion", created: 1, model: "qwen3:14b", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"dishes":["Riz gras"]}' } }] }), { headers: { "content-type": "application/json" } });
    });
    const { generateBatchStructured } = await import("./batch");
    const out = await generateBatchStructured({ schema: z.object({ dishes: z.array(z.string()) }), system: "s", prompt: "p" });
    expect(out).toEqual({ dishes: ["Riz gras"] });
    expect(auth).toBe("Bearer secret");
    expect((sent.response_format as { type: string }).type).toBe("json_schema");
    expect(sent.model).toBe("qwen3:14b");
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
