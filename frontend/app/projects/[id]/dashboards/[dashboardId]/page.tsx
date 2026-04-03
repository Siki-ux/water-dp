import { auth } from "@/lib/auth";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Dashboard } from "@/types/dashboard";
import DashboardEditor from "@/components/dashboard/DashboardEditor";
import { getApiUrl } from "@/lib/utils";

async function getDashboard(dashboardId: string) {
    const session = await auth();
    if (!session?.accessToken) return null;

    const apiUrl = getApiUrl();

    try {
        const res = await fetch(`${apiUrl}/dashboards/${dashboardId}`, {
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
            },
            cache: 'no-store'
        });

        if (!res.ok) return null;
        return await res.json() as Dashboard;
    } catch (error) {
        console.error("Error fetching dashboard:", error);
        return null;
    }
}

export default async function DashboardPage({ params }: { params: Promise<{ id: string, dashboardId: string }> }) {
    const { id, dashboardId } = await params;
    const dashboard = await getDashboard(dashboardId);

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
                        <h1 className="text-2xl font-bold text-white">{dashboard.name}</h1>
                        <div className="flex items-center gap-2 text-sm text-white/50">
                            {dashboard.is_public ? (
                                <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 text-xs">Public</span>
                            ) : (
                                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-xs">Private</span>
                            )}
                            <span>Updated {new Date(dashboard.updated_at).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <DashboardEditor dashboard={dashboard} />
            </main>
        </div>
    );
}
