"use client";

import { useState } from "react";
import { ALLERGEN_LABELS } from "@/lib/data/ingredients";
import type { AgeGroup, Allergen, Diet, LifeStage, Member, Rule, SpiceLevel } from "@/lib/types";
import { Chip, Label, Segmented, cx, inputCls } from "./ui";

export const AGE_LABEL: Record<AgeGroup, string> = { adult: "Adult", teen: "Teen", child: "Child 4–12", toddler: "Toddler" };
const DIETS: { v: Diet; l: string }[] = [
  { v: "", l: "Eats everything" },
  { v: "pescatarian", l: "Pescatarian" },
  { v: "vegetarian", l: "Vegetarian" },
  { v: "vegan", l: "Vegan" },
];
const RULES: { v: Rule; l: string }[] = [
  { v: "halal", l: "Halal" },
  { v: "kosher", l: "Kosher" },
  { v: "nopork", l: "No pork" },
  { v: "nobeef", l: "No beef" },
];
export const STAGE_LABEL: Record<Exclude<LifeStage, "">, string> = {
  ttc: "Trying to conceive",
  pregnant: "Pregnant",
  breastfeeding: "Breastfeeding",
  athlete: "Training hard",
  senior: "65+",
};

export function needsSummary(m: Member): string[] {
  const out: string[] = [];
  for (const a of m.allergies) out.push(`${ALLERGEN_LABELS[a].split(" /")[0]}-free`);
  if (m.diet) out.push(m.diet[0].toUpperCase() + m.diet.slice(1));
  for (const r of m.rules) out.push(RULES.find((x) => x.v === r)!.l);
  if (m.spice !== "medium") out.push(m.spice === "mild" ? "Mild spice" : "Loves heat");
  if (m.stage) out.push(STAGE_LABEL[m.stage]);
  return out;
}

export function MemberEditor({
  member,
  onChange,
  onRemove,
  defaultOpen = false,
  autoFocus,
}: {
  member: Member;
  onChange: (m: Member) => void;
  onRemove?: () => void;
  defaultOpen?: boolean;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const set = <K extends keyof Member>(k: K, v: Member[K]) => onChange({ ...member, [k]: v });
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const summary = needsSummary(member);
  const id = member.id;

  return (
    <div className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`name-${id}`}
          aria-label="Name"
          autoFocus={autoFocus}
          className={cx(inputCls, "min-w-0 flex-1 basis-40 font-semibold")}
          placeholder="Name"
          value={member.name}
          onChange={(e) => set("name", e.target.value)}
        />
        <select
          id={`age-${id}`}
          aria-label="Age group"
          className={cx(inputCls, "!w-auto")}
          value={member.age}
          onChange={(e) => {
            const age = e.target.value as AgeGroup;
            const young = age === "child" || age === "toddler";
            onChange({ ...member, age, spice: young ? "mild" : member.spice, cooks: young ? false : member.cooks });
          }}
        >
          {(Object.keys(AGE_LABEL) as AgeGroup[]).map((a) => (
            <option key={a} value={a}>
              {AGE_LABEL[a]}
            </option>
          ))}
        </select>
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded-full px-2 py-1 text-[13px] text-muted hover:bg-danger-soft hover:text-danger" aria-label={`Remove ${member.name || "member"}`}>
            Remove
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1.5 text-left text-[13px]"
      >
        <span className="flex flex-wrap gap-1.5">
          {summary.length ? summary.map((s) => <span key={s} className="rounded-full bg-sunk px-2 py-0.5 text-muted">{s}</span>) : <span className="text-muted">No allergies or dietary needs</span>}
        </span>
        <span className="shrink-0 font-semibold text-saffron-ink">{open ? "Done" : "Dietary needs"}</span>
      </button>

      {open && (
        <div className="mt-3 grid gap-4 border-t border-line pt-4">
          <div>
            <Label>Allergies &amp; intolerances — always excluded</Label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(ALLERGEN_LABELS) as Allergen[]).map((a) => (
                <Chip key={a} active={member.allergies.includes(a)} onClick={() => set("allergies", toggle(member.allergies, a))}>
                  {ALLERGEN_LABELS[a]}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <Label>Diet — LUKA swaps their portion</Label>
            <div className="flex flex-wrap gap-1.5">
              {DIETS.map((d) => (
                <Chip key={d.v || "all"} active={member.diet === d.v} onClick={() => set("diet", d.v)}>
                  {d.l}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <Label>Faith &amp; household rules — applied to everyone&apos;s meals</Label>
            <div className="flex flex-wrap gap-1.5">
              {RULES.map((r) => (
                <Chip key={r.v} active={member.rules.includes(r.v)} onClick={() => set("rules", toggle(member.rules, r.v))}>
                  {r.l}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>Spice</Label>
              <Segmented<SpiceLevel>
                value={member.spice}
                onChange={(v) => set("spice", v)}
                options={[
                  { value: "mild", label: "Mild" },
                  { value: "medium", label: "Medium" },
                  { value: "hot", label: "Hot" },
                ]}
              />
            </div>
            <div className="min-w-48 flex-1">
              <Label htmlFor={`stage-${id}`}>Life stage (private)</Label>
              <select id={`stage-${id}`} className={inputCls} value={member.stage} onChange={(e) => set("stage", e.target.value as LifeStage)}>
                <option value="">None</option>
                {(Object.keys(STAGE_LABEL) as Exclude<LifeStage, "">[]).map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor={`dislikes-${id}`}>Dislikes (comma separated)</Label>
            <input id={`dislikes-${id}`} className={inputCls} placeholder="e.g. eggplant, cilantro" value={member.dislikes} onChange={(e) => set("dislikes", e.target.value)} />
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--saffron)]" checked={member.cooks} onChange={(e) => set("cooks", e.target.checked)} />
            Shares the cooking (included in the rotation and handoffs)
          </label>
        </div>
      )}
    </div>
  );
}
