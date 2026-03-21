"use client";

import { useTranslation } from "@/lib/i18n";
import { ProjectCard } from "./ProjectCard";
import Link from "next/link";
import { Plus } from "lucide-react";

export function ProjectsClientView({ projectsWithCounts }: { projectsWithCounts: any[] }) {
    const { t } = useTranslation();
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
                            role={project.role || t('projects.member')}
                            sensorCount={project.sensorCount}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
