"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { buildContext, type EngineContext } from "../engine/context";
import type { AppState } from "../types";
import { defaultState } from "./defaults";

/**
 * Local-first persistence: the household always lives in this device's storage.
 * When someone signs in, `CloudSync` (src/lib/cloud/sync.tsx) mirrors it to
 * their Supabase household.
 */
export interface PersistenceAdapter {
  load(): AppState | null;
  save(state: AppState): void;
}

const KEY = "luka:v1";

export const localAdapter: PersistenceAdapter = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppState;
      return parsed?.version === 1 ? { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...parsed.settings } } : null;
    } catch {
      return null;
    }
  },
  save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: the app keeps working for this session */
    }
  },
};

interface Store {
  state: AppState;
  ctx: EngineContext;
  hydrated: boolean;
  /** Mutate a draft copy; the store swaps it in and persists it. */
  update: (fn: (draft: AppState) => void) => void;
  replace: (next: AppState) => void;
}

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children, adapter = localAdapter }: { children: React.ReactNode; adapter?: PersistenceAdapter }) {
  const [state, setState] = useState<AppState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = adapter.load();
    if (saved) setState(saved);
    setHydrated(true);
  }, [adapter]);

  useEffect(() => {
    if (!hydrated) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => adapter.save(state), 300);
  }, [state, hydrated, adapter]);

  const update = useCallback((fn: (d: AppState) => void) => {
    setState((prev) => {
      const draft = structuredClone(prev);
      fn(draft);
      return draft;
    });
  }, []);

  const ctx = useMemo(() => buildContext(state), [state]);
  const value = useMemo(() => ({ state, ctx, hydrated, update, replace: setState }), [state, ctx, hydrated, update]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
