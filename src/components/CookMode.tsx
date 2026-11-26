"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { useConfig } from "@/lib/cloud/config";
import { useCloud } from "@/lib/cloud/sync";
import { useStore } from "@/lib/state/store";
import { stepText, type CookCard, type StepPart } from "@/lib/engine/cookcard";
import { CookModeFeedbackCard } from "./kb/CookModeFeedbackCard";
import { Button, cx } from "./ui";

interface Timer {
  id: number;
  label: string;
  end: number;
  total: number;
  done: boolean;
}

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, sixty: 60 };

function StepBody({ parts, onTimer }: { parts: StepPart[]; onTimer: (min: number) => void }) {
  return (
    <>
      {parts.map((p, i) =>
        p.t === "text" ? (
          <span key={i}>{p.v}</span>
        ) : p.t === "qty" ? (
          <strong key={i} className="font-bold text-saffron-ink">
            {p.v}
          </strong>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onTimer(p.min)}
            className="mx-1 inline-flex items-center gap-1 rounded-full bg-leaf px-3 py-0.5 align-middle text-[0.7em] font-semibold text-white dark:text-[#1c1917]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="8" cy="9" r="5.5" />
              <path d="M8 6v3l2 1.5M6 1.5h4" strokeLinecap="round" />
            </svg>
            {p.min} min
          </button>
        ),
      )}
    </>
  );
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Guided Cook Mode (FR-5.1). Kitchen Dock behaviour: keeps the screen awake and
 * listens for voice commands only while open (no background wake word — iOS
 * and most browsers block it; see BRD v3.2 §FR-1.1).
 */
