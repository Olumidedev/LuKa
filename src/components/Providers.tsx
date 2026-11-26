"use client";

import { AuthProvider } from "@/lib/cloud/auth";
import { CatalogProvider } from "@/lib/cloud/catalog";
import { ConfigProvider } from "@/lib/cloud/config";
import { CloudSync } from "@/lib/cloud/sync";
import { StoreProvider } from "@/lib/state/store";
import { ToastProvider } from "./ui";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConfigProvider>
      <CatalogProvider>
      <StoreProvider>
        <ToastProvider>
          <CloudSync>{children}</CloudSync>
        </ToastProvider>
      </StoreProvider>
      </CatalogProvider>
      </ConfigProvider>
    </AuthProvider>
  );
}
