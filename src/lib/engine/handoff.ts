import type { CookCard, StepPart } from "./cookcard";

/**
 * Partner handoff links carry the prepared card in the URL fragment, which
 * browsers never send to the server. No account needed to open one.
 */
export interface Handoff {
  card: CookCard;
  cook?: string;
  from?: string;
  when?: string;
}

function b64urlEncode(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeHandoff(h: Handoff): string {
  return b64urlEncode(JSON.stringify(h));
}

const s = (v: unknown, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");

/** Strict decode: anything malformed is dropped, and everything is plain text. */
export function decodeHandoff(fragment: string): Handoff | null {
  try {
    const raw = JSON.parse(b64urlDecode(fragment)) as Record<string, unknown>;
    const c = raw.card as Record<string, unknown>;
    if (!c || typeof c.title !== "string") return null;
    const arr = (v: unknown, n: number) => (Array.isArray(v) ? v.slice(0, n) : []);
    const steps: StepPart[][] = arr(c.steps, 30).map((st) =>
      arr(st, 60)
        .map((p): StepPart | null => {
          const o = p as Record<string, unknown>;
          if (o?.t === "timer" && typeof o.min === "number") return { t: "timer", min: Math.min(600, Math.max(1, o.min)) };
          if (o?.t === "qty" || o?.t === "text") return { t: o.t, v: s(o.v) };
          return null;
        })
        .filter((x): x is StepPart => !!x),
    );
    return {
      card: {
        title: s(c.title, 140),
        serves: s(c.serves, 80),
        countries: arr(c.countries, 4).map((x) => s(x, 60)),
        portions: Number(c.portions) || 4,
        activeMin: Number(c.activeMin) || 0,
        totalMin: Number(c.totalMin) || 0,
        ingredients: arr(c.ingredients, 60).map((x) => s(x, 160)),
        steps,
        notes: arr(c.notes, 12).map((x) => s(x, 300)),
        safety: arr(c.safety, 12).map((x) => s(x, 200)),
        source: s(c.source, 160) || undefined,
      },
      cook: s(raw.cook, 60) || undefined,
      from: s(raw.from, 60) || undefined,
      when: s(raw.when, 60) || undefined,
    };
  } catch {
    return null;
  }
}
