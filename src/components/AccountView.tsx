"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { analyticsEnabled, setAnalyticsEnabled, track } from "@/lib/analytics";
import { useAuth } from "@/lib/cloud/auth";
import { getSupabase } from "@/lib/cloud/supabase";
import { useCloud, type SyncStatus } from "@/lib/cloud/sync";
import { FeedbackSheet } from "./FeedbackSheet";
import { Button, Label, cx, inputCls, useToast } from "./ui";

const STATUS: Record<SyncStatus, string> = {
  local: "Saved on this device",
  connecting: "Connecting…",
  synced: "Synced to your account",
  saving: "Saving…",
  offline: "Offline: changes are kept and will sync",
  error: "Couldn't sync. Changes are kept on this device",
};

/** My account: profile, household sharing, privacy, sign out, delete. */
export function AccountView() {
  const { user, signOut } = useAuth();
  const cloud = useCloud();
  const toast = useToast();
  const router = useRouter();
  const sb = getSupabase();
  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [hhName, setHhName] = useState("");
  const [stats, setStats] = useState(true);
  const [feedback, setFeedback] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setStats(analyticsEnabled()), []);
  useEffect(() => {
    if (!sb || !user) return;
    sb.from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? "");
        setSavedName(data?.display_name ?? "");
      });
  }, [sb, user]);
  useEffect(() => setHhName(cloud.household?.name ?? ""), [cloud.household]);

  if (!user || !sb) return <p className="text-muted">Sign in to manage your account.</p>;
  const provider = String(user.app_metadata?.provider ?? "email");

  const saveName = async () => {
    const v = displayName.trim().slice(0, 80);
    const { error } = await sb.from("profiles").update({ display_name: v || null }).eq("id", user.id);
    if (error) return toast({ text: "Couldn't save your name. Try again." });
    setSavedName(v);
    toast({ text: "Saved." });
  };

  const renameHousehold = async () => {
    if (!cloud.household) return;
    const v = hhName.trim().slice(0, 80);
    if (!v) return;
    const { error } = await sb.from("households").update({ name: v }).eq("id", cloud.household.id);
    toast({ text: error ? "Only the household owner can rename it." : "Household renamed." });
  };

  const invite = async () => {
    try {
      const code = await cloud.invite();
      track("invite_created");
      const url = `${window.location.origin}/join#${code}`;
      const text = "Join our household on LUKA so we share the meal plan and shopping list:";
      if (navigator.share) await navigator.share({ title: "Join our LUKA household", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast({ text: "Invite link copied. It works for 7 days." });
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") toast({ text: e.message });
    }
  };

  const doSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      const { data } = await sb.auth.getSession();
      const res = await fetch("/api/account", { method: "DELETE", headers: { authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't delete the account.");
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith("luka:") && k !== "luka:theme") localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
      await signOut();
      window.location.replace("/login");
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : "Couldn't delete the account." });
      setBusy(false);
    }
  };

  return (
    <div className="grid max-w-2xl gap-8">
      <header className="flex items-center gap-4">
        <span className="flex size-14 items-center justify-center rounded-full bg-saffron font-display text-2xl font-bold text-white dark:text-[#1c1917]">
          {(savedName || user.email || "?")[0].toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-semibold">{savedName || "My account"}</h1>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
      </header>

      <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Profile</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 basis-56">
            <Label htmlFor="display-name">Your name</Label>
            <input id="display-name" className={inputCls} maxLength={80} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="What should LUKA call you?" />
          </div>
          <Button onClick={saveName} disabled={displayName.trim() === savedName}>
            Save
          </Button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Signs in with</dt>
          <dd className="capitalize">{provider}</dd>
          <dt className="text-muted">Member since</dt>
          <dd>{new Date(user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</dd>
        </dl>
      </section>

      <section className="grid gap-4 rounded-3xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Household</h2>
        <p className={cx("text-sm", cloud.status === "error" ? "text-danger" : "text-muted")}>{STATUS[cloud.status]}</p>
        {cloud.household && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-56">
              <Label htmlFor="household-name">Household name</Label>
              <input id="household-name" className={inputCls} maxLength={80} value={hhName} onChange={(e) => setHhName(e.target.value)} />
            </div>
            <Button onClick={renameHousehold} disabled={!hhName.trim() || hhName.trim() === cloud.household.name}>
              Rename
            </Button>
          </div>
        )}
        <div>
          <Button variant="primary" onClick={invite} disabled={!cloud.household}>
            Invite someone to your household
          </Button>
          <p className="mt-2 text-[13px] text-muted">They&apos;ll share your plan, shopping list and recipes. Links work for 7 days.</p>
        </div>
      </section>

      <section className="grid gap-3 rounded-3xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">Privacy</h2>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--saffron)]"
            checked={stats}
            onChange={(e) => {
              setStats(e.target.checked);
              setAnalyticsEnabled(e.target.checked);
            }}
          />
          <span>
            <b className="font-semibold">Share anonymous usage stats.</b> Which features get used and when something crashes. Never names, recipes or health details.
          </span>
        </label>
        <Button className="justify-self-start" onClick={() => setFeedback(true)}>
          Report a problem or share an idea
        </Button>
      </section>

      <section className="grid gap-3 border-t border-line pt-6">
        <Button className="justify-self-start" onClick={doSignOut}>
          Log out
        </Button>
        {confirmDelete ? (
          <div className="grid gap-2 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
            <p>
              Delete your account? Households only you belong to are deleted too. Shared households pass to the next member. This can&apos;t be undone.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" className="!bg-danger !text-white" onClick={deleteAccount} disabled={busy}>
                {busy ? "Deleting…" : "Delete my account"}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep my account
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" className="justify-self-start" onClick={() => setConfirmDelete(true)}>
            Delete account
          </Button>
        )}
      </section>
      <FeedbackSheet open={feedback} onClose={() => setFeedback(false)} />
    </div>
  );
}
