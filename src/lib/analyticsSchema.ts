/** Shared by the client tracker and the /api/events endpoint. */
export const EVENT_NAMES = [
  "app_opened",
  "onboarding_done",
  "plan_built",
  "day_skipped",
  "meal_swapped",
  "cook_started",
  "cook_finished",
  "handoff_sent",
  "list_copied",
  "item_in_cart",
  "pantry_scanned",
  "recipe_added",
  "ai_recipes_generated",
  "signed_in",
  "household_joined",
  "invite_created",
  "client_error",
  "feedback",
  "cook_feedback",
  "souschef_asked",
  "recipe_shared",
  "nearby_searched",
  "instacart_opened",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];
export type EventProps = Record<string, string | number | boolean | null>;

const NAMES = new Set<string>(EVENT_NAMES);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isDeviceId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Keep only small, flat, primitive props; long text only for feedback/error messages. */
export function cleanEvent(raw: unknown): { name: EventName; props: EventProps; path: string | null; at: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.name !== "string" || !NAMES.has(e.name)) return null;
  const name = e.name as EventName;
  const props: EventProps = {};
  const src = e.props && typeof e.props === "object" ? (e.props as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(src).slice(0, 12)) {
    if (!/^[a-z_]{1,30}$/.test(k)) continue;
    const max = name === "feedback" && k === "message" ? 2000 : name === "client_error" ? 500 : 120;
    if (typeof v === "string") props[k] = v.slice(0, max);
    else if (typeof v === "number" && Number.isFinite(v)) props[k] = v;
    else if (typeof v === "boolean" || v === null) props[k] = v;
  }
  const path = typeof e.path === "string" ? e.path.replace(/#.*$/, "").slice(0, 200) : null;
  const t = typeof e.at === "string" ? Date.parse(e.at) : NaN;
  const now = Date.now();
  const at = new Date(Number.isFinite(t) && Math.abs(now - t) < 86_400_000 ? t : now).toISOString();
  return { name, props, path, at };
}
