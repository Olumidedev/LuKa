"use client";

import { useCallback, useMemo, useState } from "react";
import type { CookCard } from "@/lib/engine/cookcard";
import { regenerate } from "@/lib/state/actions";
import { useStore } from "@/lib/state/store";
import type { CuisinePick } from "@/lib/types";
import { CookMode } from "./CookMode";
import { CuisinePicker } from "./CuisinePicker";
import { GroceryTab } from "./GroceryTab";
import { HouseholdTab } from "./HouseholdTab";
import { MealSheet } from "./MealSheet";
import { Onboarding } from "./Onboarding";
import { PlanTab } from "./PlanTab";
import { RecipesTab } from "./RecipesTab";
import { UICtx, type MealRef, type Tab } from "./uiState";
import { Button, Sheet, cx } from "./ui";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "plan", label: "Plan", icon: <path d="M4 5h16M4 12h16M4 19h10" /> },
  { key: "groceries", label: "Groceries", icon: <path d="M3 4h2l2.4 11h11.2L21 8H7M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z" /> },
  { key: "recipes", label: "Recipes", icon: <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zm0 13a3 3 0 013-3h11" /> },
  { key: "household", label: "Household", icon: <path d="M8 11a3 3 0 100-6 3 3 0 000 6zm8 0a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5m0-4c1-.7 2-1 3-1 3 0 5 2 5 5" /> },
];

export function AppShell() {
  const { state, hydrated, update } = useStore();
  const [tab, setTab] = useState<Tab>("plan");
  const [meal, setMeal] = useState<MealRef | null>(null);
  const [cook, setCook] = useState<CookCard | null>(null);
  const [cuisinesOpen, setCuisinesOpen] = useState(false);
  const [draft, setDraft] = useState<CuisinePick[]>([]);

  const openCuisines = useCallback(() => {
    setDraft(state.cuisines);
    setCuisinesOpen(true);
  }, [state.cuisines]);

  const ui = useMemo(
    () => ({
      tab,
      setTab: (t: Tab) => {
        setTab(t);
        window.scrollTo({ top: 0 });
      },
      openMeal: setMeal,
      openCook: (c: CookCard) => {
        setMeal(null);
        setCook(c);
      },
      openCuisines,
    }),
    [tab, openCuisines],
  );

  if (!hydrated) return <div className="min-h-dvh" />;
  if (!state.onboarded) return <Onboarding />;

  return (
    <UICtx.Provider value={ui}>
      <div className="min-h-dvh pb-24 sm:pb-10">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-[max(16px,env(safe-area-inset-left))] py-3">
            <button type="button" onClick={() => ui.setTab("plan")} className="font-display text-2xl font-bold text-saffron">
              Luka
            </button>
            <nav className="hidden gap-1 sm:flex" aria-label="Sections">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-current={tab === t.key ? "page" : undefined}
                  onClick={() => ui.setTab(t.key)}
                  className={cx("rounded-full px-4 py-2 text-sm font-semibold transition", tab === t.key ? "bg-fg text-bg" : "text-muted hover:text-fg")}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-[max(16px,env(safe-area-inset-left))] py-6 sm:py-8">
          {tab === "plan" && <PlanTab />}
          {tab === "groceries" && <GroceryTab />}
          {tab === "recipes" && <RecipesTab />}
          {tab === "household" && <HouseholdTab />}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-current={tab === t.key ? "page" : undefined}
              onClick={() => ui.setTab(t.key)}
              className={cx("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold", tab === t.key ? "text-saffron" : "text-muted")}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {t.icon}
              </svg>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <MealSheet target={meal} onClose={() => setMeal(null)} />
      {cook && <CookMode card={cook} onClose={() => setCook(null)} />}
      <Sheet
        open={cuisinesOpen}
        onClose={() => setCuisinesOpen(false)}
        title="Your cuisines"
        wide
        footer={
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={!draft.length}
              onClick={() => {
                update((d) => {
                  d.cuisines = draft;
                  regenerate(d, { reshuffle: true });
                });
                setCuisinesOpen(false);
              }}
            >
              Save and replan
            </Button>
          </div>
        }
      >
        <CuisinePicker value={draft} onChange={setDraft} extraRecipes={state.customRecipes} />
      </Sheet>
    </UICtx.Provider>
  );
}
