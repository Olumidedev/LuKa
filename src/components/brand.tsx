import { cx } from "./ui";

/**
 * LUKA mark: a Palm Saffron cooking pot with an Ugu leaf rising like steam.
 * Colours come from theme tokens so it reads on Cassava Linen and Cast Iron.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path d="M24 21c0-7 4.5-12.5 13-15-1 9.5-6 14.8-13 15z" fill="var(--leaf)" />
      <path d="M24 21c1.6-4.6 4.8-8.4 9.6-11.6" stroke="var(--bg)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M18 16c-2-2.2-2-4.6 0-7" stroke="var(--saffron)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M5 22h38v2a19 17 0 0 1-38 0v-2z" fill="var(--saffron)" />
      <rect x="3" y="20" width="42" height="4" rx="2" fill="var(--fg)" />
      <path d="M2 27h4M42 27h4" stroke="var(--fg)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cx("font-display font-bold tracking-[0.14em]", className)}>LUKA</span>;
}

export function Logo({ size = 30, className, wordClass = "text-2xl" }: { size?: number; className?: string; wordClass?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 text-fg", className)}>
      <LogoMark size={size} />
      <Wordmark className={wordClass} />
    </span>
  );
}