export function CookMode({ card, onClose }: { card: CookCard; onClose: () => void }) {
  // Step -1 is the overview (ingredients, notes, safety).
  const [step, setStep] = useState(-1);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(Date.now());
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [showIngredients, setShowIngredients] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const config = useConfig();
  const cloud = useCloud();
  const { state } = useStore();
  const [rating, setRating] = useState(false);
  // Household-only recipes live on this device, not in the shared catalog, so they can't be rated there.
  const canRate = !!cloud.household && !!card.recipeId && !state.customRecipes.some((r) => r.id === card.recipeId);
  useEffect(() => track("cook_started", { steps: card.steps.length }), [card.steps.length]);
  const audio = useRef<AudioContext | null>(null);
  const stateRef = useRef({ step, speak });
  stateRef.current = { step, speak };

  const SR = typeof window !== "undefined" ? ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) : undefined;
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  const say = useCallback(
    (text: string, force = false) => {
      if (!canSpeak || (!force && !stateRef.current.speak)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.98;
      window.speechSynthesis.speak(u);
    },
    [canSpeak],
  );

  const readStep = useCallback(
    (i: number, force = false) => {
      if (i < 0) say(`${card.title}. ${card.ingredients.length} ingredients. Say next to begin.`, force);
      else say(`Step ${i + 1}. ${stepText(card.steps[i])}`, force);
    },
    [card, say],
  );

  const go = useCallback(
    (i: number) => {
      const n = Math.max(-1, Math.min(card.steps.length - 1, i));
      setStep(n);
      readStep(n);
    },
    [card.steps.length, readStep],
  );

  const addTimer = useCallback(
    (min: number, label?: string) => {
      audio.current ??= new AudioContext();
      const s = stateRef.current.step;
      setTimers((t) => [...t, { id: Date.now(), label: label ?? (s >= 0 ? `Step ${s + 1}` : "Timer"), end: Date.now() + min * 60_000, total: min * 60_000, done: false }]);
      say(`${min} minute timer started.`);
    },
    [say],
  );

  // Screen wake lock while cooking.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const get = () =>
      nav.wakeLock
        ?.request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    get();
    const onVis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", onVis);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      lock?.release().catch(() => {});
      document.body.style.overflow = "";
      if (canSpeak) window.speechSynthesis.cancel();
      recRef.current?.stop();
    };
  }, [canSpeak]);

  // Tick timers; chime when one finishes.
  useEffect(() => {
    if (!timers.some((t) => !t.done)) return;
    const id = setInterval(() => {
      const t0 = Date.now();
      setNow(t0);
      setTimers((ts) =>
        ts.map((t) => {
          if (!t.done && t.end <= t0) {
            chime(audio.current);
            say(`${t.label} timer is done.`, true);
            return { ...t, done: true };
          }
          return t;
        }),
      );
    }, 500);
    return () => clearInterval(id);
  }, [timers, say]);

  const handleCommand = useCallback(
    (raw: string) => {
      const c = raw.toLowerCase().replace(/^(hey |ok )?luka[, ]*/, "").trim();
      setHeard(raw);
      const cur = stateRef.current.step;
      if (/\b(next|continue|done|ready)\b/.test(c)) return go(cur + 1);
      if (/\b(back|previous|go back)\b/.test(c)) return go(cur - 1);
      if (/\b(repeat|again|read)\b/.test(c)) return readStep(cur, true);
      if (/\b(stop|quiet|shush)\b/.test(c)) return canSpeak && window.speechSynthesis.cancel();
      const timer = c.match(/timer (?:for )?(\d+|[a-z-]+) (?:minute|min)/) ?? c.match(/(\d+|[a-z-]+) (?:minute|min)\w* timer/);
      if (timer) {
        const n = Number(timer[1]) || NUM_WORDS[timer[1]];
        const label = c.match(/for (?:the )?([a-z ]+)$/)?.[1];
        if (n) return addTimer(n, label ? label[0].toUpperCase() + label.slice(1) : undefined);
      }
      const much = c.match(/how much (.+?)\??$/) ?? c.match(/how many (.+?)\??$/);
      if (much) {
        const word = much[1].replace(/^(of )?(the )?/, "").replace(/ (do i need|goes in|now)$/, "").trim();
        const hit = card.ingredients.find((i) => i.toLowerCase().includes(word.replace(/s$/, "")));
        return say(hit ? hit : `I couldn't find ${word} in this recipe.`, true);
      }
    },
    [go, readStep, addTimer, card.ingredients, say, canSpeak],
  );

  const toggleVoice = () => {
    if (listening) {
      recRef.current?.stop();
      recRef.current = null;
      setListening(false);
      return;
    }
    if (!SR) return;
    const rec = new (SR as new () => Recognition)();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) handleCommand(e.results[i][0].transcript);
    };
    rec.onend = () => {
      // Keep listening while Cook Mode is open (browsers end sessions after silence).
      if (recRef.current === rec) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      }
    };
    rec.onerror = () => {};
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  // Keyboard: arrows to move, space to read.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(stateRef.current.step + 1);
      if (e.key === "ArrowLeft") go(stateRef.current.step - 1);
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const isLast = step === card.steps.length - 1;

  if (rating && cloud.household && card.recipeId) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-bg p-4" role="dialog" aria-modal="true" aria-label="Rate this meal">
        <CookModeFeedbackCard householdId={cloud.household.id} recipeId={card.recipeId} title={card.title} onDone={onClose} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg" role="dialog" aria-modal="true" aria-label={`Cooking ${card.title}`}>
      <header className="flex items-center gap-3 border-b border-line px-[max(16px,env(safe-area-inset-left))] pt-[max(12px,env(safe-area-inset-top))] pb-3">
        <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-sunk">
          Close
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">{card.title}</p>
          <p className="text-[12px] text-muted">{card.serves}</p>
        </div>
        {canSpeak && (
          <button
            type="button"
            aria-pressed={speak}
            onClick={() => {
              const v = !speak;
              setSpeak(v);
              stateRef.current.speak = v;
              if (v) readStep(step, true);
              else window.speechSynthesis.cancel();
            }}
            className={cx("rounded-full border px-3 py-1.5 text-[13px] font-semibold", speak ? "border-saffron bg-saffron-soft text-saffron-ink" : "border-line")}
          >
            Read aloud
          </button>
        )}
        {SR && config.features.voice ? (
          <button
            type="button"
            aria-pressed={listening}
            onClick={toggleVoice}
            title='Say "next", "back", "repeat", "set a 10 minute timer" or "how much ginger"'
            className={cx("rounded-full border px-3 py-1.5 text-[13px] font-semibold", listening ? "border-leaf bg-leaf-soft text-leaf" : "border-line")}
          >
            {listening ? "Listening" : "Voice"}
          </button>
        ) : null}
      </header>

      {listening && (
        <p className="border-b border-line bg-leaf-soft px-4 py-2 text-center text-[13px] text-leaf">
          Try “next”, “repeat”, “set a 12 minute timer for the plantains” or “how much ginger?”{heard && <> · Heard: “{heard}”</>}
        </p>
      )}

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-[max(20px,env(safe-area-inset-left))] py-6">
        {step < 0 ? (
          <div className="grid gap-6">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Before you start</p>
              <h2 className="mt-1 font-display text-3xl font-semibold">Get everything out</h2>
              <p className="mt-1 text-muted">
                {card.activeMin} min hands-on · {card.totalMin} min total
              </p>
            </div>
            {card.notes.length > 0 && (
              <ul className="grid gap-2 rounded-2xl bg-saffron-soft p-4 text-[15px] text-saffron-ink">
                {card.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <ul className="grid gap-x-6 gap-y-2 text-lg sm:grid-cols-2">
              {card.ingredients.map((i) => (
                <li key={i} className="border-b border-line pb-2">
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="my-auto">
            <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
              Step {step + 1} of {card.steps.length}
            </p>
            <p className="mt-3 font-display text-[26px] leading-snug sm:text-[34px]">
              <StepBody parts={card.steps[step]} onTimer={(m) => addTimer(m)} />
            </p>
            {isLast && card.safety.length > 0 && (
              <div className="mt-8 rounded-2xl border border-leaf/40 bg-leaf-soft p-4 text-leaf">
                <p className="font-semibold">Safety check before serving</p>
                <ul className="mt-1 grid gap-1 text-[15px]">
                  {card.safety.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </main>

      {timers.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-line px-4 py-2">
          {timers.map((t) => (
            <div key={t.id} className={cx("flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold tnum", t.done ? "animate-pulse bg-saffron text-white" : "bg-sunk")}>
              <span>{t.label}</span>
              <span>{t.done ? "Done" : fmt(t.end - now)}</span>
              <button type="button" aria-label="Dismiss timer" onClick={() => setTimers((x) => x.filter((y) => y.id !== t.id))} className="opacity-70 hover:opacity-100">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {showIngredients && step >= 0 && (
        <ul className="max-h-48 overflow-y-auto border-t border-line bg-surface px-5 py-3 text-[15px]">
          {card.ingredients.map((i) => (
            <li key={i} className="py-0.5">
              {i}
            </li>
          ))}
        </ul>
      )}

      <footer className="flex items-center gap-3 border-t border-line px-[max(16px,env(safe-area-inset-left))] pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <Button size="lg" onClick={() => go(step - 1)} disabled={step < 0}>
          Back
        </Button>
        {step >= 0 && (
          <Button size="lg" variant="ghost" onClick={() => setShowIngredients(!showIngredients)}>
            Ingredients
          </Button>
        )}
        <div className="flex-1" />
        {isLast ? (
          <Button
            size="lg"
            variant="leaf"
            onClick={() => {
              track("cook_finished", { steps: card.steps.length, timers: timers.length, voice: listening });
              if (canRate) setRating(true);
              else onClose();
            }}
          >
            Finished
          </Button>
        ) : (
          <Button size="lg" variant="primary" onClick={() => go(step + 1)}>
            {step < 0 ? "Start cooking" : "Next step"}
          </Button>
        )}
      </footer>
    </div>
  );
}

function chime(ctx: AudioContext | null) {
  if (!ctx) return;
  const t = ctx.currentTime;
  [0, 0.25, 0.5].forEach((d, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = i === 2 ? 1046 : 784;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
    o.connect(g).connect(ctx.destination);
    o.start(t + d);
    o.stop(t + d + 0.25);
  });
}
