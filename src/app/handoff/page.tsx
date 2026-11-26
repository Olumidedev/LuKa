"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/brand";
import { CookMode } from "@/components/CookMode";
import { Button } from "@/components/ui";
import { stepText } from "@/lib/engine/cookcard";
import { decodeHandoff, type Handoff } from "@/lib/engine/handoff";

/** Partner/helper view (FR-5.2): opens from a link, no account, nothing sent to the server. */
export default function HandoffPage() {
  const [h, setH] = useState<Handoff | null | undefined>(undefined);
  const [cooking, setCooking] = useState(false);

  useEffect(() => {
    const read = () => setH(decodeHandoff(window.location.hash.slice(1)));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  if (h === undefined) return <div className="min-h-dvh" />;
  if (!h)
    return (
      <main className="mx-auto max-w-xl px-5 py-16">
        <Logo size={34} wordClass="text-2xl" />
        <h1 className="mt-4 font-display text-2xl font-semibold">This handoff link is incomplete</h1>
        <p className="mt-2 text-muted">Ask whoever sent it to share it again. Copy the whole link, including everything after the “#”.</p>
      </main>
    );

  const { card } = h;
  return (
    <main className="mx-auto max-w-2xl px-[max(20px,env(safe-area-inset-left))] py-10">
      <Logo size={30} wordClass="text-xl" />
      <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
        {h.from ? `From ${h.from}` : "Dinner handoff"}
        {h.when ? ` · ${h.when}` : ""}
      </p>
      <h1 className="mt-1 font-display text-4xl font-semibold leading-tight">
        {h.cook ? `${h.cook}, you're cooking ${card.title}` : card.title}
      </h1>
      <p className="mt-2 text-muted">
        {card.activeMin} min hands-on · {card.totalMin} min total · {card.serves}
      </p>
      <Button variant="primary" size="lg" className="mt-6" onClick={() => setCooking(true)}>
        Start guided cooking
      </Button>
      {card.notes.length > 0 && (
        <ul className="mt-8 grid gap-1.5 rounded-2xl bg-saffron-soft p-4 text-sm text-saffron-ink">
          {card.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <h2 className="mt-8 font-semibold">Ingredients</h2>
      <ul className="mt-2 grid gap-1.5">
        {card.ingredients.map((i) => (
          <li key={i} className="border-b border-line pb-1.5">
            {i}
          </li>
        ))}
      </ul>
      <h2 className="mt-8 font-semibold">Method</h2>
      <ol className="mt-2 grid list-decimal gap-2 pl-5">
        {card.steps.map((s, i) => (
          <li key={i}>{stepText(s)}</li>
        ))}
      </ol>
      {card.safety.length > 0 && <p className="mt-6 text-sm text-leaf">{card.safety.join(" · ")}</p>}
      {cooking && <CookMode card={card} onClose={() => setCooking(false)} />}
    </main>
  );
}
