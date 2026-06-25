"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Download, RefreshCw, Calendar, TrendingUp, TrendingDown, Activity, Database, Layers, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import TimeSeriesChart from "@/components/data/TimeSeriesChart";
import { DataTable, Column } from "@/components/data/DataTable";
import { format, subHours, subDays } from "date-fns";
import { getApiUrl } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { DateTimePicker } from "@/components/DateTimePicker";

interface PageProps {
    params: Promise<{ id: string; sensorId: string }>;
}

export default function SensorDataPage({ params }: PageProps) {
    const { t, language } = useTranslation();
    const { data: session } = useSession();
    const { id, sensorId } = React.use(params);

    // State
    const [sensor, setSensor] = useState<any>(null);
    const [datastreams, setDatastreams] = useState<any[]>([]);
    const [selectedDatastream, setSelectedDatastream] = useState<string>("");

    // Data State
    const [chartData, setChartData] = useState<any[]>([]);
    const [tableData, setTableData] = useState<any[]>([]);
    const [decimationLevel, setDecimationLevel] = useState<number>(1); // 1 = Raw, 10 = 1/10, etc.

    // Pagination State
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Initial Loading State
    const [isLoading, setIsLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(false);

    // Date Range State
    // Default to last 24 hours
    const defaultEnd = new Date();
    const defaultStart = subHours(defaultEnd, 24);

    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    const formatDateForInput = (date: Date) => date.toISOString().slice(0, 16);

    const [startDate, setStartDate] = useState<string>(formatDateForInput(defaultStart));
    const [endDate, setEndDate] = useState<string>(formatDateForInput(defaultEnd));

    // Y-Axis State
    const [yMin, setYMin] = useState<number | "auto">("auto");
    const [yMax, setYMax] = useState<number | "auto">("auto");
    const [yMinInput, setYMinInput] = useState("");
    const [yMaxInput, setYMaxInput] = useState("");

    const apiUrl = getApiUrl();

    // Fetch Sensor Details & Datastreams
    const fetchSensor = useCallback(async () => {
        if (!session?.accessToken) return;
        try {
            const res = await fetch(`${apiUrl}/things/${sensorId}`, {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSensor(data);

                const dsList = data.datastreams || [];
                setDatastreams(dsList);

                // Select first datastream by default
                if (dsList.length > 0 && !selectedDatastream) {
                    setSelectedDatastream(dsList[0].name);
                }
            }
        } catch (e) {
            console.error("Failed to fetch sensor details", e);
        }
    }, [apiUrl, sensorId, session, selectedDatastream]);

    // Fetch Chart Data (Bulk)
    const fetchChartData = useCallback(async () => {
        if (!session?.accessToken || !sensorId || !selectedDatastream) return;

        try {
            setChartLoading(true);
            const url = new URL(`${apiUrl}/things/${sensorId}/datastream/${encodeURIComponent(selectedDatastream)}/observations`);
            url.searchParams.append("limit", "5000"); // Large chunk for visual

            if (startDate) url.searchParams.append("start_time", new Date(startDate).toISOString());
            if (endDate) url.searchParams.append("end_time", new Date(endDate).toISOString());

            const res = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            });

            if (res.ok) {
                const rawData = await res.json();
                const mappedData = rawData.map((obs: any) => ({
                    timestamp: obs.phenomenon_time || obs.phenomenonTime,
                    value: obs.result,
                    unit: '',
                    quality_flag: 'good'
                }));
                const sortedData = mappedData.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                setChartData(sortedData);
            }
        } catch (e) {
            console.error("Failed to fetch chart data", e);
        } finally {
            setChartLoading(false);
        }
    }, [apiUrl, session, sensorId, selectedDatastream, startDate, endDate]);

    // Fetch Table Data (Paginated)
    const fetchTableData = useCallback(async (currentOffset: number) => {
        if (!session?.accessToken || !sensorId || !selectedDatastream) return;

        try {
            setIsLoadingMore(true);
            const limit = 100;
            const url = new URL(`${apiUrl}/things/${sensorId}/datastream/${encodeURIComponent(selectedDatastream)}/observations`);
            url.searchParams.append("limit", limit.toString());
            url.searchParams.append("offset", currentOffset.toString());
            url.searchParams.append("order_by", "resultTime desc"); // Newest first for table

            if (startDate) url.searchParams.append("start_time", new Date(startDate).toISOString());
            if (endDate) url.searchParams.append("end_time", new Date(endDate).toISOString());

            const res = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            });

            if (res.ok) {
                const rawData = await res.json();
                const mappedData = rawData.map((obs: any) => ({
                    timestamp: obs.phenomenon_time || obs.phenomenonTime,
                    value: obs.result,
                    unit: '',
                    quality_flag: 'good'
                }));

                if (mappedData.length < limit) {
                    setHasMore(false);
                }

                setTableData(prev => currentOffset === 0 ? mappedData : [...prev, ...mappedData]);
                setOffset(currentOffset + limit);
            }
        } catch (e) {
            console.error("Failed to fetch table data", e);
        } finally {
            setIsLoadingMore(false);
            setIsLoading(false);
        }
    }, [apiUrl, session, sensorId, selectedDatastream, startDate, endDate]);

    // Initial Load
    useEffect(() => {
        fetchSensor();
    }, [fetchSensor]);

    // Main Fetch Trigger (Filters/Selection Change)
    useEffect(() => {
        if (selectedDatastream) {
            fetchChartData();
            // Reset table
            setOffset(0);
            setHasMore(true);
            setTableData([]);
            fetchTableData(0);
        }
    }, [selectedDatastream]);


    const handleApplyFilters = () => {
        fetchChartData();
        setOffset(0);
        setHasMore(true);
        setTableData([]);
        fetchTableData(0);
    };

    const handleRefresh = handleApplyFilters;

    // Relative time presets — set window and immediately fetch
    const applyRelativeRange = useCallback((hours: number) => {
        const end = new Date();
        const start = subHours(end, hours);
        setEndDate(formatDateForInput(end));
        setStartDate(formatDateForInput(start));
    }, []);

    // Pan the time window left or right by half the current range
    const panWindow = useCallback((direction: 1 | -1) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const shiftMs = (end.getTime() - start.getTime()) / 2;
        setStartDate(formatDateForInput(new Date(start.getTime() + direction * shiftMs)));
        setEndDate(formatDateForInput(new Date(end.getTime() + direction * shiftMs)));
    }, [startDate, endDate]);

    // Zoom in (halve range) or out (double range), centred on midpoint
    const zoomWindow = useCallback((factor: number) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const midMs = (start.getTime() + end.getTime()) / 2;
        const newHalf = (end.getTime() - start.getTime()) / 2 * factor;
        setStartDate(formatDateForInput(new Date(midMs - newHalf)));
        setEndDate(formatDateForInput(new Date(midMs + newHalf)));
    }, [startDate, endDate]);

    // Displayed data: filter by current date window first, then decimate.
    // Pan/zoom just updates startDate/endDate without re-fetching — instant view shift.
    const displayedChartData = useMemo(() => {
        const startMs = new Date(startDate).getTime();
        const endMs = new Date(endDate).getTime();
        const windowed = chartData.filter(d => {
            const t = new Date(d.timestamp).getTime();
            return t >= startMs && t <= endMs;
        });
        if (decimationLevel === 1) return windowed;
        return windowed.filter((_, i) => i % decimationLevel === 0);
    }, [chartData, startDate, endDate, decimationLevel]);

    // Stats (from ALL loaded chart data)
    const stats = useMemo(() => {
        if (!chartData || chartData.length === 0) return { min: null, max: null, avg: null, count: 0 };
        const values = chartData.map(d => d.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const count = values.length;
        return { min, max, avg, count };
    }, [chartData]);


    // Columns
    const columns: Column<any>[] = useMemo(() => [
        {
            header: t("projects.sensorData.time"),
            accessorKey: "timestamp",
            cell: (item) => <span className="text-[var(--foreground)] font-mono">{format(new Date(item.timestamp), "yyyy-MM-dd HH:mm:ss")}</span>,
            sortable: true
        },
        {
            header: t("projects.sensorData.value"),
            accessorKey: "value",
            cell: (item) => <span className="font-semibold text-white">{item.value?.toFixed(2)}</span>,
            sortable: true
        },
        {
            header: t("projects.sensorData.unit"),
            accessorKey: "unit",
            cell: () => <span className="text-white/50">{datastreams.find(d => d.name === selectedDatastream)?.unit_of_measurement?.symbol || datastreams.find(d => d.name === selectedDatastream)?.unit || '-'}</span>
        }
    ], [datastreams, selectedDatastream, language]);

    if (!session) return null;

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Link
                        href={`/projects/${id}/data`}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/70 hover:text-white"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                            {sensor?.name || t("projects.sensorData.loading")}
                            {sensor && (() => {
                                const ACTIVE_MS = 24 * 60 * 60 * 1000;
                                const lastActivity = sensor.last_activity;
                                const isActive = (lastActivity && Date.now() - new Date(lastActivity).getTime() < ACTIVE_MS)
                                    || sensor?.properties?.status === 'active';
                                return (
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${isActive
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                        }`}>
                                        {isActive ? 'active' : (sensor?.properties?.status || 'inactive')}
                                    </span>
                                );
                            })()}
                        </h1>
                        <p className="text-white/60 text-sm">{sensor?.description || t("projects.sensorData.historyDesc")}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleRefresh}
                        className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 transition-colors"
                        title={t("projects.sensorData.refresh")}
                    >
                        <RefreshCw className={`w-5 h-5 ${chartLoading ? "animate-spin" : ""}`} />
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-hydro-primary text-black font-semibold rounded-lg hover:bg-hydro-accent transition-colors">
                        <Download className="w-4 h-4" />
                        {t("projects.sensorData.exportCsv")}
                    </button>
                </div>
            </div>

            {/* Content Grid */}
            <div className="flex flex-col gap-6 flex-1 min-h-0 overflow-y-auto pr-2">

                {/* 1. Chart Section (Full Width) */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm relative shrink-0">
                    <div className="flex flex-wrap justify-between items-end mb-4 gap-4">
                        <div className="flex flex-col">
                            <h2 className="text-lg font-semibold text-white">{t("projects.sensorData.historicalTrends")}</h2>
                            <div className="flex items-center gap-2 mt-1">
                                {datastreams.length > 0 && (
                                    <select
                                        value={selectedDatastream}
                                        onChange={(e) => setSelectedDatastream(e.target.value)}
                                        className="bg-card border border-border rounded text-xs text-[var(--foreground)] px-2 py-1 outline-none focus:border-hydro-primary"
                                    >
                                        {datastreams.map((ds: any) => (
                                            <option key={ds.name} value={ds.name} className="bg-card text-[var(--foreground)]">
                                                {ds.label || ds.name} ({ds.unit_of_measurement?.symbol || ds.unit || '-'})
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {/* Filter Controls — single row */}
                        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 text-sm bg-black/20 px-3 py-2 rounded-lg border border-white/5 w-full">
                            {/* Quick range presets */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-white/50 px-0.5">Quick range</label>
                                <div className="flex gap-1">
                                    {([["1h", 1], ["6h", 6], ["24h", 24], ["7d", 168], ["30d", 720]] as [string, number][]).map(([label, hours]) => (
                                        <button key={label}
                                            onClick={() => { applyRelativeRange(hours); setTimeout(handleApplyFilters, 0); }}
                                            className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-hydro-primary/30 text-white/70 hover:text-white transition-colors border border-white/10">
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="self-stretch w-px bg-white/10" />

                            {/* From */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-white/50 px-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> {t("projects.sensorData.from")}</label>
                                <DateTimePicker value={startDate} onChange={setStartDate} />
                            </div>

                            {/* To + Now */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-white/50 px-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> {t("projects.sensorData.to")}</label>
                                <div className="flex gap-1 items-center">
                                    <DateTimePicker value={endDate} onChange={setEndDate} />
                                    <button onClick={() => setEndDate(formatDateForInput(new Date()))}
                                        className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-hydro-primary/30 text-white/70 hover:text-white transition-colors border border-white/10 whitespace-nowrap h-[30px]"
                                        title="Set To to now">
                                        Now
                                    </button>
                                </div>
                            </div>

                            <div className="self-stretch w-px bg-white/10" />

                            {/* Resolution */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-white/50 px-0.5 flex items-center gap-1"><Layers className="w-3 h-3" /> {t("projects.sensorData.resolution")}</label>
                                <select value={decimationLevel} onChange={(e) => setDecimationLevel(Number(e.target.value))}
                                    className="bg-card border border-border rounded px-2 py-1 text-[var(--foreground)] text-xs focus:ring-1 focus:ring-hydro-primary outline-none w-24">
                                    <option value={1} className="bg-card">{t("projects.sensorData.native")}</option>
                                    <option value={5} className="bg-card">1:5</option>
                                    <option value={10} className="bg-card">1:10</option>
                                    <option value={60} className="bg-card">1:60</option>
                                </select>
                            </div>

                            <div className="self-stretch w-px bg-white/10" />

                            {/* Y axis */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-white/50 px-0.5">{t("projects.sensorData.yMin")}</label>
                                <input type="number" placeholder={t("projects.sensorData.auto")} value={yMinInput}
                                    onChange={(e) => { setYMinInput(e.target.value); setYMin(e.target.value === "" ? "auto" : Number(e.target.value)); }}
                                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[var(--foreground)] text-xs focus:ring-1 focus:ring-hydro-primary outline-none w-16" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-white/50 px-0.5">{t("projects.sensorData.yMax")}</label>
                                <input type="number" placeholder={t("projects.sensorData.auto")} value={yMaxInput}
                                    onChange={(e) => { setYMaxInput(e.target.value); setYMax(e.target.value === "" ? "auto" : Number(e.target.value)); }}
                                    className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[var(--foreground)] text-xs focus:ring-1 focus:ring-hydro-primary outline-none w-16" />
                            </div>

                            <button onClick={handleApplyFilters}
                                className="ml-auto px-4 py-1 bg-hydro-primary/20 hover:bg-hydro-primary/30 text-hydro-primary text-xs rounded transition-colors self-end h-[30px] border border-hydro-primary/30 whitespace-nowrap">
                                {chartLoading ? "Loading…" : "Apply"}
                            </button>
                        </div>
                    </div>

                    <div className="h-[400px] relative">
                        {chartLoading ? (
                            <div className="h-full flex items-center justify-center text-white/30">
                                <Activity className="w-6 h-6 animate-spin mr-2" /> Loading data...
                            </div>
                        ) : displayedChartData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-white/30">No data available for this range — adjust filters and click Apply</div>
                        ) : (
                            <TimeSeriesChart
                                series={[
                                    {
                                        name: sensor?.name || "Value",
                                        label: selectedDatastream,
                                        color: "#10b981",
                                        unit: datastreams.find(d => d.name === selectedDatastream)?.unit_of_measurement?.symbol || datastreams.find(d => d.name === selectedDatastream)?.unit || "",
                                        data: displayedChartData
                                    }
                                ]}
                                yMin={yMin}
                                yMax={yMax}
                            />
                        )}
                        <div className="absolute top-2 right-2 text-[10px] text-white/20">
                            Showing {displayedChartData.length} pts (Decimation: {decimationLevel}x)
                        </div>
                    </div>

                    {/* Pan / Zoom strip — sits just under the X axis */}
                    <div className="flex items-center justify-center gap-1 mt-2">
                        <button onClick={() => panWindow(-1)} title="Pan left (½ window)"
                            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition-colors border border-white/10">
                            <ChevronLeft className="w-3.5 h-3.5" /> Pan
                        </button>
                        <button onClick={() => zoomWindow(2)} title="Zoom out (×2 range)"
                            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition-colors border border-white/10">
                            <ZoomOut className="w-3.5 h-3.5" /> Zoom−
                        </button>
                        <button onClick={() => zoomWindow(0.5)} title="Zoom in (½ range)"
                            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition-colors border border-white/10">
                            <ZoomIn className="w-3.5 h-3.5" /> Zoom+
                        </button>
                        <button onClick={() => panWindow(1)} title="Pan right (½ window)"
                            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-white/5 hover:bg-white/15 text-white/50 hover:text-white transition-colors border border-white/10">
                            Pan <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* 2. Stats Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <div className="text-white/40 text-xs uppercase tracking-wider mb-1 flex items-center gap-2">
                            <TrendingDown className="w-3 h-3" /> Min (Loaded)
                        </div>
                        <div className="text-xl font-bold text-white">
                            {stats.min !== null ? stats.min.toFixed(2) : "-"}
                            <span className="text-sm font-normal text-white/30 ml-1">
                                {datastreams.find(d => d.name === selectedDatastream)?.unit_of_measurement?.symbol || datastreams.find(d => d.name === selectedDatastream)?.unit || ""}
                            </span>
                        </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <div className="text-white/40 text-xs uppercase tracking-wider mb-1 flex items-center gap-2">
                            <TrendingUp className="w-3 h-3" /> Max (Loaded)
                        </div>
                        <div className="text-xl font-bold text-white">
                            {stats.max !== null ? stats.max.toFixed(2) : "-"}
                            <span className="text-sm font-normal text-white/30 ml-1">
                                {datastreams.find(d => d.name === selectedDatastream)?.unit_of_measurement?.symbol || datastreams.find(d => d.name === selectedDatastream)?.unit || ""}
                            </span>
                        </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <div className="text-white/40 text-xs uppercase tracking-wider mb-1 flex items-center gap-2">
                            <Activity className="w-3 h-3" /> Avg (Loaded)
                        </div>
                        <div className="text-xl font-bold text-emerald-400">
                            {stats.avg !== null ? stats.avg.toFixed(2) : "-"}
                            <span className="text-sm font-normal text-white/30 ml-1">
                                {datastreams.find(d => d.name === selectedDatastream)?.unit_of_measurement?.symbol || datastreams.find(d => d.name === selectedDatastream)?.unit || ""}
                            </span>
                        </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                        <div className="text-white/40 text-xs uppercase tracking-wider mb-1 flex items-center gap-2">
                            <Database className="w-3 h-3" /> Total Loaded
                        </div>
                        <div className="text-xl font-bold text-white">
                            {stats.count.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-white/30 truncate">
                            Limited to 5k for perf. Use filters for more.
                        </div>
                    </div>
                </div>

                {/* 3. Data Log (Table) - Bottom */}
                <div className="flex flex-col bg-white/5 border border-white/10 rounded-xl overflow-hidden shadow-xl backdrop-blur-sm h-[500px] shrink-0">
                    <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
                        <h2 className="text-lg font-semibold text-white">Data Log</h2>
                    </div>
                    <div className="flex-1 overflow-hidden p-2 relative">
                        {/* Infinite Scroll Table */}
                        <DataTable
                            columns={columns}
                            data={tableData}
                            onLoadMore={() => fetchTableData(offset)}
                            hasMore={hasMore}
                            isLoading={isLoadingMore}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
