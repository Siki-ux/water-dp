"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { IdleMonitor } from "./auth/IdleMonitor";
import { ThemeProvider } from "./ThemeContext";

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60 * 1000,
                // refetchInterval: 30000, // Optional global setting, but better per-query
            }
        }
    }));

    return (
        <QueryClientProvider client={queryClient}>
            <SessionProvider basePath="/portal/api/auth">
                <ThemeProvider>
                    <IdleMonitor />
                    {children}
                </ThemeProvider>
            </SessionProvider>
        </QueryClientProvider>
    );
}
