"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Database,
    Settings,
    ChevronLeft,
    Activity,
    FileCode,
    Bell,
    Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { useProjectPermissions } from "@/hooks/usePermissions";

interface ProjectSidebarProps {
    projectId: string;
    projectName: string;
}

export function ProjectSidebar({ projectId, projectName }: ProjectSidebarProps) {
    const pathname = usePathname();
    const { t } = useTranslation();
    const { data: perms } = useProjectPermissions(projectId);

    const links = [
        { label: t('sidebar.overview'), icon: Activity, href: `/projects/${projectId}` },
        { label: t('sidebar.dataSources'), icon: Database, href: `/projects/${projectId}/data` },
        { label: t('sidebar.alerts'), icon: Bell, href: `/projects/${projectId}/alerts` },
        { label: t('sidebar.settings'), icon: Settings, href: `/projects/${projectId}/settings` },
    ];

    if (perms?.can_view_simulator) {
        links.splice(3, 0, { label: t('sidebar.simulator'), icon: Zap, href: `/projects/${projectId}/simulator` });
    }

    return (
        <aside className="w-64 fixed left-0 top-16 bottom-0 border-r border-white/10 bg-black/20 backdrop-blur-md z-40 hidden md:flex flex-col">
            <div className="p-4 border-b border-white/5">
                <Link
                    href="/projects"
                    className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors mb-4"
                >
                    <ChevronLeft className="w-4 h-4" />
                    {t('sidebar.backToProjects')}
                </Link>
                <div className="font-semibold text-white truncate px-2">
                    {projectName}
                </div>
                <div className="text-xs text-white/40 px-2">{t('sidebar.projectId')}: {projectId}</div>
            </div>

            <nav className="flex-1 p-4 space-y-1">
                {links.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                        <Link
                            key={link.label}
                            href={link.href}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                isActive
                                    ? "bg-white/10 text-white"
                                    : "text-white/60 hover:text-white hover:bg-white/5"
                            )}
                        >
                            <link.icon className="w-5 h-5" />
                            {link.label}
                        </Link>
                    )
                })}
            </nav>
        </aside>
    );
}
