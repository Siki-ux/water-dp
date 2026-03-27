"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import axios from "axios";
import { useTranslation } from "@/lib/i18n";

export default function SettingsPage() {
    const { data: session } = useSession();
    const { t } = useTranslation();

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/water-api/api/v1";

    // Profile form
    const [profile, setProfile] = useState({ first_name: "", last_name: "", email: "" });
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Password form
    const [passwords, setPasswords] = useState({ current_password: "", new_password: "", confirm_new_password: "" });
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        if (!session?.accessToken) return;
        axios
            .get(`${apiUrl}/auth/me`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
            .then((res) => {
                setProfile({
                    first_name: res.data.given_name || "",
                    last_name: res.data.family_name || "",
                    email: res.data.email || "",
                });
            })
            .catch(() => {});
    }, [session]);

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileLoading(true);
        setProfileMsg(null);
        try {
            await axios.put(
                `${apiUrl}/auth/me`,
                { first_name: profile.first_name || null, last_name: profile.last_name || null, email: profile.email || null },
                { headers: { Authorization: `Bearer ${session?.accessToken}` } }
            );
            setProfileMsg({ type: "success", text: t("account.profileSaved") });
        } catch {
            setProfileMsg({ type: "error", text: t("account.profileError") });
        } finally {
            setProfileLoading(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordMsg(null);
        if (passwords.new_password !== passwords.confirm_new_password) {
            setPasswordMsg({ type: "error", text: t("account.passwordMismatch") });
            return;
        }
        setPasswordLoading(true);
        try {
            await axios.put(
                `${apiUrl}/auth/me/password`,
                { current_password: passwords.current_password, new_password: passwords.new_password },
                { headers: { Authorization: `Bearer ${session?.accessToken}` } }
            );
            setPasswordMsg({ type: "success", text: t("account.passwordChanged") });
            setPasswords({ current_password: "", new_password: "", confirm_new_password: "" });
        } catch (err: any) {
            const detail = err.response?.data?.detail || t("account.passwordError");
            setPasswordMsg({ type: "error", text: detail });
        } finally {
            setPasswordLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8 py-8">
            <h1 className="text-2xl font-bold text-white">{t("account.title")}</h1>

            {/* Profile Section */}
            <div className="p-6 rounded-xl bg-white/5 border border-white/10 space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">{t("account.profile")}</h2>
                    <p className="text-sm text-white/50 mt-1">{t("account.profileDesc")}</p>
                </div>

                <form onSubmit={handleProfileSubmit} className="space-y-4">
                    {profileMsg && (
                        <div className={`p-3 text-sm rounded-lg border ${profileMsg.type === "success" ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"}`}>
                            {profileMsg.text}
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-white/70">{t("account.firstName")}</label>
                            <input
                                type="text"
                                value={profile.first_name}
                                onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium text-white/70">{t("account.lastName")}</label>
                            <input
                                type="text"
                                value={profile.last_name}
                                onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors"
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-white/70">{t("account.email")}</label>
                        <input
                            type="email"
                            value={profile.email}
                            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={profileLoading}
                        className="px-5 py-2 bg-gradient-to-r from-hydro-primary to-hydro-secondary rounded-lg text-sm font-semibold text-white disabled:opacity-60 hover:opacity-90 transition-opacity"
                    >
                        {profileLoading ? t("account.savingProfile") : t("account.saveProfile")}
                    </button>
                </form>
            </div>

            {/* Password Section */}
            <div className="p-6 rounded-xl bg-white/5 border border-white/10 space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">{t("account.security")}</h2>
                    <p className="text-sm text-white/50 mt-1">{t("account.securityDesc")}</p>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    {passwordMsg && (
                        <div className={`p-3 text-sm rounded-lg border ${passwordMsg.type === "success" ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"}`}>
                            {passwordMsg.text}
                        </div>
                    )}
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-white/70">{t("account.currentPassword")}</label>
                        <input
                            type="password"
                            value={passwords.current_password}
                            onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
                            required
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-white/70">{t("account.newPassword")}</label>
                        <input
                            type="password"
                            value={passwords.new_password}
                            onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
                            required
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-sm font-medium text-white/70">{t("account.confirmNewPassword")}</label>
                        <input
                            type="password"
                            value={passwords.confirm_new_password}
                            onChange={(e) => setPasswords({ ...passwords, confirm_new_password: e.target.value })}
                            required
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={passwordLoading}
                        className="px-5 py-2 bg-gradient-to-r from-hydro-primary to-hydro-secondary rounded-lg text-sm font-semibold text-white disabled:opacity-60 hover:opacity-90 transition-opacity"
                    >
                        {passwordLoading ? t("account.changingPassword") : t("account.changePassword")}
                    </button>
                </form>
            </div>
        </div>
    );
}
