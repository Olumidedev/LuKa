"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { track } from "../analytics";
import { useStore } from "../state/store";
import type { AppState } from "../types";
import { useAuth } from "./auth";
import { createHousehold, createInvite, fetchState, myHouseholds, saveState, toCloud, type CloudHousehold } from "./households";

export type SyncStatus = "local" | "connecting" | "synced" | "saving" | "offline" | "error";

interface Cloud {
  status: SyncStatus;
  household: CloudHousehold | null;
  invite: () => Promise<string>;
  /** Load a different household (e.g. one just joined by invite). */
  switchTo: (householdId: string) => void;
  error: string | null;
  /** True once the signed-in person's household has been looked up (or there's no one signed in). */
  ready: boolean;
}

const CloudCtx = createContext<Cloud>({ status: "local", household: null, invite: async () => "", switchTo: () => {}, error: null, ready: true });
export const useCloud = () => useContext(CloudCtx);

const PREF = "luka:household";
const BACKUP = "luka:v1:before-sync";
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

const fingerprint = (s: AppState) => JSON.stringify(toCloud(s));

/**
 * Keeps the local store and the signed-in user's household in step.
 * Local-first: the app never waits on the network; the cloud copy follows.
 */
export function CloudSync({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { state, hydrated, replace } = useStore();
  const toast = useToast();
  const [status, setStatus] = useState<SyncStatus>("local");
  const [household, setHousehold] = useState<CloudHousehold | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [ready, setReady] = useState(false);

  const hid = useRef<string | null>(null);
  const version = useRef(0);
  const synced = useRef<string>("");
  const busy = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const connectedFor = useRef<string | null>(null);

  const applyRemote = useCallback(
    (remote: AppState, v: number) => {
      version.current = v;
      synced.current = fingerprint(remote);
      replace({ ...remote, inCart: stateRef.current.inCart });
    },
    [replace],
  );

  // Connect on sign-in.
  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      setReady(true);
      connectedFor.current = null;
      hid.current = null;
      setHousehold(null);
      setStatus("local");
      return;
    }
    if (connectedFor.current === user.id) return;
    connectedFor.current = user.id;
    setReady(false);
    track("signed_in", { provider: String(user.app_metadata?.provider ?? "email") });
    let live = true;
    (async () => {
      setStatus("connecting");
      try {
        const list = await myHouseholds(user.id);
        const pick = list.find((h) => h.id === store.get(PREF)) ?? list[0];
        if (!live) return;
        if (!pick) {
          // First sign-in: this device's household becomes the account's household.
          if (!stateRef.current.onboarded) {
            setStatus("synced");
            setReady(true);
            return; // created after onboarding finishes (see below)
          }
          const id = await createHousehold(householdName(stateRef.current), stateRef.current);
          hid.current = id;
          version.current = 1;
          synced.current = fingerprint(stateRef.current);
          setHousehold({ id, name: householdName(stateRef.current), role: "owner" });
          store.set(PREF, id);
          toast({ text: "Your household is now saved to your account." });
        } else {
          hid.current = pick.id;
          setHousehold(pick);
          store.set(PREF, pick.id);
          const remote = await fetchState(pick.id);
          if (!live) return;
          if (remote.state?.onboarded) {
            if (stateRef.current.onboarded && fingerprint(stateRef.current) !== fingerprint(remote.state)) {
              store.set(BACKUP, JSON.stringify(stateRef.current));
            }
            applyRemote(remote.state, remote.version);
            toast({ text: `Loaded ${pick.name} from your account.` });
          } else {
            version.current = remote.version;
            synced.current = "";
          }
        }
        setError(null);
        setStatus("synced");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus(navigator.onLine ? "error" : "offline");
        connectedFor.current = null;
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [user, hydrated, applyRemote, toast, nonce]);

  // Push local changes (debounced, one write in flight, optimistic concurrency).
  useEffect(() => {
    if (!user || !hydrated || status === "connecting") return;
    const t = setTimeout(async () => {
      if (busy.current) return;
      const s = stateRef.current;
      if (!s.onboarded) return;
      const fp = fingerprint(s);
      if (fp === synced.current) return;
      busy.current = true;
      setStatus("saving");
      try {
        if (!hid.current) {
          const id = await createHousehold(householdName(s), s);
          hid.current = id;
          version.current = 1;
          setHousehold({ id, name: householdName(s), role: "owner" });
          store.set(PREF, id);
          synced.current = fp;
        } else {
          const r = await saveState(hid.current, s, version.current);
          if (r.ok) {
            version.current = r.version;
            synced.current = fp;
          } else {
            const remote = await fetchState(hid.current);
            if (remote.state) {
              store.set(BACKUP, JSON.stringify(s));
              applyRemote(remote.state, remote.version);
              toast({ text: "Someone else in your household changed the plan, so LUKA loaded their version." });
            }
          }
        }
        setError(null);
        setStatus("synced");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus(navigator.onLine ? "error" : "offline");
      } finally {
        busy.current = false;
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [state, user, hydrated, status, applyRemote, toast]);

  // Pull other members' changes when the app comes back into view.
  useEffect(() => {
    if (!user) return;
    const pull = async () => {
      if (!hid.current || busy.current || document.visibilityState !== "visible") return;
      if (fingerprint(stateRef.current) !== synced.current) return; // local edits pending; push wins first
      try {
        const remote = await fetchState(hid.current);
        if (remote.version > version.current && remote.state) applyRemote(remote.state, remote.version);
      } catch {
        /* next pull will retry */
      }
    };
    const id = setInterval(pull, 60_000);
    document.addEventListener("visibilitychange", pull);
    window.addEventListener("online", pull);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", pull);
      window.removeEventListener("online", pull);
    };
  }, [user, applyRemote]);

  const invite = useCallback(async () => {
    if (!hid.current) throw new Error("Finish setting up your household first.");
    return createInvite(hid.current);
  }, []);

  const switchTo = useCallback((id: string) => {
    store.set(PREF, id);
    connectedFor.current = null;
    synced.current = "";
    setNonce((n) => n + 1);
  }, []);

  const value = useMemo(() => ({ status, household, invite, switchTo, error, ready }), [status, household, invite, switchTo, error, ready]);
  return <CloudCtx.Provider value={value}>{children}</CloudCtx.Provider>;
}

function householdName(s: AppState) {
  const first = s.members[0]?.name?.trim();
  return first ? `${first}'s household` : "My household";
}
