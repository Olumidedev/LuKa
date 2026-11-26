"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/cloud/auth";
import { getSupabase, googleEnabled } from "@/lib/cloud/supabase";
import { LogoMark, Wordmark } from "./brand";
import { Button, Label, Segmented, cx, inputCls } from "./ui";

type Mode = "signin" | "signup" | "link";

export function LoginForm() {
  const sb = getSupabase();
  const { user, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") === "join" ? "/join" : "/";
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (ready && user) router.replace(next);
  }, [ready, user, router, next]);

  if (!sb) {
    return (
      <Shell>
        <h1 className="font-display text-3xl font-semibold">Sign-in isn&apos;t switched on yet</h1>
        <p className="mt-2 text-muted">This copy of LUKA saves everything on your device. Accounts and sync turn on once the server has a Supabase project.</p>
        <Link href="/" className="mt-6 inline-block font-semibold text-saffron-ink underline">
          Open LUKA
        </Link>
      </Shell>
    );
  }

  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}${next}` : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ tone: "err", text: "Enter a valid email address." });
    if (mode !== "link" && password.length < 8) return setMsg({ tone: "err", text: "Passwords need at least 8 characters." });
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (!data.session) setMsg({ tone: "ok", text: `Check ${email} for a confirmation link, then come back here.` });
      } else {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setMsg({ tone: "ok", text: `We sent a sign-in link to ${email}. Open it on this device.` });
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : "Something went wrong.";
      setMsg({ tone: "err", text: /invalid login/i.test(text) ? "That email and password don't match. Try again or use an email link." : text });
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setMsg(null);
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) setMsg({ tone: "err", text: error.message });
  };

  return (
    <Shell>
      <h1 className="font-display text-3xl font-semibold">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-muted">{mode === "signup" ? "It takes a minute. Then tell LUKA who you cook for." : "Sign in to open your kitchen."}</p>

      {googleEnabled() && (
        <>
          <Button size="lg" className="mt-6 w-full" onClick={google}>
            Continue with Google
          </Button>
          <p className="my-4 text-center text-[13px] text-muted">or use your email</p>
        </>
      )}

      <form onSubmit={submit} className={cx("grid gap-4", !googleEnabled() && "mt-6")}>
        <Segmented<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m);
            setMsg(null);
          }}
          options={[
            { value: "signin", label: "Sign in" },
            { value: "signup", label: "Create account" },
            { value: "link", label: "Email me a link" },
          ]}
        />
        <div>
          <Label htmlFor="email">Email</Label>
          <input id="email" type="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== "link" && (
          <div>
            <Label htmlFor="password">Password</Label>
            <input
              id="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        {msg && <p className={cx("rounded-xl px-3 py-2 text-sm", msg.tone === "ok" ? "bg-leaf-soft text-leaf" : "bg-danger-soft text-danger")}>{msg.text}</p>}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? "One moment…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send link"}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative flex flex-col justify-between gap-10 overflow-hidden bg-[#1c1917] px-[max(24px,env(safe-area-inset-left))] py-10 text-[#faf8f5] lg:px-14 lg:py-14">
        <span className="inline-flex items-center gap-3">
          <LogoMark size={40} className="[--fg:#faf8f5] [--bg:#1c1917]" />
          <Wordmark className="text-3xl" />
        </span>
        <div className="max-w-md">
          <h2 className="font-display text-4xl font-semibold leading-tight lg:text-5xl">Your calm, culturally fluent sous-chef.</h2>
          <ul className="mt-6 grid gap-3 text-[15px] text-[#faf8f5]/80">
            <li>Meal plans from the kitchens you grew up with, and the ones you love.</li>
            <li>One shopping list. Buy once, cook across the week, waste less.</li>
            <li>Step-by-step cooking anyone at home can follow.</li>
          </ul>
        </div>
        <p className="hidden text-[13px] text-[#faf8f5]/50 lg:block">Allergies are always respected. No judgement for takeout nights.</p>
        <svg aria-hidden className="pointer-events-none absolute -right-16 -bottom-16 h-72 w-72 opacity-[0.08]" viewBox="0 0 48 48">
          <path d="M5 22h38v2a19 17 0 0 1-38 0v-2z" fill="#d97706" />
        </svg>
      </section>
      <section className="flex items-center justify-center px-[max(20px,env(safe-area-inset-left))] py-10">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
