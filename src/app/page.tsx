"use client";

import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/ui";
import { StoreProvider } from "@/lib/state/store";

export default function Home() {
  return (
    <StoreProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </StoreProvider>
  );
}
