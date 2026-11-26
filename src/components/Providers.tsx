"use client";

import { AuthProvider } from "@/lib/cloud/auth";
import { ConfigProvider } from "@/lib/cloud/config";
import { CloudSync } from "@/lib/cloud/sync";
import { StoreProvider } from "@/lib/state/store";
import { ToastProvider } from "./ui";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConfigProvider>
      <StoreProvider>
        <ToastProvider>
          <CloudSync>{children}</CloudSync>
        </ToastProvider>
      </StoreProvider>
      </ConfigProvider>
    </AuthProvider>
  );
}
