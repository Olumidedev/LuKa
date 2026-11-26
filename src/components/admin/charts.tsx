"use client";

import { useEffect, useRef, useState } from "react";

const fmt = (n: number) => n.toLocaleString();

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * Single-series column chart (one hue, so no legend; the title names it).
 * Thin bars with 2px gaps and 4px rounded tops, recessive grid, per-bar
 * hover/focus tooltip, and a table view for screen readers and exact values.
 */
export function ColumnChart({ title, data, unit }: { title: string; data: { label: string; value: number }[]; unit: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 180;
  const pad = { l: 34, r: 4, t: 10, b: 24 };
  const pw = w - pad.l - pad.r;
  const ph = H - pad.t - pad.b;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const slot = pw / Math.max(1, data.length);
  const bw = Math.max(2, slot - 2);
  const y = (v: number) => pad.t + ph - (v / max) * ph;
  const ticks = [0, max / 2, max];
  const labelIdx = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{title}</span>
        <span className="text-[13px] text-muted tnum">
          {fmt(total)} {unit} total
        </span>
      </figcaption>
      <div ref={box} className="relative mt-3" onPointerLeave={() => setHover(null)}>
        <svg width={w} height={H} role="img" aria-label={`${title}: ${fmt(total)} ${unit} over ${data.length} days`} className="block max-w-full">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" className="tnum">
                {fmt(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + i * slot + 1;
            const h = Math.max(0, y(0) - y(d.value));
            const r = Math.min(4, bw / 2, h);
            return (
              <g key={d.label}>
                {h > 0 && (
                  <path
                    d={`M${x},${y(0)} V${y(d.value) + r} Q${x},${y(d.value)} ${x + r},${y(d.value)} H${x + bw - r} Q${x + bw},${y(d.value)} ${x + bw},${y(d.value) + r} V${y(0)} Z`}
                    fill="var(--chart)"
                    stroke={hover === i ? "var(--fg)" : "none"}
                    strokeWidth={1.5}
                  />
                )}
                <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ph} fill="transparent" onPointerEnter={() => setHover(i)} />
                {labelIdx.has(i) && (
                  <text x={x + bw / 2} y={H - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted)">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeWidth={1} />
        </svg>
        {hover != null && data[hover] && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-lg"
            style={{ left: Math.min(w - 110, Math.max(0, pad.l + hover * slot + slot / 2 - 50)), top: Math.max(0, y(data[hover].value) - 48) }}
          >
            <div className="text-[14px] font-semibold tnum">
              {fmt(data[hover].value)} {unit}
            </div>
            <div className="text-muted">{data[hover].label}</div>
          </div>
        )}
      </div>
      <DataTable rows={data.map((d) => [d.label, fmt(d.value)])} head={["Day", unit]} />
    </figure>
  );
}

/** Ranked horizontal bars as plain HTML (labels stay real text). */
export function BarList({ title, rows, unit, note }: { title: string; rows: { label: string; value: number; hint?: string }[]; unit: string; note?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="min-w-0">
      <figcaption className="font-semibold">{title}</figcaption>
      {note && <p className="text-[13px] text-muted">{note}</p>}
      {rows.length ? (
        <ul className="mt-3 grid gap-2">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm" title={`${r.label}: ${fmt(r.value)} ${unit}`}>
              <span className="truncate">{r.label}</span>
              <span className="h-3 rounded-r-[4px] bg-chart" style={{ width: `${Math.max(r.value ? 2 : 0, (r.value / max) * 100)}%` }} />
              <span className="text-right tnum">
                {fmt(r.value)}
                {r.hint && <span className="ml-1.5 text-[12px] text-muted">{r.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">No data yet.</p>
      )}
    </figure>
  );
}

function DataTable({ rows, head }: { rows: string[][]; head: string[] }) {
  return (
    <details className="mt-2 text-[13px]">
      <summary className="cursor-pointer text-muted hover:text-fg">Show as table</summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-line">
        <table className="w-full text-left tnum">
          <thead className="sticky top-0 bg-sunk">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-3 py-1.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]} className="border-t border-line">
                {r.map((c, i) => (
                  <td key={i} className="px-3 py-1">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tnum">{typeof value === "number" ? fmt(value) : value}</p>
      {sub && <p className="text-[13px] text-muted">{sub}</p>}
    </div>
  );
}
