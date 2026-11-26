"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/cloud/supabase";
import { Shell } from "./LoginForm";
import { Button, Label, cx, inputCls } from "./ui";

/** Landing page for the "Forgot password?" email: choose a new password. */
export function ResetPassword() {
  const sb = getSupabase();
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ready" | "expired">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!sb) return setStatus("expired");
    // The recovery link signs the person in for this one purpose.
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setStatus("ready");
    });
    const t = setTimeout(async () => {
      const { data: s } = await sb.auth.getSession();
      setStatus((cur) => (cur === "ready" || s.session ? "ready" : "expired"));
    }, 1500);
    return () => {
      clearTimeout(t);
      data.subscription.unsubscribe();
    };
  }, [sb]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sb) return;
    if (password.length < 8) return setMsg({ tone: "err", text: "Passwords need at least 8 characters." });
    if (password !== confirm) return setMsg({ tone: "err", text: "The two passwords don't match." });
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg({ tone: "err", text: /different from the old/i.test(error.message) ? "Choose a password you haven't used before." : error.message });
    setMsg({ tone: "ok", text: "Password changed. Opening LUKA…" });
    setTimeout(() => router.replace("/"), 900);
  };

  return (
    <Shell>
      {status === "checking" && <p className="text-muted">Checking your link…</p>}
      {status === "expired" && (
        <>
          <h1 className="font-display text-3xl font-semibold">This link has expired</h1>
          <p className="mt-2 text-muted">Reset links work once, last an hour, and must be opened in the same browser you asked from. Ask for a new one.</p>
          <Link href="/login" className="mt-6 inline-block font-semibold text-saffron-ink underline">
            Back to log in
          </Link>
        </>
      )}
      {status === "ready" && (
        <form onSubmit={submit} noValidate className="grid gap-4">
          <h1 className="font-display text-3xl font-semibold">Choose a new password</h1>
          <div>
            <Label htmlFor="new-password">New password</Label>
            <input id="new-password" type="password" autoComplete="new-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="mt-1 text-[12px] text-muted">At least 8 characters.</p>
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <input id="confirm-password" type="password" autoComplete="new-password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {msg && <p className={cx("rounded-xl px-3 py-2 text-sm", msg.tone === "ok" ? "bg-leaf-soft text-leaf" : "bg-danger-soft text-danger")}>{msg.text}</p>}
          <Button type="submit" variant="primary" size="lg" disabled={busy}>
            {busy ? "Saving…" : "Save new password"}
          </Button>
        </form>
      )}
    </Shell>
  );
}
