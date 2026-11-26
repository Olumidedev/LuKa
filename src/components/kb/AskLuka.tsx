"use client";

import { useEffect, useRef, useState } from "react";
import { call } from "@/lib/ai/client";
import { track } from "@/lib/analytics";
import { useCloud } from "@/lib/cloud/sync";
import { Button, Chip, Sheet, cx, inputCls } from "../ui";

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = ["What can I make with plantain and beans?", "Is ugu a good source of iron?", "A Jamaican dish my Nigerian family would like?"];

/**
 * "Ask LUKA": a sous-chef that answers from LUKA's verified knowledge base.
 * It never makes up nutrition, prices or allergens, and keeps to the
 * household's allergen exclusions (enforced on the server).
 */
export function AskLukaSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cloud = useCloud();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [turns, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const next = [...turns, { role: "user" as const, content: question }];
    setTurns(next);
    setText("");
    setErr("");
    setBusy(true);
    try {
      const res = await call<{ text: string }>("/api/souschef", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, householdId: cloud.household?.id }),
      });
      setTurns([...next, { role: "assistant", content: res.text }]);
      track("souschef_asked");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "LUKA couldn't answer just now.");
      setTurns(turns);
      setText(question);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ask LUKA"
      footer={
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(text);
          }}
        >
          <label htmlFor="ask-luka" className="sr-only">
            Your question
          </label>
          <input id="ask-luka" className={cx(inputCls, "flex-1")} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about a dish, an ingredient, a swap…" maxLength={2000} />
          <Button type="submit" variant="primary" disabled={busy || !text.trim()}>
            Ask
          </Button>
        </form>
      }
    >
      <div className="grid gap-3" aria-live="polite">
        {!turns.length && (
          <>
            <p className="text-sm text-muted">Answers come from LUKA&apos;s checked recipes and ingredient data. When LUKA doesn&apos;t know, it says so.</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <Chip key={s} onClick={() => ask(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </>
        )}
        {turns.map((t, i) => (
          <p key={i} className={cx("max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px]", t.role === "user" ? "justify-self-end bg-saffron-soft text-saffron-ink" : "justify-self-start bg-sunk")}>
            {t.content}
          </p>
        ))}
        {busy && <p className="justify-self-start rounded-2xl bg-sunk px-4 py-2.5 text-[15px] text-muted">Checking the pantry of facts…</p>}
        {err && <p className="text-sm text-danger">{err}</p>}
        <div ref={end} />
      </div>
    </Sheet>
  );
}
