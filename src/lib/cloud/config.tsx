"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSupabase } from "./supabase";

import { DEFAULT_CONFIG, mergeConfig, type AppConfig } from "./configData";

export { DEFAULT_CONFIG, mergeConfig, type AppConfig };

const CACHE = "luka:config";

const ConfigCtx = createContext<AppConfig>(DEFAULT_CONFIG);
export const useConfig = () => useContext(ConfigCtx);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE);
      if (cached) setConfig(mergeConfig(JSON.parse(cached)));
    } catch {
      /* ignore */
    }
    const sb = getSupabase();
    if (!sb) return;
    sb.from("app_config")
      .select("key, value")
      .then(({ data, error }) => {
        if (error || !data) return;
        setConfig(mergeConfig(data));
        try {
          localStorage.setItem(CACHE, JSON.stringify(data));
        } catch {
          /* ignore */
        }
      });
  }, []);
  return <ConfigCtx.Provider value={config}>{children}</ConfigCtx.Provider>;
}
