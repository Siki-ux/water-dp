"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { Globe, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { ApiTypeCreateDialog } from "@/components/ApiTypeCreateDialog";
import { getApiUrl } from "@/lib/utils";

interface ApiTypesClientProps {
    apiTypes: any[];
}

export function ApiTypesClient({ apiTypes }: ApiTypesClientProps) {
    const { t } = useTranslation();
    const { data: session } = useSession();
    const router = useRouter();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    const handleDelete = async (idOrName: string) => {
        if (!confirm(t('sms.apiTypes.deleteConfirm'))) return;

        setDeleting(idOrName);
        try {
            const apiUrl = getApiUrl();
            const res = await fetch(`${apiUrl}/external-sources/api-types/${idOrName}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${session?.accessToken}` },
            });

            if (!res.ok) {
                const err = await res.json();
                alert(err.detail || t('sms.apiTypes.deleteFail'));
                return;
            }

            router.refresh();
        } catch {
            alert(t('sms.apiTypes.deleteFail'));
        } finally {
            setDeleting(null);
        }
    };

    const isCustom = (dt: any) => dt.properties?.script_bucket;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">{t('sms.apiTypes.title')}</h1>
                    <p className="text-[var(--foreground)]/60 text-sm mt-1">{t('sms.apiTypes.manageDesc')}</p>
                </div>
                <button
                    onClick={() => setIsCreateOpen(true)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-blue-500/20"
                >
                    <Globe className="w-4 h-4" />
                    {t('sms.apiTypes.createBtn')}
                </button>
            </div>

            <div className="border border-border rounded-xl overflow-hidden bg-card">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                <th className="p-4 text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-wider w-16">{t('sms.apiTypes.idCol')}</th>
                                <th className="p-4 text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-wider">{t('sms.apiTypes.name')}</th>
                                <th className="p-4 text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-wider">{t('sms.apiTypes.propertiesCol')}</th>
                                <th className="p-4 text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-wider w-32">{t('sms.apiTypes.actionsCol')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {apiTypes.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-[var(--foreground)]/40">
                                        {t('sms.apiTypes.noApiTypes')}
                                    </td>
                                </tr>
                            ) : (
                                apiTypes.map((at: any) => (
                                    <tr
                                        key={at.id}
                                        className="group hover:bg-muted/50 transition-colors"
                                    >
                                        <td className="p-4">
                                            <span className="font-mono text-xs text-[var(--foreground)]/40 px-1 py-0.5 rounded bg-muted">#{at.id}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg transition-colors ${
                                                    isCustom(at)
                                                    ? 'bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20'
                                                    : 'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20'
                                                }`}>
                                                    <Globe className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <Link
                                                        href={`/sms/api-types/${at.id}`}
                                                        className="font-medium text-[var(--foreground)] hover:text-blue-400 transition-colors"
                                                    >
                                                        {at.name}
                                                    </Link>
                                                    <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                                                        isCustom(at)
                                                        ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                                        : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                                    }`}>
                                                        {isCustom(at) ? t('sms.apiTypes.custom') : t('sms.apiTypes.builtIn')}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {at.properties ? (
                                                <div className="font-mono text-[10px] text-[var(--foreground)]/60 bg-muted/50 rounded border border-border p-2 max-w-md overflow-hidden text-ellipsis whitespace-nowrap">
                                                    {JSON.stringify(at.properties)}
                                                </div>
                                            ) : (
                                                <span className="text-[var(--foreground)]/20 text-xs px-2">-</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-1">
                                                <Link
                                                    href={`/sms/api-types/${at.id}`}
                                                    className="p-2 rounded-lg hover:bg-blue-500/10 text-[var(--foreground)]/40 hover:text-blue-400 transition-colors"
                                                    title="View details"
                                                >
                                                    <Settings className="w-4 h-4" />
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete(at.name)}
                                                    disabled={deleting === at.name}
                                                    className="p-2 rounded-lg hover:bg-red-500/10 text-[var(--foreground)]/40 hover:text-red-400 transition-colors disabled:opacity-50"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <ApiTypeCreateDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
            />
        </div>
    );
}
