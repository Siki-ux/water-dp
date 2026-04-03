"use client";

import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Dashboard } from "@/types/dashboard";
import DashboardEditor from "@/components/dashboard/DashboardEditor";
import { useParams } from "next/navigation";
import { useDashboard } from "@/hooks/queries/useDashboards";

export default function DashboardPage() {
    const params = useParams();
    const id = params.id as string;
    const dashboardId = params.dashboardId as string;
    const { data: dashboard, isLoading } = useDashboard(dashboardId);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20 text-white/40">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading dashboard…
            </div>
        );
    }

    if (!dashboard) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-white/50">
                <p>Dashboard not found or access denied.</p>
                <Link href={`/projects/${id}/dashboards`} className="text-hydro-primary hover:underline mt-4">
                    Back to Dashboards
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">
            <header className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                    <Link
                        href={`/projects/${id}/dashboards`}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white">{(dashboard as Dashboard).name}</h1>
                        <div className="flex items-center gap-2 text-sm text-white/50">
                            {(dashboard as Dashboard).is_public ? (
                                <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 text-xs">Public</span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-xs">Private</span>
                            )}
                            <span>Updated {new Date((dashboard as Dashboard).updated_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <DashboardEditor dashboard={dashboard as Dashboard} />
            </main>
        </div>
    );
}
