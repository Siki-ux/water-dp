"use client";

import Link from "next/link";
import { ArrowRight, Folder } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface ProjectCardProps {
    id: string;
    name: string;
    description: string;
    role: string;
    sensorCount: number;
}

export function ProjectCard({ id, name, description, role, sensorCount }: ProjectCardProps) {
    const { t } = useTranslation();

    return (
        <Link
            href={`/projects/${id}`}
            className="group relative p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-hydro-primary/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-500/10"
        >
            <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-500/20 rounded-lg text-blue-400 group-hover:text-white group-hover:bg-blue-500 transition-colors">
                    <Folder className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">
                    {role}
                </span>
            </div>

            <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-hydro-secondary transition-colors">
                {name}
            </h3>
            <p className="text-sm text-white/60 mb-6 line-clamp-2">
                {description}
            </p>

            <div className="flex items-center justify-between mt-auto">
                <span className="text-xs text-white/40">
                    {sensorCount} {t('projects.sensorsLinked')}
                </span>
                <div className="flex items-center gap-1 text-sm font-medium text-hydro-primary group-hover:gap-2 transition-all">
                    {t('projects.openProject')} <ArrowRight className="w-4 h-4" />
                </div>
            </div>
        </Link>
    );
}
