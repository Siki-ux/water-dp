
"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { format } from "date-fns";
import { Eye, Trash2, Search, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface Sensor {
    id: string | number;
    name: string;
    description: string;
    status: string;
    updated_at: string;
    last_activity?: string;
    properties?: any;
    station_type?: string;
}

interface SensorListProps {
    sensors: Sensor[];
    onSelectSensor: (sensor: Sensor) => void;
    onUpload?: (sensor: Sensor) => void;
    onDelete?: (sensorId: string, deleteFromSource: boolean) => void;
    onLoadMore?: () => void;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    initialStatusFilter?: "all" | "active" | "inactive";
}

type SortField = "name" | "status" | "last_activity";
type SortDir = "asc" | "desc";

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
    if (sortField !== field) return <ChevronsUpDown size={13} className="opacity-30" />;
    return sortDir === "asc" ? <ChevronUp size={13} className="opacity-80" /> : <ChevronDown size={13} className="opacity-80" />;
}

export default function SensorList({
    sensors,
    onSelectSensor,
    onUpload,
    onDelete,
    onLoadMore,
    hasMore,
    isLoadingMore,
    initialStatusFilter = "all",
}: SensorListProps) {
    const observerTarget = useRef(null);
    const { t } = useTranslation();

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(initialStatusFilter);
    const [sortField, setSortField] = useState<SortField>("name");
    const [sortDir, setSortDir] = useState<SortDir>("asc");

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortDir("asc");
        }
    };

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return sensors
            .filter((s) => {
                if (statusFilter !== "all" && s.status !== statusFilter) return false;
                if (q && !s.name?.toLowerCase().includes(q) && !String(s.id).toLowerCase().includes(q)) return false;
                return true;
            })
            .sort((a, b) => {
                let cmp = 0;
                if (sortField === "name") {
                    cmp = (a.name || "").localeCompare(b.name || "");
                } else if (sortField === "status") {
                    cmp = (a.status || "").localeCompare(b.status || "");
                } else if (sortField === "last_activity") {
                    const ta = a.last_activity ? new Date(a.last_activity).getTime() : 0;
                    const tb = b.last_activity ? new Date(b.last_activity).getTime() : 0;
                    cmp = ta - tb;
                }
                return sortDir === "asc" ? cmp : -cmp;
            });
    }, [sensors, search, statusFilter, sortField, sortDir]);

    const activeCount = sensors.filter((s) => s.status === "active").length;
    const inactiveCount = sensors.filter((s) => s.status !== "active").length;

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoadingMore && onLoadMore) {
                    onLoadMore();
                }
            },
            { threshold: 0.5 }
        );
        if (observerTarget.current) observer.observe(observerTarget.current);
        return () => {
            if (observerTarget.current) observer.unobserve(observerTarget.current);
        };
    }, [hasMore, isLoadingMore, onLoadMore]);

    return (
        <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex flex-wrap gap-3 items-center">
                {/* Search */}
                <div className="relative flex-1 min-w-[220px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                        type="text"
                        placeholder="Search by name or ID…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                    />
                </div>

                {/* Status filter */}
                <div className="flex gap-1">
                    {(["all", "active", "inactive"] as const).map((s) => {
                        const label =
                            s === "all"
                                ? `All (${sensors.length})`
                                : s === "active"
                                ? `Active (${activeCount})`
                                : `Inactive (${inactiveCount})`;
                        return (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    statusFilter === s
                                        ? s === "active"
                                            ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                            : s === "inactive"
                                            ? "bg-gray-500/20 text-gray-300 border border-gray-500/30"
                                            : "bg-white/15 text-white border border-white/20"
                                        : "bg-white/5 text-white/50 border border-white/10 hover:bg-white/10"
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>

                {filtered.length !== sensors.length && (
                    <span className="text-xs text-white/40">
                        Showing {filtered.length} of {sensors.length}
                    </span>
                )}
            </div>

            {sensors.length === 0 ? (
                <div className="text-white/50 text-center py-10 bg-white/5 rounded-xl border border-white/10">
                    {t("sms.sensors.noDataSources")}
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-white/50 text-center py-10 bg-white/5 rounded-xl border border-white/10">
                    No sensors match your filters.
                </div>
            ) : (
                <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-white/5 custom-scrollbar">
                    <table className="w-full text-left text-sm text-white/70">
                        <thead className="bg-white/10 text-white uppercase font-semibold sticky top-0 z-10">
                            <tr>
                                <th
                                    className="px-6 py-4 cursor-pointer select-none hover:text-white/80"
                                    onClick={() => handleSort("name")}
                                >
                                    <span className="flex items-center gap-1">
                                        {t("sms.sensors.name")}
                                        <SortIcon field="name" sortField={sortField} sortDir={sortDir} />
                                    </span>
                                </th>
                                <th className="px-6 py-4">{t("sms.sensors.idCol")}</th>
                                <th
                                    className="px-6 py-4 cursor-pointer select-none hover:text-white/80"
                                    onClick={() => handleSort("status")}
                                >
                                    <span className="flex items-center gap-1">
                                        {t("sms.sensors.statusCol")}
                                        <SortIcon field="status" sortField={sortField} sortDir={sortDir} />
                                    </span>
                                </th>
                                <th
                                    className="px-6 py-4 cursor-pointer select-none hover:text-white/80"
                                    onClick={() => handleSort("last_activity")}
                                >
                                    <span className="flex items-center gap-1">
                                        {t("sms.sensors.lastUpdateCol")}
                                        <SortIcon field="last_activity" sortField={sortField} sortDir={sortDir} />
                                    </span>
                                </th>
                                <th className="px-6 py-4 text-right">{t("sms.sensors.actions")}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {filtered.map((sensor) => {
                                const isDataset =
                                    sensor.station_type === "dataset" ||
                                    sensor.properties?.station_type === "dataset" ||
                                    sensor.properties?.type === "static_dataset";

                                return (
                                    <tr
                                        key={sensor.id}
                                        className="hover:bg-white/5 transition-colors cursor-pointer group"
                                        onClick={() => onSelectSensor(sensor)}
                                    >
                                        <td className="px-6 py-4 font-medium text-white">{sensor.name}</td>
                                        <td className="px-6 py-4 font-mono text-xs text-white/50">{sensor.id || "-"}</td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                    sensor.status === "active"
                                                        ? "bg-green-400/10 text-green-400"
                                                        : "bg-gray-400/10 text-gray-400"
                                                }`}
                                            >
                                                {sensor.status || t("sms.sensors.unknown")}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {sensor.last_activity || sensor.updated_at
                                                ? format(
                                                      new Date(sensor.last_activity || sensor.updated_at),
                                                      "MMM d, HH:mm"
                                                  )
                                                : "-"}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {onUpload && isDataset && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onUpload(sensor);
                                                        }}
                                                        className="text-hydro-primary hover:text-white px-2 py-1 bg-hydro-primary/10 rounded text-xs transition-colors"
                                                        title={t("sms.sensors.uploadData")}
                                                    >
                                                        {t("sms.sensors.upload")}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectSensor(sensor);
                                                    }}
                                                    className="text-white/50 hover:text-white transition-colors"
                                                    title={t("sms.sensors.viewDetails")}
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                {onDelete && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (confirm(t("sms.sensors.unlinkConfirmList"))) {
                                                                onDelete(sensor.id as string, false);
                                                            }
                                                        }}
                                                        className="text-white/50 hover:text-red-400 transition-colors"
                                                        title={t("sms.sensors.unlink")}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Infinite scroll sentinel */}
            <div ref={observerTarget} />
            {isLoadingMore && (
                <div className="text-center py-2 text-white/40 text-sm">Loading more…</div>
            )}
        </div>
    );
}
