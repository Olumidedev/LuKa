"use client";

import { useState } from "react";
import { call } from "@/lib/ai/client";
import { ALL_COUNTRIES } from "@/lib/data/countries";
import { Button, Label, Segmented, cx, inputCls, useToast } from "../ui";

type Kind = "themealdb" | "wikibooks" | "public_domain";

const ABOUT: Record<Kind, string> = {
  themealdb: "Takes only facts (dish name, country, ingredients). LUKA writes its own method, because TheMealDB's methods are often copied from publishers. Check the method reads as original before approving.",
  wikibooks: "CC BY-SA 4.0. LUKA adapts the recipe and keeps the attribution and licence; adapted recipes stay CC BY-SA.",
  public_domain:
    "Paste one recipe from an out-of-copyright cookbook (Project Gutenberg, Internet Archive, Feeding America). Books from before 1930 count as public domain; for later books, confirm the rights yourself.",
};

/** Admin → Data → Import recipes: licensed sources only; everything waits in Review. */
export function ImportPanel({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>("wikibooks");
  const [country, setCountry] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(3);
  const [pd, setPd] = useState({ title: "", text: "", book: "", year: "", url: "", archive: "gutenberg", confirmed: false });
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!ALL_COUNTRIES.includes(country)) return toast({ text: "Choose a country from the list." });
    setBusy(true);
    try {
      const body = kind === "public_domain" ? { kind, country, ...pd, year: Number(pd.year) || null } : { kind, country, category, limit };
      const res = await call<{ upserted: number; details?: { skipped?: string[]; note?: string } }>("/api/admin/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      toast({ text: res.details?.note ?? `${res.upserted} recipe${res.upserted === 1 ? "" : "s"} sent to Review.` });
      if (kind === "public_domain") setPd((p) => ({ ...p, title: "", text: "" }));
      onDone();
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Import failed." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5">
      <h2 className="text-lg font-semibold">Import recipes</h2>
      <Segmented<Kind>
        value={kind}
        onChange={setKind}
        options={[
          { value: "wikibooks", label: "Wikibooks" },
          { value: "themealdb", label: "TheMealDB" },
          { value: "public_domain", label: "Public-domain book" },
        ]}
      />
      <p className="text-[13px] text-muted">{ABOUT[kind]}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="imp-country">Country</Label>
          <input id="imp-country" list="imp-countries" className={inputCls} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Nigeria" />
          <datalist id="imp-countries">
            {ALL_COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        {kind === "wikibooks" && (
          <div>
            <Label htmlFor="imp-cat">Wikibooks category</Label>
            <input id="imp-cat" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Nigerian recipes" />
          </div>
        )}
        {kind !== "public_domain" && (
          <div>
            <Label htmlFor="imp-limit">How many</Label>
            <select id="imp-limit" className={inputCls} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      {kind === "public_domain" && (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pd-title">Recipe name</Label>
              <input id="pd-title" className={inputCls} value={pd.title} onChange={(e) => setPd({ ...pd, title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pd-book">Book</Label>
              <input id="pd-book" className={inputCls} value={pd.book} onChange={(e) => setPd({ ...pd, book: e.target.value })} placeholder="e.g. La Cuisine Créole" />
            </div>
            <div>
              <Label htmlFor="pd-year">Year published</Label>
              <input id="pd-year" inputMode="numeric" className={inputCls} value={pd.year} onChange={(e) => setPd({ ...pd, year: e.target.value })} placeholder="e.g. 1885" />
            </div>
            <div>
              <Label htmlFor="pd-archive">Archive</Label>
              <select id="pd-archive" className={inputCls} value={pd.archive} onChange={(e) => setPd({ ...pd, archive: e.target.value })}>
                <option value="gutenberg">Project Gutenberg</option>
                <option value="internet_archive">Internet Archive</option>
                <option value="feeding_america">Feeding America (MSU)</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="pd-url">Link to the book</Label>
            <input id="pd-url" type="url" className={inputCls} value={pd.url} onChange={(e) => setPd({ ...pd, url: e.target.value })} placeholder="https://www.gutenberg.org/ebooks/…" />
          </div>
          <div>
            <Label htmlFor="pd-text">Recipe text</Label>
            <textarea id="pd-text" rows={8} className={cx(inputCls, "h-auto py-2")} value={pd.text} onChange={(e) => setPd({ ...pd, text: e.target.value })} />
          </div>
          {Number(pd.year) >= 1930 || !pd.year ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={pd.confirmed} onChange={(e) => setPd({ ...pd, confirmed: e.target.checked })} />
              <span>I&apos;ve checked this book is out of copyright.</span>
            </label>
          ) : null}
        </div>
      )}
      <Button variant="primary" className="justify-self-start" onClick={run} disabled={busy}>
        {busy ? "Importing… (about 20 s a recipe)" : "Import to Review"}
      </Button>
    </section>
  );
}
