"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/cloud/auth";
import { getSupabase, googleEnabled } from "@/lib/cloud/supabase";
import { LogoMark, Wordmark } from "./brand";
import { Button, Label, Segmented, cx, inputCls } from "./ui";

type Mode = "login" | "register" | "forgot" | "link";

const friendly = (text: string) =>
  /invalid login/i.test(text)
    ? "That email and password don't match. Try again, or reset your password."
    : /email not confirmed/i.test(text)
      ? "Confirm your email first: open the link we sent you."
      : /already registered/i.test(text)
        ? "There's already an account with that email. Log in instead."
        : text;

export function LoginForm() {
  const sb = getSupabase();
  const { user, ready } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") === "join" ? "/join" : "/";
  const [mode, setMode] = useState<Mode>(params.get("mode") === "register" ? "register" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
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

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirectTo = `${origin}${next}`;
  const go = (m: Mode) => {
    setMode(m);
    setMsg(null);
    setSentTo(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setMsg({ tone: "err", text: "Enter a valid email address." });
    if (mode === "register") {
      if (!name.trim()) return setMsg({ tone: "err", text: "Tell LUKA what to call you." });
      if (password.length < 8) return setMsg({ tone: "err", text: "Passwords need at least 8 characters." });
      if (password !== confirm) return setMsg({ tone: "err", text: "The two passwords don't match." });
    }
    if (mode === "login" && !password) return setMsg({ tone: "err", text: "Enter your password." });
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "register") {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, data: { display_name: name.trim().slice(0, 80) } } });
        if (error) throw error;
        // Supabase hides whether an address is taken; an empty identity list means it is.
        if (data.user && data.user.identities?.length === 0) {
          setMsg({ tone: "err", text: "There's already an account with that email. Log in, or reset your password." });
        } else if (!data.session) {
          setSentTo(email);
        }
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` });
        if (error) throw error;
        setSentTo(email);
      } else {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
        if (error) throw error;
        setSentTo(email);
      }
    } catch (err) {
      setMsg({ tone: "err", text: friendly(err instanceof Error ? err.message : "Something went wrong.") });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!sentTo) return;
    setBusy(true);
    const { error } =
      mode === "register"
        ? await sb.auth.resend({ type: "signup", email: sentTo, options: { emailRedirectTo: redirectTo } })
        : mode === "forgot"
          ? await sb.auth.resetPasswordForEmail(sentTo, { redirectTo: `${origin}/reset-password` })
          : await sb.auth.signInWithOtp({ email: sentTo, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
    setBusy(false);
    setMsg(error ? { tone: "err", text: friendly(error.message) } : { tone: "ok", text: "Sent again." });
  };

  const google = async () => {
    setMsg(null);
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) setMsg({ tone: "err", text: error.message });
  };

  if (sentTo) {
    const what = mode === "register" ? "Confirm your email" : mode === "forgot" ? "Check your email" : "Check your email";
    const body =
      mode === "register"
        ? `We sent a confirmation link to ${sentTo}. Open it on this device to finish registering, then LUKA will ask who you cook for.`
        : mode === "forgot"
          ? `If there's an account for ${sentTo}, we've sent a link to choose a new password. It works once and expires in an hour.`
          : `If there's an account for ${sentTo}, we've sent a sign-in link. Open it on this device.`;
    return (
      <Shell>
        <h1 className="font-display text-3xl font-semibold">{what}</h1>
        <p className="mt-3 text-muted">{body}</p>
        <p className="mt-3 text-[13px] text-muted">Nothing arrived after a few minutes? Check spam, or send it again.</p>
        {msg && <p className={cx("mt-4 rounded-xl px-3 py-2 text-sm", msg.tone === "ok" ? "bg-leaf-soft text-leaf" : "bg-danger-soft text-danger")}>{msg.text}</p>}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={resend} disabled={busy}>
            Send again
          </Button>
          <Button variant="ghost" onClick={() => go("login")}>
            Back to log in
          </Button>
        </div>
      </Shell>
    );
  }

  const heading = { login: "Welcome back", register: "Create your account", forgot: "Reset your password", link: "Log in with an email link" }[mode];
  const sub = {
    login: "Log in to open your kitchen.",
    register: "It takes a minute. Then tell LUKA who you cook for.",
    forgot: "Enter your email and we'll send a link to choose a new password.",
    link: "No password needed. We'll email you a one-time link.",
  }[mode];
  const cta = { login: "Log in", register: "Register", forgot: "Send reset link", link: "Send link" }[mode];

  return (
    <Shell>
      {(mode === "login" || mode === "register") && (
        <Segmented<Mode>
          value={mode}
          onChange={go}
          options={[
            { value: "login", label: "Log in" },
            { value: "register", label: "Register" },
          ]}
        />
      )}
      <h1 className="mt-6 font-display text-3xl font-semibold">{heading}</h1>
      <p className="mt-2 text-muted">{sub}</p>

      {googleEnabled() && (mode === "login" || mode === "register") && (
        <>
          <Button size="lg" className="mt-6 w-full" onClick={google}>
            {mode === "register" ? "Register with Google" : "Log in with Google"}
          </Button>
          <p className="my-4 text-center text-[13px] text-muted">or use your email</p>
        </>
      )}

      <form onSubmit={submit} noValidate className={cx("grid gap-4", !(googleEnabled() && (mode === "login" || mode === "register")) && "mt-6")}>
        {mode === "register" && (
          <div>
            <Label htmlFor="name">What should LUKA call you?</Label>
            <input id="name" autoComplete="given-name" className={inputCls} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
        )}
        <div>
          <Label htmlFor="email">Email</Label>
          <input id="email" type="email" autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {(mode === "login" || mode === "register") && (
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password">Password</Label>
              {mode === "login" && (
                <button type="button" className="text-[13px] font-semibold text-saffron-ink underline" onClick={() => go("forgot")}>
                  Forgot password?
                </button>
              )}
            </div>
            <input
              id="password"
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "register" && <p className="mt-1 text-[12px] text-muted">At least 8 characters.</p>}
          </div>
        )}
        {mode === "register" && (
          <div>
            <Label htmlFor="confirm">Confirm password</Label>
            <input id="confirm" type="password" autoComplete="new-password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        )}
        {msg && <p className={cx("rounded-xl px-3 py-2 text-sm", msg.tone === "ok" ? "bg-leaf-soft text-leaf" : "bg-danger-soft text-danger")}>{msg.text}</p>}
        <Button type="submit" variant="primary" size="lg" disabled={busy}>
          {busy ? "One moment…" : cta}
        </Button>
        {mode === "login" && (
          <button type="button" className="text-[13px] text-muted underline" onClick={() => go("link")}>
            Email me a sign-in link instead
          </button>
        )}
        {(mode === "forgot" || mode === "link") && (
          <button type="button" className="text-[13px] font-semibold underline" onClick={() => go("login")}>
            Back to log in
          </button>
        )}
      </form>
    </Shell>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
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
