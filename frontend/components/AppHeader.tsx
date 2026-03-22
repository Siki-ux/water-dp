"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useTranslation } from "@/lib/i18n";

export function AppHeader() {
    const { data: session } = useSession();
    const { t } = useTranslation();

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-[var(--header-bg)] backdrop-blur-md border-b border-[var(--border)] z-50 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
                <Link href="/projects" className="text-xl font-bold bg-clip-text text-transparent bg-[var(--foreground)]">
                    {t('header.hydroPortal')}
                </Link>
                <div className="hidden md:flex h-6 w-px bg-[var(--border)] mx-2"></div>
                <nav className="hidden md:flex gap-1 text-sm font-medium">
                    <Link href="/projects" className="px-3 py-1.5 rounded-md text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/8 transition-colors">{t('header.projects')}</Link>
                    <Link href="/sms/sensors" className="px-3 py-1.5 rounded-md text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/8 transition-colors">{t('header.sms')}</Link>
                    <Link href="/layers" className="px-3 py-1.5 rounded-md text-[var(--foreground)]/70 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/8 transition-colors">{t('header.layers')}</Link>
                </nav>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <ThemeSwitcher />
                    <LanguageSwitcher />
                </div>

                <div className="hidden md:flex items-center gap-2 text-sm text-[var(--foreground)]/80 bg-[var(--foreground)]/5 px-3 py-1.5 rounded-full border border-[var(--border)]">
                    <User className="w-4 h-4" />
                    <span>{session?.user?.name || t('header.user')}</span>
                </div>

                <button
                    onClick={() => signOut({ callbackUrl: "/portal/auth/signin" })}
                    className="p-2 text-[var(--foreground)]/60 hover:text-red-400 transition-colors"
                    title={t('header.signOut')}
                >
                    <LogOut className="w-5 h-5" />
                </button>
            </div>
        </header>
    );
}
