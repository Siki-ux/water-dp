"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/utils";
import api from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";

export default function CreateGroupButton() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            await api.post("/groups", { name });
            setIsOpen(false);
            setName("");

            // Invalidate query to trigger refresh in GroupsList
            queryClient.invalidateQueries({ queryKey: ['groups'] });

            router.refresh();
        } catch (err: any) {
            console.error("Failed to create group", err);
            setError(err.response?.data?.detail || "Failed to create group");
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) {
        return (
            <Button
                onClick={() => setIsOpen(true)}
                className="bg-hydro-primary hover:bg-blue-600 text-white shadow-lg shadow-blue-500/20"
            >
                <Plus className="w-4 h-4 mr-2" />
                {t("groups.createGroupBtn")}
            </Button>
        );
    }

    return (
        <>
            {/* Button Placeholder to maintain layout if needed, or just null? logic above returns button. */}
            <Button disabled className="opacity-50 cursor-not-allowed">
                <Plus className="w-4 h-4 mr-2" />
                {t("groups.createGroupBtn")}
            </Button>

            {/* Modal Overlay */}
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-[#0f172a] border border-white/10 p-6 rounded-xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 relative">
                    <button
                        onClick={() => setIsOpen(false)}
                        className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <h2 className="text-xl font-bold text-white mb-1">{t("groups.createModalTitle")}</h2>
                    <p className="text-sm text-white/50 mb-6">
                        {t("groups.createModalDesc")} <code>UFZ-TSM:</code>.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-white">{t("groups.groupName")}</label>
                            <div className="flex items-center gap-2">
                                <span className="text-white/40 font-mono text-sm bg-white/5 px-2 py-2 rounded-l-lg border border-r-0 border-white/10 select-none">
                                    UFZ-TSM:
                                </span>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="MyNewGroup"
                                    required
                                    autoFocus
                                    className="flex-1 bg-white/5 border border-white/10 border-l-0 rounded-r-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-hydro-primary"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                                {error}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setIsOpen(false)}
                                className="text-white/60 hover:text-white"
                            >
                                {t("groups.cancel")}
                            </Button>
                            <Button
                                type="submit"
                                disabled={loading}
                                className="bg-hydro-primary hover:bg-blue-600 text-white"
                            >
                                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {t("groups.createSubmit")}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
}
