"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/cloud/auth";
import { track } from "@/lib/analytics";
import { joinHousehold } from "@/lib/cloud/households";
import { useCloud } from "@/lib/cloud/sync";

const KEY = "luka:join";

/** Joining a household from an invite link: /join#<code>. */
export default function JoinPage() {
  const { user, ready, configured } = useAuth();
  const { switchTo } = useCloud();
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "joining" | "error">("idle");
  const [err, setErr] = useState("");

  useEffect(() => {
    const fromHash = window.location.hash.slice(1).replace(/[^a-z0-9]/gi, "").slice(0, 64);
    try {
      if (fromHash) sessionStorage.setItem(KEY, fromHash);
      setCode(fromHash || sessionStorage.getItem(KEY));
    } catch {
      setCode(fromHash || null);
    }
  }, []);

  const join = async () => {
    if (!code) return;
    setState("joining");
    try {
      const hid = await joinHousehold(code);
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      track("household_joined");
      switchTo(hid);
      router.replace("/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work.");
      setState("error");
    }
  };

  return (
    <main className="mx-auto max-w-md px-[max(20px,env(safe-area-inset-left))] py-16">
      <Link href="/" className="font-display text-3xl font-bold text-saffron">
        Luka
      </Link>
      <h1 className="mt-8 font-display text-3xl font-semibold">Join a household</h1>
      {!configured ? (
        <p className="mt-2 text-muted">Accounts aren&apos;t switched on for this copy of Luka yet.</p>
      ) : !code ? (
        <p className="mt-2 text-muted">This invite link is incomplete. Ask for a new one, and copy everything after the “#”.</p>
      ) : !ready ? null : !user ? (
        <>
          <p className="mt-2 text-muted">Sign in or create an account first, then you&apos;ll share the same plan, shopping list and recipes.</p>
          <Button variant="primary" size="lg" className="mt-6" onClick={() => router.push("/login?next=join")}>
            Sign in to join
          </Button>
        </>
      ) : (
        <>
          <p className="mt-2 text-muted">You&apos;ll switch to this household&apos;s plan. Your current device plan is kept as a backup on this device.</p>
          {state === "error" && <p className="mt-4 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{err}</p>}
          <Button variant="primary" size="lg" className="mt-6" onClick={join} disabled={state === "joining"}>
            {state === "joining" ? "Joining…" : "Join household"}
          </Button>
        </>
      )}
    </main>
  );
}
