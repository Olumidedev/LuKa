"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { useAuth } from "@/lib/cloud/auth";
import { useCloud, type SyncStatus } from "@/lib/cloud/sync";
import { Button, cx, useToast } from "./ui";

const STATUS: Record<SyncStatus, { label: string; dot: string }> = {
  local: { label: "Saved on this device", dot: "bg-muted" },
  connecting: { label: "Connecting…", dot: "bg-saffron" },
  synced: { label: "Synced", dot: "bg-leaf" },
  saving: { label: "Saving…", dot: "bg-saffron" },
  offline: { label: "Offline: changes are kept and will sync", dot: "bg-saffron" },
  error: { label: "Couldn't sync", dot: "bg-danger" },
};

export function AccountMenu() {
  const { configured, user, signOut } = useAuth();
  const cloud = useCloud();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!configured) return null;
  if (!user)
    return (
      <Link href="/login" className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-muted">
        Sign in
      </Link>
    );

  const s = STATUS[cloud.status];
  const initial = (user.email ?? "?")[0].toUpperCase();

  const invite = async () => {
    try {
      const code = await cloud.invite();
      track("invite_created");
      const url = `${window.location.origin}/join#${code}`;
      const text = `Join our household on Luka so we share the meal plan and shopping list:`;
      if (navigator.share) await navigator.share({ title: "Join our Luka household", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast({ text: "Invite link copied. It works for 7 days." });
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") toast({ text: e.message });
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Account: ${s.label}`}
        onClick={() => setOpen(!open)}
        className="relative flex size-10 items-center justify-center rounded-full bg-fg font-semibold text-bg"
      >
        {initial}
        <span className={cx("absolute right-0 bottom-0 size-3 rounded-full border-2 border-bg", s.dot)} />
      </button>
      {open && (
        <div className="sheet-in absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-line bg-surface p-4 shadow-xl">
          <p className="truncate text-sm font-semibold">{user.email}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {cloud.household ? `${cloud.household.name} · ` : ""}
            {s.label}
          </p>
          {cloud.status === "error" && cloud.error && <p className="mt-2 text-[12px] text-danger">{cloud.error}</p>}
          <div className="mt-4 grid gap-2">
            <Button size="sm" onClick={invite} disabled={!cloud.household}>
              Invite someone to your household
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await signOut();
                setOpen(false);
                toast({ text: "Signed out. Your plan stays on this device." });
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
