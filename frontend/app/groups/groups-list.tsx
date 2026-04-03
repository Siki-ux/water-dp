"use client";

import { useState, useEffect } from "react";
import { Loader2, Users, Settings } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/lib/i18n";

interface Group {
    id: string;
    name: string;
    path: string;
}

export default function GroupsList({ token }: { token: string }) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    const { t } = useTranslation();

    const { data: groups, isLoading, error } = useQuery({
        queryKey: ['groups'],
        queryFn: async () => {
            const res = await fetch(`${apiUrl}/groups/`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            if (!res.ok) throw new Error("Failed to fetch groups");
            return res.json() as Promise<Group[]>;
        }
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-hydro-primary" size={32} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg">
                {t("groups.errorLoading")} {error.message}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups?.map((group) => (
                <Link
                    key={group.id}
                    href={`/groups/${group.id}`}
                    className="group relative p-6 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:border-hydro-primary/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-blue-500/10"
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-blue-500/20 rounded-lg text-blue-400 group-hover:text-white group-hover:bg-blue-500 transition-colors">
                            <Users className="w-6 h-6" />
                        </div>
                        <Settings className="w-5 h-5 text-white/20 group-hover:text-white/50 transition-colors" />
                    </div>

                    <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-hydro-secondary transition-colors">
                        {group.name}
                    </h3>
                    <p className="text-sm text-white/60 mb-6 truncate font-mono">
                        {group.path}
                    </p>

                    <div className="flex items-center justify-between mt-auto">
                        <span className="text-xs text-white/40">
                            {t("groups.manageMembers")}
                        </span>
                        <div className="flex items-center gap-1 text-sm font-medium text-hydro-primary group-hover:gap-2 transition-all">
                            {t("groups.openGroup")} <Settings className="w-4 h-4 ml-1" />
                        </div>
                    </div>
                </Link>
            ))}

            {groups?.length === 0 && (
                <div className="col-span-full text-center py-12 text-white/40">
                    {t("groups.noGroups")}
                </div>
            )}
        </div>
    );
}
