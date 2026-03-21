"use client";

import { useTranslation } from "@/lib/i18n";
import { DeviceTypeListActions } from "@/components/DeviceTypeListActions";
import { Cpu, Settings } from "lucide-react";
import Link from "next/link";

interface DeviceTypesClientProps {
    deviceTypes: any[];
}

export function DeviceTypesClient({ deviceTypes }: DeviceTypesClientProps) {
    const { t } = useTranslation();

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">{t('sms.deviceTypes.title')}</h1>
                    <p className="text-[var(--foreground)]/60 text-sm mt-1">{t('sms.deviceTypes.manageDesc')}</p>
                </div>
                <DeviceTypeListActions />
            </div>

            <div className="border border-border rounded-xl overflow-hidden bg-card">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                <th className="p-4 text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-wider w-16">{t('sms.deviceTypes.idCol')}</th>
                                <th className="p-4 text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-wider">{t('sms.deviceTypes.name')}</th>
                                <th className="p-4 text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-wider">{t('sms.deviceTypes.propertiesCol')}</th>
                                <th className="p-4 text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-wider w-24">{t('sms.deviceTypes.actionsCol')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {deviceTypes.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-[var(--foreground)]/40">
                                        {t('sms.deviceTypes.noDeviceTypes')}
                                    </td>
                                </tr>
                            ) : (
                                deviceTypes.map((dt: any) => (
                                    <tr
                                        key={dt.id}
                                        className="group hover:bg-muted/50 transition-colors"
                                    >
                                        <td className="p-4">
                                            <span className="font-mono text-xs text-[var(--foreground)]/40 px-1 py-0.5 rounded bg-muted">#{dt.id}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                                                    <Cpu className="w-4 h-4" />
                                                </div>
                                                <Link href={`/sms/device-types/${dt.id}`} className="font-medium text-[var(--foreground)] group-hover:text-blue-500 transition-colors hover:underline">
                                                    {dt.name}
                                                </Link>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {dt.properties ? (
                                                <div className="font-mono text-[10px] text-[var(--foreground)]/60 bg-muted/50 rounded border border-border p-2 max-w-md overflow-hidden text-ellipsis whitespace-nowrap">
                                                    {JSON.stringify(dt.properties)}
                                                </div>
                                            ) : (
                                                <span className="text-[var(--foreground)]/20 text-xs px-2">-</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <Link href={`/sms/device-types/${dt.id}`} className="p-2 rounded-lg hover:bg-muted text-[var(--foreground)]/40 hover:text-[var(--foreground)] transition-colors inline-block">
                                                <Settings className="w-4 h-4" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
