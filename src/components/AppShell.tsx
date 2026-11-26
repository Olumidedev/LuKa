"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { trackOnce } from "@/lib/analytics";
import { useAuth } from "@/lib/cloud/auth";
import { useConfig } from "@/lib/cloud/config";
import { useCloud } from "@/lib/cloud/sync";
import { useTasteSync } from "@/lib/cloud/taste";
import { useAutoTopUp } from "@/lib/cloud/topup";
import { useIsAdmin } from "@/lib/cloud/useIsAdmin";
import type { CookCard } from "@/lib/engine/cookcard";
import { regenerate } from "@/lib/state/actions";
import { useStore } from "@/lib/state/store";
import type { CuisinePick } from "@/lib/types";
import { AboutView } from "./AboutView";
import { AccountView } from "./AccountView";
import { Logo, LogoMark } from "./brand";
import { CookMode } from "./CookMode";
import { CuisinePicker } from "./CuisinePicker";
import { GroceryTab } from "./GroceryTab";
import { HomeView } from "./HomeView";
import { HouseholdTab } from "./HouseholdTab";
import { MealSheet } from "./MealSheet";
import { MenuDrawer, TAB_LABEL } from "./MenuDrawer";
import { Onboarding } from "./Onboarding";
import { PlanTab } from "./PlanTab";
import { RecipesTab } from "./RecipesTab";
import { UICtx, type MealRef, type Tab } from "./uiState";
import { Button, Sheet, cx } from "./ui";

// Loaded only when an admin opens it, so other people never download it.
const AdminPanel = dynamic(() => import("./admin/AdminApp"), { ssr: false, loading: () => <p className="text-muted">Loading admin…</p> });

function Splash({ text }: { text?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <LogoMark size={56} className="animate-pulse" />
      {text && <p className="text-sm text-muted">{text}</p>}
    </div>
  );
}

/** Sign-in → household → Home, with everything else one menu tap away. */
export function AppShell() {
  const { state, hydrated, update } = useStore();
  const auth = useAuth();
  const cloud = useCloud();
  useTasteSync(cloud.household?.id);
  const router = useRouter();
  const config = useConfig();
  const isAdmin = useIsAdmin();
  const topUp = useAutoTopUp();
  const [tab, setTab] = useState<Tab>("home");
  const [menu, setMenu] = useState(false);
  const [meal, setMeal] = useState<MealRef | null>(null);
  const [cook, setCook] = useState<CookCard | null>(null);
  const [cuisinesOpen, setCuisinesOpen] = useState(false);
  const [draft, setDraft] = useState<CuisinePick[]>([]);

  const needsLogin = auth.configured && auth.ready && !auth.user;
  useEffect(() => {
    if (needsLogin) router.replace("/login");
  }, [needsLogin, router]);
  useEffect(() => trackOnce("app_opened"), []);
  useEffect(() => {
    if (!isAdmin && tab === "admin") setTab("home");
  }, [isAdmin, tab]);

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
      topUp,
    }),
    [tab, openCuisines, topUp],
  );

  const signOut = async () => {
    setMenu(false);
    await auth.signOut();
    router.replace("/login");
  };

  if (!hydrated || !auth.ready || needsLogin) return <Splash />;
  if (auth.user && !cloud.ready) return <Splash text="Opening your kitchen…" />;
  if (!state.onboarded) return <Onboarding />;

  return (
    <UICtx.Provider value={ui}>
      <div className="min-h-dvh pb-10">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-[max(16px,env(safe-area-inset-left))] py-2.5">
            <button
              type="button"
              onClick={() => setMenu(true)}
              aria-label="Open menu"
              aria-expanded={menu}
              className="-ml-2 rounded-full p-2 text-fg hover:bg-sunk"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <button type="button" onClick={() => ui.setTab("home")} aria-label="LUKA home">
              <Logo size={28} wordClass="text-xl" />
            </button>
            <span className="ml-auto text-sm font-semibold text-muted">{tab === "home" ? "" : TAB_LABEL[tab]}</span>
          </div>
        </header>

        {config.announcement.text && (
          <div role="status" className={cx("px-[max(16px,env(safe-area-inset-left))] py-2.5 text-center text-sm font-medium", config.announcement.tone === "warning" ? "bg-saffron-soft text-saffron-ink" : "bg-leaf-soft text-leaf")}>
            {config.announcement.text}
          </div>
        )}

        <main className="mx-auto max-w-6xl px-[max(16px,env(safe-area-inset-left))] py-6 sm:py-8">
          {tab === "home" && <HomeView />}
          {tab === "plan" && <PlanTab />}
          {tab === "groceries" && <GroceryTab />}
          {tab === "recipes" && <RecipesTab />}
          {tab === "household" && <HouseholdTab />}
          {tab === "admin" && isAdmin && <AdminPanel />}
          {tab === "account" && <AccountView />}
          {tab === "about" && <AboutView />}
        </main>
      </div>

      <MenuDrawer open={menu} onClose={() => setMenu(false)} tab={tab} onPick={ui.setTab} isAdmin={isAdmin} onSignOut={signOut} />
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
