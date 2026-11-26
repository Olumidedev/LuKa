import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { AIError, aiConfigured } from "../ai/gateway";
import { SYSTEM, TOOLS, askSousChef, runTool, type ChatTurn, type SousChefContext } from "./sousChef";

/**
 * Sous-chef provider chain. Fast open-weight models first (Groq), with
 * automatic fallback when one is rate-limited or down, ending with Claude.
 * Every provider gets the same read-only tools and the same rules: facts
 * (nutrition, prices, allergens) only ever come from LUKA's database, scoped
 * to the household's region and allergen exclusions.
 *
 * Only the conversation and those constraints are sent; never names,
 * members' details or anything else from the household.
 */
export type ProviderId = "groq" | "cerebras" | "openrouter" | "anthropic";

interface OpenAIProvider {
  id: Exclude<ProviderId, "anthropic">;
  baseURL: string;
  key: string | undefined;
  model: string;
  /** Extra request fields (OpenRouter: refuse providers that keep or train on prompts). */
  extra?: Record<string, unknown>;
  headers?: Record<string, string>;
}

function openAIProviders(): Record<OpenAIProvider["id"], OpenAIProvider> {
  return {
    groq: {
      id: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      key: process.env.GROQ_API_KEY,
      // Groq has deprecated llama-3.3-70b-versatile in favour of gpt-oss-120b; override with GROQ_MODEL.
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    },
    cerebras: {
      id: "cerebras",
      baseURL: "https://api.cerebras.ai/v1",
      key: process.env.CEREBRAS_API_KEY,
      model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
    },
    openrouter: {
      id: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free",
      extra: { provider: { data_collection: "deny" } },
      headers: { "HTTP-Referer": "https://luka-delta.vercel.app", "X-Title": "LUKA" },
    },
  };
}

export function chainOrder(): ProviderId[] {
  const wanted = (process.env.SOUSCHEF_PROVIDERS || "groq,cerebras,openrouter,anthropic").split(",").map((s) => s.trim()) as ProviderId[];
  const p = openAIProviders();
  return wanted.filter((id) => (id === "anthropic" ? aiConfigured() : !!p[id as OpenAIProvider["id"]]?.key));
}

export const chatConfigured = () => chainOrder().length > 0;

const OPENAI_TOOLS: ChatCompletionTool[] = TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description ?? "", parameters: t.input_schema as Record<string, unknown> },
}));

async function askOpenAICompatible(p: OpenAIProvider, db: SupabaseClient, ctx: SousChefContext, history: ChatTurn[]) {
  const client = new OpenAI({ apiKey: p.key, baseURL: p.baseURL, timeout: 25_000, maxRetries: 0, defaultHeaders: p.headers });
  const messages: ChatCompletionMessageParam[] = [{ role: "system", content: SYSTEM(ctx) }, ...history.map((t) => ({ role: t.role, content: t.content }) as ChatCompletionMessageParam)];
  const toolsUsed: string[] = [];
  for (let round = 0; round < 6; round++) {
    const res = await client.chat.completions.create({
      model: p.model,
      messages,
      tools: OPENAI_TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 1200,
      ...(p.extra ?? {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const msg = res.choices[0]?.message;
    if (!msg) throw new Error("empty response");
    const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
    if (!calls.length) {
      const text = (msg.content ?? "").trim();
      if (!text) throw new Error("empty answer");
      return { text, toolsUsed };
    }
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const c of calls) {
      toolsUsed.push(c.function.name);
      let out: unknown;
      try {
        const args = c.function.arguments ? (JSON.parse(c.function.arguments) as Record<string, unknown>) : {};
        out = await runTool(db, ctx, c.function.name, args);
      } catch (e) {
        out = { error: e instanceof Error ? e.message : String(e) };
      }
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out).slice(0, 12000) });
    }
  }
  return { text: "That took more lookups than I expected. Try asking about one dish or ingredient at a time.", toolsUsed };
}

/** Why a provider was skipped, for logs (never shown to users). */
function reason(e: unknown): string {
  const st = (e as { status?: number }).status;
  return st ? `HTTP ${st}` : e instanceof Error ? e.message.slice(0, 120) : "error";
}

export async function askWithFallback(db: SupabaseClient, ctx: SousChefContext, history: ChatTurn[]): Promise<{ text: string; toolsUsed: string[]; provider: ProviderId; skipped: string[] }> {
  const order = chainOrder();
  if (!order.length) throw new AIError("Ask LUKA isn't switched on yet.", 503);
  const providers = openAIProviders();
  const skipped: string[] = [];
  for (const id of order) {
    try {
      const out = id === "anthropic" ? await askSousChef(db, ctx, history) : await askOpenAICompatible(providers[id], db, ctx, history);
      return { ...out, provider: id, skipped };
    } catch (e) {
      // Rate limits, outages, timeouts or a model that fumbled a tool call: try the next provider.
      skipped.push(`${id}: ${reason(e)}`);
      console.warn("[souschef] falling back from", id, reason(e));
    }
  }
  throw new AIError("LUKA's kitchen helpers are all busy. Try again in a minute.", 503);
}
