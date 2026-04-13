"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Filter, X, Upload } from "lucide-react";
import { SensorCreateDialog } from "@/components/SensorCreateDialog";
import { BulkImportDialog } from "@/components/BulkImportDialog";
import { useTranslation } from "@/lib/i18n";

interface SensorsClientProps {
    data: any;
    page: number;
    pageSize: number;
    totalPages: number;
    search: string;
    ingestType: string;
}

const INGEST_TYPES = [
    { value: "", label: "All Types" },
    { value: "mqtt", label: "MQTT" },
    { value: "sftp", label: "SFTP" },
    { value: "extapi", label: "External API" },
    { value: "extsftp", label: "External SFTP" },
];

function buildHref(params: { page?: number; search?: string; ingest_type?: string }) {
    const sp = new URLSearchParams();
    if (params.page && params.page > 1) sp.set("page", String(params.page));
    if (params.search) sp.set("search", params.search);
    if (params.ingest_type) sp.set("ingest_type", params.ingest_type);
    const qs = sp.toString();
    return `/sms/sensors${qs ? `?${qs}` : ""}`;
}

export function SensorsClient({ data, page, pageSize, totalPages, search, ingestType }: SensorsClientProps) {
    const { t } = useTranslation();
    const router = useRouter();
    const [searchValue, setSearchValue] = useState(search);
    const [filterOpen, setFilterOpen] = useState(false);
    const [bulkOpen, setBulkOpen] = useState(false);

    // Navigate with filters, always reset to page 1
    const navigate = useCallback((newSearch: string, newIngestType: string) => {
        router.push(buildHref({ page: 1, search: newSearch, ingest_type: newIngestType }));
    }, [router]);

    // Debounced search
    useEffect(() => {
        if (searchValue === search) return;
        const timer = setTimeout(() => {
            navigate(searchValue, ingestType);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchValue, search, ingestType, navigate]);

    const handleIngestTypeChange = (value: string) => {
        navigate(searchValue, value);
        setFilterOpen(false);
    };

    const clearFilters = () => {
        setSearchValue("");
        navigate("", "");
    };

    const hasActiveFilters = search || ingestType;
    const activeIngestLabel = INGEST_TYPES.find(it => it.value === ingestType)?.label || "All Types";

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">{t('sms.sensors.title')}</h1>
                    <p className="text-white/60 mt-1">{t('sms.sensors.manageDesc')}</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setBulkOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-sm text-white/70 hover:text-white hover:border-white/30 transition-colors"
                    >
                        <Upload className="w-4 h-4" />
                        {t("sms.sensors.bulkImport")}
                    </button>
                    <SensorCreateDialog />
                </div>
            </div>

            <BulkImportDialog
                open={bulkOpen}
                onClose={(created) => {
                    setBulkOpen(false);
                    if (created > 0) router.refresh();
                }}
            />

            {/* Search + Filter Toolbar */}
            <div className="flex gap-2 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                        type="text"
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        placeholder={t('sms.sensors.search')}
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    {searchValue && (
                        <button
                            onClick={() => { setSearchValue(""); navigate("", ingestType); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Filter dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setFilterOpen(!filterOpen)}
                        className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${
                            ingestType
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                                : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                        }`}
                    >
                        <Filter className="w-4 h-4" />
                        {ingestType ? activeIngestLabel : t('sms.sensors.filter')}
                    </button>
                    {filterOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                            <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl overflow-hidden">
                                <div className="py-1">
                                    {INGEST_TYPES.map((it) => (
                                        <button
                                            key={it.value}
                                            onClick={() => handleIngestTypeChange(it.value)}
                                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                                ingestType === it.value
                                                    ? 'bg-blue-500/20 text-blue-400'
                                                    : 'text-white/80 hover:bg-white/5'
                                            }`}
                                        >
                                            {it.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {hasActiveFilters && (
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm text-white/50 hover:text-white/80 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                        Clear
                    </button>
                )}
            </div>

            <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white/5 text-white/60 font-medium border-b border-white/5">
                            <tr>
                                <th className="px-6 py-3">{t('sms.sensors.name')}</th>
                                <th className="px-6 py-3">{t('sms.sensors.project')}</th>
                                <th className="px-6 py-3">{t('sms.sensors.ingestType')}</th>
                                <th className="px-6 py-3">{t('sms.sensors.dataParser')}</th>
                                <th className="px-6 py-3">{t('sms.sensors.mqttTopic')}</th>
                                <th className="px-6 py-3 text-right">{t('sms.sensors.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {data.items.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-white/40">
                                        {hasActiveFilters
                                            ? "No sensors match your search criteria."
                                            : t('sms.sensors.noSensors')}
                                    </td>
                                </tr>
                            ) : (
                                data.items.map((sensor: any) => (
                                    <tr key={sensor.uuid} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-6 py-3 text-white font-medium">
                                            {sensor.name}
                                            <div className="text-xs text-white/40 truncate max-w-[200px]">{sensor.uuid}</div>
                                        </td>
                                        <td className="px-6 py-3 text-white/80">
                                            {sensor.project_name || t('sms.sensors.unknown')}
                                            <div className="text-xs text-white/40">{sensor.schema_name}</div>
                                        </td>
                                        <td className="px-6 py-3 text-white/80">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                                sensor.ingest_type === 'sftp' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                                sensor.ingest_type === 'extapi' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                                sensor.ingest_type === 'extsftp' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                                                'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                            }`}>
                                                {sensor.ingest_type === 'extsftp' ? 'External SFTP' :
                                                 sensor.ingest_type === 'extapi' ? 'External API' :
                                                 sensor.ingest_type === 'sftp' ? 'SFTP' :
                                                 sensor.ingest_type === 'mqtt' ? 'MQTT' :
                                                 (sensor.ingest_type || t('sms.sensors.generic'))}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-white/80">
                                            {sensor.parser || "-"}
                                        </td>
                                        <td className="px-6 py-3 text-white/50 font-mono text-xs">
                                            {sensor.mqtt_topic || "-"}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <Link
                                                href={`/sms/sensors/${sensor.uuid}`}
                                                className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium rounded-md transition-colors"
                                            >
                                                {t('sms.sensors.details')}
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between text-xs text-white/40">
                    <div>
                        {data.total > 0 ? (
                            <>{t('sms.sensors.showing')} {(page - 1) * pageSize + 1} {t('sms.sensors.to')} {Math.min(page * pageSize, data.total)} {t('sms.sensors.of')} {data.total} {t('sms.sensors.entries')}</>
                        ) : (
                            <>0 {t('sms.sensors.entries')}</>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Link
                            href={buildHref({ page: page - 1, search, ingest_type: ingestType })}
                            className={`px-3 py-1 rounded border border-white/10 ${page <= 1 ? 'pointer-events-none opacity-50' : 'hover:bg-white/5'}`}
                        >
                            {t('sms.sensors.previous')}
                        </Link>
                        <Link
                            href={buildHref({ page: page + 1, search, ingest_type: ingestType })}
                            className={`px-3 py-1 rounded border border-white/10 ${page >= totalPages ? 'pointer-events-none opacity-50' : 'hover:bg-white/5'}`}
                        >
                            {t('sms.sensors.next')}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
