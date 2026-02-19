"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { LogOut, User } from "lucide-react";

export function AppHeader() {
    const { data: session } = useSession();

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-black/40 backdrop-blur-md border-b border-white/10 z-50 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
                <Link href="/projects" className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                    Hydro Portal
                </Link>
                <div className="hidden md:flex h-6 w-px bg-white/10 mx-2"></div>
                <nav className="hidden md:flex gap-4 text-sm font-medium text-white/60">
                    <Link href="/projects" className="hover:text-white transition-colors">Projects</Link>
                    <Link href="/sms/sensors" className="hover:text-white transition-colors">Sensor Management System</Link>
                </nav>
            </div>

            <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-2 text-sm text-white/80 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                    <User className="w-4 h-4" />
                    <span>{session?.user?.name || "User"}</span>
                </div>

                <button
                    onClick={() => signOut({ callbackUrl: "/portal/auth/signin" })}
                    className="p-2 text-white/60 hover:text-red-400 transition-colors"
                    title="Sign Out"
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </div>
        </header>
    );
}
