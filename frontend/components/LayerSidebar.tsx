"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Plus, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

export function LayerSidebar() {
    const pathname = usePathname();
    const { t } = useTranslation();

    const links = [
        { label: t('sidebar.allLayers'), icon: Layers, href: "/layers" },
        { label: t('sidebar.createLayer'), icon: Plus, href: "/layers/create" },
    ];

    return (
        <aside className="w-64 fixed left-0 top-16 bottom-0 border-r border-[var(--border)] bg-[var(--sidebar-bg)] backdrop-blur-md z-40 hidden md:flex flex-col">
            <div className="p-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2 px-2">
                    <Map className="w-5 h-5 text-hydro-primary" />
                    <div>
                        <div className="font-semibold text-[var(--foreground)] truncate">{t('sidebar.layerSystem')}</div>
                        <div className="text-xs text-[var(--foreground)]/40">{t('sidebar.geospatialManagement')}</div>
                    </div>
                </div>
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
                                    ? "bg-[var(--foreground)]/10 text-[var(--foreground)]"
                                    : "text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5"
                            )}
                        >
                            <link.icon className="w-5 h-5" />
                            {link.label}
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}
