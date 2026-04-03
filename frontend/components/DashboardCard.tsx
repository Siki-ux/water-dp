import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { Dashboard } from "@/types/dashboard";

interface DashboardCardProps {
    dashboard: Dashboard;
    projectId: string;
}

export function DashboardCard({ dashboard, projectId }: DashboardCardProps) {
    return (
        <Link
            href={`/projects/${projectId}/dashboards/${dashboard.id}`}
            className="group relative p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-hydro-primary/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-500/10"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-indigo-500/20 rounded-lg text-indigo-400 group-hover:text-white group-hover:bg-indigo-500 transition-colors">
                    <LayoutDashboard className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">
                    {dashboard.is_public ? "Public" : "Private"}
                </span>
            </div>

            <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-hydro-secondary transition-colors">
                {dashboard.name}
            </h3>
            <p className="text-sm text-white/60 mb-6">
                {dashboard.widgets?.length || 0} Widgets
            </p>

            <div className="flex items-center justify-between mt-auto">
                <span className="text-xs text-white/40">
                    Last updated: {new Date(dashboard.updated_at).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-1 text-sm font-medium text-hydro-primary group-hover:gap-2 transition-all">
                    Open Dashboard <ArrowRight className="w-4 h-4" />
                </div>
            </div>
        </Link>
    );
}
