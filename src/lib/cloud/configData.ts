/** Pure settings types and merging (no React), shared by the app, admin and tests. */
/** Settings an admin can change without a deploy (public read, admin write). */
export interface AppConfig {
  features: {
    instant: boolean;
    fourteen_day: boolean;
    ai_recipes: boolean;
    fridge_scan: boolean;
    handoff: boolean;
    voice: boolean;
  };
  announcement: { text: string; tone: "info" | "warning" };
  defaults: { takeout_per_person: number };
}

export const DEFAULT_CONFIG: AppConfig = {
  features: { instant: true, fourteen_day: true, ai_recipes: true, fridge_scan: true, handoff: true, voice: true },
  announcement: { text: "", tone: "info" },
  defaults: { takeout_per_person: 19 },
};


export function mergeConfig(rows: { key: string; value: unknown }[]): AppConfig {
  const out: AppConfig = structuredClone(DEFAULT_CONFIG);
  for (const r of rows) {
    if (!r.value || typeof r.value !== "object") continue;
    if (r.key === "features") out.features = { ...out.features, ...(r.value as Partial<AppConfig["features"]>) };
    if (r.key === "announcement") out.announcement = { ...out.announcement, ...(r.value as Partial<AppConfig["announcement"]>) };
    if (r.key === "defaults") out.defaults = { ...out.defaults, ...(r.value as Partial<AppConfig["defaults"]>) };
  }
  return out;
}

