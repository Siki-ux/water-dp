"use client";

import { DashboardCard } from "@/components/DashboardCard";
import Link from "next/link";
import { Plus, Loader2 } from "lucide-react";
import { Dashboard } from "@/types/dashboard";
import { T } from "@/components/T";
import { useParams } from "next/navigation";
import { useProjectDashboards } from "@/hooks/queries/useProjects";

export default function ProjectDashboardsPage() {
    const params = useParams();
    const id = params.id as string;
    const { data: dashboards = [] as Dashboard[], isLoading } = useProjectDashboards(id);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20 text-white/40">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading dashboards…
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white"><T path="projects.dashboards.title" /></h1>
                    <p className="text-white/60 mt-1"><T path="projects.dashboards.desc" /></p>
                </div>

                <Link
                    href={`/projects/${id}/dashboards/new`}
                    className="flex items-center gap-2 px-4 py-2 bg-hydro-primary hover:bg-blue-600 rounded-lg font-medium text-white transition-colors shadow-lg shadow-blue-500/20"
                >
                    <Plus className="w-5 h-5" />
                    <T path="projects.dashboards.newBtn" />
                </Link>
            </div>

            {dashboards.length === 0 ? (
                <div className="text-center py-20 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-white/60"><T path="projects.dashboards.noDashboards" /></p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {dashboards.map((dashboard: Dashboard) => (
                        <DashboardCard
                            key={dashboard.id}
                            dashboard={dashboard}
                            projectId={id}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
