"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/cloud/auth";
import { useCloud } from "@/lib/cloud/sync";
import { getTheme, setTheme, type ThemeChoice } from "@/lib/theme";
import { Logo } from "./brand";
import type { Tab } from "./uiState";
import { Segmented, cx } from "./ui";

const ICONS: Record<Tab, React.ReactNode> = {
  home: <path d="M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-5h-6v5H5a1 1 0 01-1-1v-8z" />,
  plan: <path d="M5 5h14v14H5zM5 10h14M10 5v14" />,
  groceries: <path d="M3 4h2l2.4 11h11.2L21 8H7M9 20a1 1 0 100-2 1 1 0 000 2zm9 0a1 1 0 100-2 1 1 0 000 2z" />,
  recipes: <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zm0 13a3 3 0 013-3h11" />,
  household: <path d="M8 11a3 3 0 100-6 3 3 0 000 6zm8 0a3 3 0 100-6 3 3 0 000 6zM2 20c0-3 3-5 6-5s6 2 6 5m0-4c1-.7 2-1 3-1 3 0 5 2 5 5" />,
  admin: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3zm-3 9l2 2 4-4" />,
  account: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9c0-4 4-6 8-6s8 2 8 6" />,
  about: <path d="M12 21a9 9 0 100-18 9 9 0 000 18zm0-11v6m0-9v.5" />,
};

export const TAB_LABEL: Record<Tab, string> = {
  home: "Home",
  plan: "Plan",
  groceries: "Groceries",
  recipes: "Recipes",
  household: "Household",
  admin: "Admin",
  account: "My account",
  about: "About LUKA",
};

function Item({ tab, current, onPick }: { tab: Tab; current: Tab; onPick: (t: Tab) => void }) {
  return (
    <button
      type="button"
      aria-current={current === tab ? "page" : undefined}
      onClick={() => onPick(tab)}
      className={cx(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold transition",
        current === tab ? "bg-saffron-soft text-saffron-ink" : "text-fg hover:bg-sunk",
      )}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ICONS[tab]}
      </svg>
      {TAB_LABEL[tab]}
    </button>
  );
}

/** Slide-in navigation: sections, account, appearance and log out. */
export function MenuDrawer({ open, onClose, tab, onPick, isAdmin, onSignOut }: { open: boolean; onClose: () => void; tab: Tab; onPick: (t: Tab) => void; isAdmin: boolean; onSignOut: () => void }) {
  const { user } = useAuth();
  const cloud = useCloud();
  const [theme, setThemeState] = useState<ThemeChoice>("system");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => setThemeState(getTheme()), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    panel.current?.querySelector<HTMLButtonElement>("button[aria-current]")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pick = (t: Tab) => {
    onPick(t);
    onClose();
  };

  return (
    <div className={cx("fixed inset-0 z-40", open ? "" : "pointer-events-none")} aria-hidden={!open}>
      <div className={cx("absolute inset-0 bg-black/40 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={cx(
          "absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col bg-surface shadow-2xl transition-transform duration-200",
          "pt-[max(16px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] pr-3",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-2">
          <Logo size={28} wordClass="text-xl" />
          <button type="button" onClick={onClose} aria-label="Close menu" className="rounded-full p-2 text-muted hover:bg-sunk hover:text-fg">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {user && (
          <button type="button" onClick={() => pick("account")} className="mx-1 mt-4 flex items-center gap-3 rounded-2xl bg-sunk p-3 text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-saffron font-semibold text-white dark:text-[#1c1917]">{(user.email ?? "?")[0].toUpperCase()}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{cloud.household?.name ?? user.email}</span>
              <span className="block truncate text-[12px] text-muted">{user.email}</span>
            </span>
          </button>
        )}

        <nav className="mt-4 grid gap-0.5 overflow-y-auto" aria-label="Sections">
          {(["home", "plan", "groceries", "recipes", "household"] as Tab[]).map((t) => (
            <Item key={t} tab={t} current={tab} onPick={pick} />
          ))}
          {isAdmin && <Item tab="admin" current={tab} onPick={pick} />}
          <div className="my-2 border-t border-line" />
          {user && <Item tab="account" current={tab} onPick={pick} />}
          <Item tab="about" current={tab} onPick={pick} />
        </nav>

        <div className="mt-auto grid gap-3 border-t border-line px-2 pt-4">
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Appearance</p>
            <Segmented<ThemeChoice>
              value={theme}
              onChange={(t) => {
                setTheme(t);
                setThemeState(t);
              }}
              options={[
                { value: "system", label: "Auto" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </div>
          {user && (
            <button type="button" onClick={onSignOut} className="flex items-center gap-3 rounded-xl px-1 py-2 text-left text-[15px] font-semibold text-danger hover:bg-danger-soft">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10" />
              </svg>
              Log out
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
