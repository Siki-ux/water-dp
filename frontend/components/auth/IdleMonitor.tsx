"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, Moon, LogOut } from "lucide-react";

export function IdleMonitor() {
    const { data: session, update, status } = useSession();
    const [isIdle, setIsIdle] = useState(false);

    // Config: 15 minutes idle time, 2 minutes countdown to force logout
    const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
    const FORCE_LOGOUT_MS = 2 * 60 * 1000;

    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
    const forceLogoutTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityRef = useRef<number>(Date.now());

    const resetIdleTimer = useCallback(() => {
        lastActivityRef.current = Date.now();

        if (isIdle) return; // Don't auto-dismiss if modal is open (user must click "I'm here")

        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (forceLogoutTimerRef.current) clearTimeout(forceLogoutTimerRef.current);

        idleTimerRef.current = setTimeout(() => {
            setIsIdle(true);
            // Start force logout timer
            forceLogoutTimerRef.current = setTimeout(() => {
                signOut({ callbackUrl: "/portal/auth/signin" });
            }, FORCE_LOGOUT_MS);
        }, IDLE_TIMEOUT_MS);
    }, [isIdle]);

    // Setup detection listeners
    useEffect(() => {
        if (status !== "authenticated") return;

        // Events to track activity
        const events = ["mousedown", "keydown", "scroll", "touchstart"];

        const handleActivity = () => {
            // Throttle slightly
            if (Date.now() - lastActivityRef.current > 1000) {
                resetIdleTimer();
            }
        };

        events.forEach(event => window.addEventListener(event, handleActivity));

        // Initial start
        resetIdleTimer();

        return () => {
            events.forEach(event => window.removeEventListener(event, handleActivity));
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            if (forceLogoutTimerRef.current) clearTimeout(forceLogoutTimerRef.current);
        };
    }, [status, resetIdleTimer]);

    // Handle token expiration: NextAuth sets error="RefreshAccessTokenError"
    useEffect(() => {
        if (session?.error === "RefreshAccessTokenError") {
            signOut({ callbackUrl: "/portal/auth/signin" });
        }
    }, [session]);

    // Auto-referesh token logic (handled by NextAuth internally via 'update' but we can trigger it)
    // Actually, NextAuth's useSession 'update' method can be used to poll/refresh if needed,
    // but our rotation logic in auth.ts handles rotation on *request*. 
    // If the user is idle, no requests are made, so token might expire on server.
    // When they come back, the next request will trigger rotation in `jwt` callback if implemented correctly.
    // However, if the session cookie itself expires in the browser, they lose session.
    // We should periodically ping to keep session alive IF active.

    useEffect(() => {
        if (status !== 'authenticated') return;

        // Ping every 5 minutes to keep session alive / rotate if needed
        const interval = setInterval(() => {
            if (!document.hidden && !isIdle) {
                update(); // Triggers session call -> jwt callback -> potential rotation
            }
        }, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, [status, isIdle, update]);


    const handleImHere = () => {
        setIsIdle(false);
        resetIdleTimer();
        update(); // Refresh session immediately
    };

    if (!isIdle) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
                <div className="flex flex-col items-center text-center gap-4">
                    <div className="p-3 bg-white/5 rounded-full">
                        <Moon className="w-8 h-8 text-hydro-primary animate-pulse" />
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-[var(--foreground)]">Still there?</h2>
                        <p className="text-[var(--foreground)]/60 mt-2">
                            You've been inactive for a while. For security, your session will time out soon.
                        </p>
                    </div>

                    <div className="flex gap-3 w-full mt-2">
                        <button
                            onClick={() => signOut({ callbackUrl: "/portal/auth/signin" })}
                            className="flex-1 py-2.5 px-4 bg-muted hover:bg-muted/80 text-[var(--foreground)]/70 hover:text-[var(--foreground)] rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
                        >
                            <LogOut className="w-4 h-4" />
                            Logout
                        </button>
                        <button
                            onClick={handleImHere}
                            className="flex-1 py-2.5 px-4 bg-hydro-primary hover:bg-hydro-accent text-black rounded-lg transition-colors font-bold"
                        >
                            I'm here
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
