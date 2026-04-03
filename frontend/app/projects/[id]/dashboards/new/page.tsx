"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function NewDashboardPage() {
    const router = useRouter();
    const params = useParams();
    const projectId = params.id as string;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const name = formData.get("name") as string;
        const isPublic = formData.get("is_public") === "on";

        try {
            await api.post(`/projects/${projectId}/dashboards`, {
                name,
                is_public: isPublic,
                layout_config: {}, // Empty default layout
                widgets: []
            });

            router.push(`/projects/${projectId}/dashboards`);
            router.refresh();
        } catch (err: any) {
            console.error("Failed to create dashboard:", err);
            setError(err.response?.data?.detail || "Failed to create dashboard");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div>
                <Link
                    href={`/projects/${projectId}/dashboards`}
                    className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-4"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Back to Dashboards
                </Link>
                <h1 className="text-3xl font-bold text-white">Create Dashboard</h1>
                <p className="text-white/60 mt-1">Configure a new dashboard for data visualization</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium text-white">
                        Dashboard Name
                    </label>
                    <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-hydro-primary focus:border-transparent transition-all"
                        placeholder="e.g. Flood Monitoring"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <input
                        id="is_public"
                        name="is_public"
                        type="checkbox"
                        className="w-4 h-4 rounded border-white/10 bg-white/5 text-hydro-primary focus:ring-hydro-primary"
                    />
                    <label htmlFor="is_public" className="text-sm text-white/80 select-none">
                        Make Public (Visible without login if enabled globally)
                    </label>
                </div>

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                    <Link
                        href={`/projects/${projectId}/dashboards`}
                        className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                        Cancel
                    </Link>
                    <Button
                        type="submit"
                        disabled={loading}
                        className="bg-hydro-primary hover:bg-blue-600 text-white"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Creating...
                            </>
                        ) : (
                            "Create Dashboard"
                        )}
                    </Button>
                </div>
            </form>
        </div>
    );
}
