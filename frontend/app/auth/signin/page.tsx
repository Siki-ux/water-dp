"use client";

import { WaterBackground } from "@/components/WaterBackground";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";

export default function SignIn() {
    const router = useRouter();
    const { t } = useTranslation();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const result = await signIn("credentials", {
                username,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError(t('auth.invalidCreds'));
                setLoading(false);
            } else {
                router.push("/projects");
                router.refresh();
            }
        } catch (err) {
            setError(t('auth.errorGeneric'));
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen flex items-center justify-center bg-water-depth overflow-hidden text-[var(--foreground)] font-[family-name:var(--font-geist-sans)]">
            <WaterBackground />

            <div className="relative z-10 w-full max-w-md p-8 bg-card/90 backdrop-blur-xl rounded-2xl border border-border shadow-[0_0_40px_rgba(0,0,0,0.1)] animate-in fade-in zoom-in duration-500">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-[var(--foreground)]">
                        {t('auth.welcomeBack')}
                    </h1>
                    <p className="text-[var(--foreground)]/60 mt-2 text-sm">{t('auth.signInDesc')}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--foreground)]/80">{t('auth.username')}</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors text-[var(--foreground)] placeholder:opacity-30"
                            placeholder={t('auth.username')}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--foreground)]/80">{t('auth.password')}</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors text-[var(--foreground)] placeholder:opacity-30"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 bg-gradient-to-r from-hydro-primary to-hydro-secondary rounded-lg font-semibold text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02] transition-all disabled:opacity-70 disabled:hover:scale-100"
                    >
                        {loading ? t('auth.signInLoading') : t('auth.signInBlock')}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-[var(--foreground)]/60">
                    {t('auth.noAccount')}{" "}
                    <Link href="/register" className="text-hydro-secondary hover:text-[var(--foreground)] transition-colors font-medium">
                        {t('auth.register')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
