"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { aiGenerateRecipes, useAIEnabled } from "../ai/client";
import { regenerate } from "../state/actions";
import { useStore } from "../state/store";
import { useAuth } from "./auth";
import { useCatalog } from "./catalog";
import { useConfig } from "./config";

const MIN_PER_COUNTRY = 8;
const RETRY_MS = 24 * 60 * 60 * 1000;
const key = (c: string) => `luka:topup:${c}`;

function triedRecently(c: string) {
  try {
    return Date.now() - Number(localStorage.getItem(key(c)) || 0) < RETRY_MS;
  } catch {
    return true;
  }
}
function markTried(c: string) {
  try {
    localStorage.setItem(key(c), String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Keeps the menu growing: when a picked country has few recipes, ask Claude for
 * more (they join the shared catalog), then rebuild the plan to include them.
 */
export function useAutoTopUp(): { working: string | null; added: number } {
  const ai = useAIEnabled();
  const { user } = useAuth();
  const config = useConfig();
  const { state, ctx, update } = useStore();
  const catalog = useCatalog();
  const [working, setWorking] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const running = useRef(false);
  const perSession = useRef(0);

  const countries = state.cuisines.filter((p) => p.type === "country").map((p) => p.value);
  const thin = countries.filter((c) => ctx.recipes.filter((r) => r.countries.includes(c)).length < MIN_PER_COUNTRY);
  const thinKey = thin.join("|");

  useEffect(() => {
    if (!ai || !user || !state.onboarded || !config.features.ai_recipes || running.current || perSession.current >= 2) return;
    const next = thinKey.split("|").filter(Boolean).find((c) => !triedRecently(c));
    if (!next) return;
    running.current = true;
    perSession.current++;
    markTried(next);
    setWorking(next);
    aiGenerateRecipes(next)
      .then(async (res) => {
        await catalog.refresh();
        if (res.recipes.length) {
          setAdded((n) => n + res.recipes.length);
          update((d) => regenerate(d));
        }
      })
      .catch(() => {
        /* retried tomorrow; the plan still works with what's there */
      })
      .finally(() => {
        running.current = false;
        setWorking(null);
      });
  }, [ai, user, state.onboarded, config.features.ai_recipes, thinKey, catalog, update]);

  return useMemo(() => ({ working, added }), [working, added]);
}
