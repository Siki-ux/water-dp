"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import {
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    CartesianGrid,
    Brush,
    ReferenceArea,
} from "recharts";
import { format } from "date-fns";
import { ZoomOut, RefreshCw } from "lucide-react";

interface DataPoint {
    timestamp: string;
    value: number;
}

interface Series {
    name: string;
    label: string;
    color: string;
    unit: string;
    data: DataPoint[];
}

interface TimeSeriesChartProps {
    series: Series[];
    yMin?: number | "auto";
    yMax?: number | "auto";
}

export default function TimeSeriesChart({
    series,
    yMin = "auto",
    yMax = "auto",
}: TimeSeriesChartProps) {
    const [left, setLeft] = useState<string | number>("dataMin");
    const [right, setRight] = useState<string | number>("dataMax");
    const [top, setTop] = useState<string | number>(yMax);
    const [bottom, setBottom] = useState<string | number>(yMin);

    // Update state when props change
    useEffect(() => {
        setTop(yMax);
        setBottom(yMin);
    }, [yMin, yMax]);

    const [refAreaLeft, setRefAreaLeft] = useState<string | number>("");
    const [refAreaRight, setRefAreaRight] = useState<string | number>("");
    const [refAreaTop, setRefAreaTop] = useState<string | number>("");
    const [refAreaBottom, setRefAreaBottom] = useState<string | number>("");

    // Merge data from all series for a combined X-axis
    const chartData = useMemo(() => {
        const timeMap: Record<number, any> = {};

        series.forEach(s => {
            s.data.forEach(d => {
                const time = new Date(d.timestamp).getTime();
                if (!timeMap[time]) {
                    timeMap[time] = { time, originalTimestamp: d.timestamp };
                }
                timeMap[time][s.name] = d.value;
            });
        });

        return Object.values(timeMap).sort((a: any, b: any) => a.time - b.time);
    }, [series]);

    const zoom = () => {
        let l = refAreaLeft;
        let r = refAreaRight;

        if (l === r || l === "" || r === "") {
            setRefAreaLeft("");
            setRefAreaRight("");
            return;
        }

        // Normalize inputs
        if (typeof l !== "number" || typeof r !== "number") return;
        if (l > r) [l, r] = [r, l];

        // 1D Zoom (X only) - Auto scale based on visible series
        const dataInRange = chartData.filter((d: any) => d.time >= l && d.time <= r);
        if (dataInRange.length > 0) {
            const allValues: number[] = [];
            series.forEach(s => {
                dataInRange.forEach((d: any) => {
                    if (d[s.name] !== undefined) allValues.push(d[s.name]);
                });
            });

            if (allValues.length > 0) {
                let vMin = Math.min(...allValues);
                let vMax = Math.max(...allValues);
                const padding = (vMax - vMin) * 0.1 || 1;
                setBottom(vMin - padding);
                setTop(vMax + padding);
            }
        }

        setRefAreaLeft("");
        setRefAreaRight("");
        setRefAreaTop("");
        setRefAreaBottom("");

        setLeft(l);
        setRight(r);
    };

    const zoomOut = () => {
        setLeft("dataMin");
        setRight("dataMax");
        setTop(yMax);
        setBottom(yMin);
    };

    if (series.length === 0 || chartData.length === 0) {
        return (
            <div className="h-64 flex items-center justify-center text-[var(--foreground)]/30 bg-muted/50 rounded-lg border border-border">
                No data available for the selected datastreams.
            </div>
        );
    }

    return (
        <div className="w-full h-80 relative select-none">
            {left !== "dataMin" && (
                <button
                    onClick={zoomOut}
                    className="absolute top-2 right-2 z-10 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-[var(--background)] bg-[var(--foreground)] rounded-md hover:filter hover:brightness-110 shadow-sm transition-all"
                >
                    <ZoomOut className="w-3 h-3" />
                    Reset Zoom
                </button>
            )}

            <ResponsiveContainer width="100%" height="100%">
                <LineChart
                    data={chartData}
                    onMouseDown={(e: any) => e && e.activeLabel && setRefAreaLeft(e.activeLabel)}
                    onMouseMove={(e: any) => refAreaLeft && e && e.activeLabel && setRefAreaRight(e.activeLabel)}
                    onMouseUp={zoom}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                        dataKey="time"
                        type="number"
                        domain={[left, right]}
                        tickFormatter={(val) => format(new Date(val), "MM/dd HH:mm")}
                        stroke="var(--foreground)"
                        opacity={0.3}
                        tick={{ fill: "var(--foreground)", opacity: 0.5, fontSize: 10 }}
                        allowDataOverflow
                    />
                    <YAxis
                        domain={[bottom, top]}
                        stroke="var(--foreground)"
                        opacity={0.3}
                        tick={{ fill: "var(--foreground)", opacity: 0.5, fontSize: 10 }}
                        tickFormatter={(val) => new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(val)}
                        allowDataOverflow
                        width={40}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "12px",
                            padding: "12px",
                            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
                            color: "var(--foreground)"
                        }}
                        itemStyle={{ fontSize: "12px", padding: "2px 0", color: "var(--foreground)" }}
                        labelStyle={{ color: "var(--foreground)", opacity: 0.6, fontSize: "10px", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}
                        labelFormatter={(label) => format(new Date(label), "MMM d, yyyy HH:mm:ss")}
                    />
                    {series.map(s => (
                        <Line
                            key={s.name}
                            type="monotone"
                            dataKey={s.name}
                            stroke={s.color}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                            name={s.label}
                            animationDuration={300}
                            connectNulls
                        />
                    ))}
                    {refAreaLeft && refAreaRight ? (
                        <ReferenceArea
                            x1={refAreaLeft}
                            x2={refAreaRight}
                            strokeOpacity={0.3}
                            fill="var(--foreground)"
                            opacity={0.1}
                        />
                    ) : null}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
