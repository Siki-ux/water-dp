"use client";

import { WaterBackground } from "@/components/WaterBackground";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useTranslation } from "@/lib/i18n";

export default function Register() {
    const router = useRouter();
    const { t } = useTranslation();
    const [formData, setFormData] = useState({
        username: "",
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        confirmPassword: ""
    });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        if (formData.password !== formData.confirmPassword) {
            setError(t('auth.passwordsNoMatch'));
            setLoading(false);
            return;
        }

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

            // Adjust payload to match backend requirements
            await axios.post(`${apiUrl}/auth/register`, {
                username: formData.username,
                first_name: formData.firstName,
                last_name: formData.lastName,
                email: formData.email,
                password: formData.password,
            });

            // On success, redirect to login
            router.push("/auth/signin?registered=true");
        } catch (err: any) {
            setError(err.response?.data?.detail || "Registration failed. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen flex items-center justify-center bg-water-depth overflow-hidden text-[var(--foreground)] font-[family-name:var(--font-geist-sans)]">
            <WaterBackground />

            <div className="relative z-10 w-full max-w-md p-8 bg-card/90 backdrop-blur-xl rounded-2xl border border-border shadow-[0_0_40px_rgba(0,0,0,0.1)] animate-in fade-in zoom-in duration-500">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-[var(--foreground)]">
                        {t('auth.join')}
                    </h1>
                    <p className="text-[var(--foreground)]/60 mt-2 text-sm">{t('auth.joinDesc')}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                        <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg text-center">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--foreground)]/80">{t('auth.username')}</label>
                        <input
                            type="text"
                            name="username"
                            value={formData.username}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors text-[var(--foreground)] placeholder:opacity-30"
                            placeholder="johndoe"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[var(--foreground)]/80">{t('auth.firstName')}</label>
                            <input
                                type="text"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleChange}
                                required
                                className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors text-[var(--foreground)] placeholder:opacity-30"
                                placeholder="John"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[var(--foreground)]/80">{t('auth.lastName')}</label>
                            <input
                                type="text"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleChange}
                                required
                                className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors text-[var(--foreground)] placeholder:opacity-30"
                                placeholder="Doe"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--foreground)]/80">{t('auth.email')}</label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors text-[var(--foreground)] placeholder:opacity-30"
                            placeholder="john@example.com"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--foreground)]/80">{t('auth.password')}</label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors text-[var(--foreground)] placeholder:opacity-30"
                            placeholder="••••••••"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-[var(--foreground)]/80">{t('auth.confirmPassword')}</label>
                        <input
                            type="password"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            required
                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-lg focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors text-[var(--foreground)] placeholder:opacity-30"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 bg-gradient-to-r from-hydro-primary to-hydro-secondary rounded-lg font-semibold text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02] transition-all disabled:opacity-70 disabled:hover:scale-100 mt-2"
                    >
                        {loading ? t('auth.registerLoading') : t('auth.register')}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-[var(--foreground)]/60">
                    {t('auth.hasAccount')}{" "}
                    <Link href="/auth/signin" className="text-hydro-secondary hover:text-[var(--foreground)] transition-colors font-medium">
                        {t('auth.signInBlock')}
                    </Link>
                </div>
            </div>
        </div>
    );
}
