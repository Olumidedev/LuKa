"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "secondary" | "ghost" | "leaf" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-saffron text-white hover:brightness-95 dark:text-[#1c1917]",
    leaf: "bg-leaf text-white dark:text-[#1c1917] hover:brightness-95",
    secondary: "bg-surface text-fg border border-line hover:bg-sunk",
    ghost: "text-fg hover:bg-sunk",
    danger: "text-danger hover:bg-danger-soft",
  };
  const s = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-base" }[size];
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:opacity-40 disabled:pointer-events-none",
        v[variant],
        s,
        className,
      )}
    />
  );
}

export function Chip({
  active,
  onClick,
  children,
  className,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition",
        active ? "border-saffron bg-saffron-soft text-saffron-ink" : "border-line bg-surface text-fg hover:border-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Tag({ tone = "neutral", children }: { tone?: "neutral" | "leaf" | "saffron" | "danger"; children: React.ReactNode }) {
  const t = {
    neutral: "bg-sunk text-muted",
    leaf: "bg-leaf-soft text-leaf",
    saffron: "bg-saffron-soft text-saffron-ink",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide", t)}>{children}</span>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" className={cx("inline-flex rounded-full border border-line bg-sunk p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition whitespace-nowrap",
            value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className={cx(
          "sheet-in relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-surface shadow-2xl outline-none sm:rounded-3xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 pt-5 pb-4">
          <div className="min-w-0 font-display text-xl font-semibold leading-tight">{title}</div>
          <button type="button" onClick={onClose} className="-mr-1 rounded-full p-1.5 text-muted hover:bg-sunk hover:text-fg" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
      {children}
    </label>
  );
}

export const inputCls =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-fg placeholder:text-muted/70 focus:border-saffron focus:outline-none";

/* ── Toasts ─────────────────────────────────────────── */
type Toast = { id: number; text: string; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts([{ ...t, id }]); // one at a time keeps the screen calm
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 6000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="sheet-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-fg px-4 py-3 text-sm text-bg shadow-xl">
            <span>{t.text}</span>
            {t.action && (
              <button
                type="button"
                className="font-semibold text-saffron"
                onClick={() => {
                  t.action!.run();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function money(n: number) {
  return `$${n.toFixed(n >= 100 ? 0 : 2)}`;
}
