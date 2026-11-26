import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { AIError, generateStructured } from "./gateway";

/**
 * Batch generation (weekly gap-finder, recipe imports). With BATCH_LLM=ollama
 * it runs on your own Ollama server (e.g. Qwen 3), so batch jobs hit no daily
 * caps and send nothing to third-party free endpoints. Otherwise Claude.
 *
 * Ollama has no authentication of its own: expose it only through HTTPS with a
 * secret (e.g. Cloudflare Tunnel + Access service token, or a reverse proxy
 * that checks OLLAMA_API_KEY as a bearer token).
 */
export function batchProvider(env: Record<string, string | undefined> = process.env): "ollama" | "anthropic" {
  return env.BATCH_LLM === "ollama" && env.OLLAMA_BASE_URL ? "ollama" : "anthropic";
}

export function ollamaBaseUrl(raw: string): string {
  const u = new URL(raw);
  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  if (u.protocol !== "https:" && !local) throw new AIError("OLLAMA_BASE_URL must use https (put Ollama behind a tunnel or reverse proxy).", 503);
  return `${u.origin}${u.pathname.replace(/\/$/, "")}/v1`;
}

export async function generateBatchStructured<S extends z.ZodType>(opts: { schema: S; system: string; prompt: string; maxTokens?: number }): Promise<z.infer<S>> {
  if (batchProvider() === "anthropic") return generateStructured({ ...opts, effort: "medium" });
  const client = new OpenAI({
    baseURL: ollamaBaseUrl(process.env.OLLAMA_BASE_URL!),
    apiKey: process.env.OLLAMA_API_KEY || "ollama",
    timeout: 280_000,
    maxRetries: 0,
    defaultHeaders: process.env.OLLAMA_ACCESS_CLIENT_ID
      ? { "CF-Access-Client-Id": process.env.OLLAMA_ACCESS_CLIENT_ID, "CF-Access-Client-Secret": process.env.OLLAMA_ACCESS_CLIENT_SECRET ?? "" }
      : undefined,
  });
  const res = await client.chat.completions.create({
    model: process.env.OLLAMA_MODEL || "qwen3:14b",
    temperature: 0.4,
    max_tokens: opts.maxTokens ?? 12000,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.prompt },
    ],
    // Self-hosted Ollama enforces the schema while generating; zod checks it again below.
    response_format: { type: "json_schema", json_schema: { name: "output", schema: z.toJSONSchema(opts.schema) as Record<string, unknown>, strict: true } },
  });
  const text = res.choices[0]?.message?.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, "$1"));
  } catch {
    throw new AIError("The local model's answer wasn't valid JSON.", 502);
  }
  const out = opts.schema.safeParse(parsed);
  if (!out.success) throw new AIError("The local model's answer didn't match the expected format.", 502);
  return out.data;
}
