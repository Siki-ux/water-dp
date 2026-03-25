"use client";

import { useTranslation } from "@/lib/i18n";
import { ProjectCard } from "./ProjectCard";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useGlobalPermissions } from "@/hooks/usePermissions";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function ProjectsClientView({
    projectsWithCounts,
    selectedGroupId,
}: {
    projectsWithCounts: any[];
    selectedGroupId?: string;
}) {
    const { t } = useTranslation();
    const router = useRouter();
    const { groupMemberships: jwtMemberships } = useGlobalPermissions();

    // Fetch authorization groups from API as a fallback (more reliable before Keycloak re-seed)
    const { data: apiGroups = [] } = useQuery<{ id: string; name: string; path: string; role: string }[]>({
        queryKey: ["my-authorization-groups"],
        queryFn: () => api.get("/groups/my-authorization-groups").then((r) => r.data),
        staleTime: 5 * 60 * 1000,
    });

    // Prefer API groups (always current); fall back to JWT-parsed memberships
    const authGroups = apiGroups.length > 0
        ? apiGroups
        : jwtMemberships.map((m) => ({ id: m.groupPath, name: m.groupPath, path: m.groupPath, role: m.role }));

    // Only show the group filter when the user belongs to more than one group
    const showGroupFilter = authGroups.length > 1;

    const handleGroupChange = (groupId: string) => {
        const params = new URLSearchParams();
        if (groupId) params.set("group_id", groupId);
        router.push(`/projects${params.size > 0 ? `?${params.toString()}` : ""}`);
    };

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">{t('projects.yourProjects')}</h1>
                    <p className="text-white/60 mt-1">{t('projects.manageProjects')}</p>
                </div>

                <Link
                    href="/projects/new"
                    className="flex items-center gap-2 px-4 py-2 bg-hydro-primary hover:bg-blue-600 rounded-lg font-medium text-white transition-colors shadow-lg shadow-blue-500/20"
                >
                    <Plus className="w-5 h-5" />
                    {t('projects.newProject')}
                </Link>
            </div>

            {/* Group filter — only shown to multi-group users */}
            {showGroupFilter && (
                <div className="flex items-center gap-3">
                    <span className="text-white/50 text-sm">Filter by group:</span>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => handleGroupChange("")}
                            className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                                !selectedGroupId
                                    ? "bg-hydro-primary/20 text-hydro-primary border-hydro-primary/40"
                                    : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                            }`}
                        >
                            All Groups
                        </button>
                        {authGroups.map((g) => {
                            const label = g.name.replace(/^UFZ-TSM:/, "");
                            const isActive = selectedGroupId === g.id || selectedGroupId === g.name;
                            return (
                                <button
                                    key={g.id}
                                    onClick={() => handleGroupChange(g.id)}
                                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
                                        isActive
                                            ? "bg-hydro-primary/20 text-hydro-primary border-hydro-primary/40"
                                            : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {projectsWithCounts.length === 0 ? (
                <div className="text-center py-20 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-white/60">{t('projects.noProjectsFound')}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projectsWithCounts.map((project: any) => (
                        <ProjectCard
                            key={project.id}
                            id={project.id}
                            name={project.name}
                            description={project.description || t('projects.noDescription')}
                            role={project.user_role || project.role || t('projects.member')}
                            sensorCount={project.sensorCount}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
