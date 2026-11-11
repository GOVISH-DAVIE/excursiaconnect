"use client";

/**
 * The app-wide providers (docs/architecture.md, "Context providers"). TanStack Query holds server data: one
 * client per browser tab, made on first render, never shared between server renders.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { StoreProvider } from "@/lib/store";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      {/* the prototype's store, until each module moves onto the API */}
      <StoreProvider>{children}</StoreProvider>
    </QueryClientProvider>
  );
}
