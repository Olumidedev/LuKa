import { buildContext } from "../engine/context";
import { defaultStart } from "../engine/dates";
import { buildPlan } from "../engine/planner";
import { track } from "../analytics";
import type { AppState, PlanType } from "../types";

/** Rebuild the plan for the draft state. Keeps pins and skipped days unless the horizon changes. */
export function regenerate(draft: AppState, opts: { type?: PlanType; reshuffle?: boolean; start?: string } = {}) {
  const type = opts.type ?? draft.planType;
  draft.planType = type;
  if (type === "instant") return;
  const prev = draft.plan && draft.plan.type === type ? draft.plan : null;
  const start = opts.start ?? (prev ? prev.start : defaultStart(type));
  const seed = opts.reshuffle || !prev ? Math.floor(Math.random() * 1e9) : prev.seed;
  const ctx = buildContext(draft);
  draft.plan = buildPlan(ctx, type, start, seed, prev && prev.start === start ? prev : null);
  draft.inCart = {};
  track("plan_built", { type, reshuffle: !!opts.reshuffle, members: draft.members.length, cuisines: draft.cuisines.length });
}
