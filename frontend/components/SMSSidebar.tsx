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
    Cpu
} from "lucide-react";
import { cn } from "@/lib/utils";

export function SMSSidebar() {
    const pathname = usePathname();

    const links = [
        { label: "Sensors", icon: Activity, href: `/sms/sensors` },
        { label: "Parsers", icon: FileCode, href: `/sms/parsers` },
        { label: "Device Types", icon: Cpu, href: `/sms/device-types` },
        { label: "QA/QC", icon: LayoutDashboard, href: `/sms/qa-qc` },
    ];

    return (
        <aside className="w-64 fixed left-0 top-16 bottom-0 border-r border-white/10 bg-black/20 backdrop-blur-md z-40 hidden md:flex flex-col">
            <div className="p-4 border-b border-white/5">
                <div className="font-semibold text-white truncate px-2">
                    Sensor Management
                </div>
                <div className="text-xs text-white/40 px-2">Global System</div>
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
