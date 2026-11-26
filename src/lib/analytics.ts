"use client";

import type { EventName, EventProps } from "./analyticsSchema";
import { getSupabase } from "./cloud/supabase";

/**
 * First-party, privacy-light analytics: a random device id, an event name and
 * a few small properties. Never names, household details, recipes you typed
 * or health information. Respects the in-app opt-out (feedback is always sent,
 * because the person chose to send it).
 */
const DEVICE = "luka:device";
const OPT_OUT = "luka:analytics-off";
const queue: { name: EventName; props?: EventProps; path: string; at: string }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let token: string | null = null;
let wired = false;

function ls(k: string, v?: string) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked */
  }
  return null;
}

function deviceId(): string {
  let id = ls(DEVICE);
  if (!id) {
    id = crypto.randomUUID();
    ls(DEVICE, id);
  }
  return id;
}

export function analyticsEnabled() {
  return ls(OPT_OUT) !== "1";
}

export function setAnalyticsEnabled(on: boolean) {
  ls(OPT_OUT, on ? "0" : "1");
}

function flush(beacon = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ deviceId: deviceId(), token, events: queue.splice(0, 25) });
  if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
  else fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  if (queue.length) flush(beacon);
}

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  const sb = getSupabase();
  if (sb) {
    sb.auth.getSession().then(({ data }) => (token = data.session?.access_token ?? null));
    sb.auth.onAuthStateChange((_e, s) => (token = s?.access_token ?? null));
  }
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush(true));
  const seen = new Set<string>();
  const report = (message: string, source?: string) => {
    const m = message.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").slice(0, 300);
    if (seen.has(m) || seen.size >= 10) return;
    seen.add(m);
    track("client_error", { message: m, source: (source ?? "").split("/").pop()?.slice(0, 80) ?? "" });
  };
  window.addEventListener("error", (e) => report(e.message || "Unknown error", e.filename ? `${e.filename}:${e.lineno}` : undefined));
  window.addEventListener("unhandledrejection", (e) => report(e.reason instanceof Error ? e.reason.message : String(e.reason)));
}

export function track(name: EventName, props?: EventProps) {
  if (typeof window === "undefined") return;
  wire();
  if (name !== "feedback" && !analyticsEnabled()) return;
  queue.push({ name, props, path: window.location.pathname, at: new Date().toISOString() });
  if (name === "feedback" || name === "client_error") flush();
  else if (!timer) timer = setTimeout(() => flush(), 4000);
}

const once = new Set<string>();
/** Track an event at most once per page load (e.g. "item_in_cart"). */
export function trackOnce(name: EventName, props?: EventProps) {
  if (once.has(name)) return;
  once.add(name);
  track(name, props);
}
