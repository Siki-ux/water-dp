"use client";

import Link from "next/link";
import { ArrowLeft, Cpu, Code, Settings } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { DeviceTypeDetailActions } from "@/components/DeviceTypeDetailActions";

interface DeviceTypeDetailClientProps {
    deviceType: any;
}

export function DeviceTypeDetailClient({ deviceType }: DeviceTypeDetailClientProps) {
    const { t } = useTranslation();

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* Header / Breadcrumb */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/sms/device-types"
                        className="p-2 rounded-lg bg-muted/50 hover:bg-muted text-[var(--foreground)]/60 hover:text-[var(--foreground)] transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight flex items-center gap-3">
                            {deviceType.name}
                            <span className="px-2.5 py-0.5 rounded-md text-sm font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                ID: #{deviceType.id}
                            </span>
                        </h1>
                    </div>
                </div>
                <DeviceTypeDetailActions deviceType={deviceType} />
            </div>

            <div className="space-y-6">
                {/* Configuration */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
                    <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-blue-400" />
                        {t('sms.deviceTypes.configuration')}
                    </h2>

                    <div>
                        <label className="block text-xs uppercase text-[var(--foreground)]/40 font-semibold mb-2 flex items-center gap-2">
                            <Settings className="w-3 h-3" />
                            {t('sms.deviceTypes.propertiesLabel')}
                        </label>
                        <div className="bg-muted/50 rounded-lg border border-border p-4 font-mono text-sm text-[var(--foreground)]/70 overflow-x-auto">
                            <pre>{JSON.stringify(deviceType.properties, null, 2)}</pre>
                        </div>
                    </div>
                </div>

                {/* Parser Code */}
                {deviceType.code ? (
                    <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
                        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                            <Code className="w-5 h-5 text-green-400" />
                            {t('sms.deviceTypes.parserCode')}
                        </h2>
                        <div className="bg-muted/50 rounded-lg border border-border p-4 font-mono text-xs text-[var(--foreground)]/80 overflow-x-auto">
                            <pre>{deviceType.code}</pre>
                        </div>
                    </div>
                ) : deviceType.code_error ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
                        <h2 className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
                            {t('sms.deviceTypes.errorLoadingCode')}
                        </h2>
                        <p className="text-[var(--foreground)]/60 text-sm">{deviceType.code_error}</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
