"use client";

import { Activity, Map as MapIcon, Type, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetProps {
    title: string;
    className?: string;
}

export function DummyMapWidget({ title, className }: WidgetProps) {
    return (
        <div className={cn("w-full h-full bg-slate-900 rounded-lg border border-white/10 flex flex-col overflow-hidden", className)}>
            <div className="bg-white/5 px-3 py-2 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-medium text-white/80 flex items-center gap-2">
                    <MapIcon className="w-3 h-3 text-blue-400" />
                    {title}
                </span>
            </div>
            <div className="flex-1 relative bg-slate-800/50 flex items-center justify-center">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#4f4f4f_1px,transparent_1px)] [background-size:16px_16px]"></div>
                <div className="text-center">
                    <MapIcon className="w-12 h-12 text-white/10 mx-auto mb-2" />
                    <p className="text-xs text-white/30">Interactive Map</p>
                </div>
            </div>
        </div>
    );
}

export function DummyChartWidget({ title, className }: WidgetProps) {
    return (
        <div className={cn("w-full h-full bg-slate-900 rounded-lg border border-white/10 flex flex-col overflow-hidden", className)}>
            <div className="bg-white/5 px-3 py-2 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-medium text-white/80 flex items-center gap-2">
                    <Activity className="w-3 h-3 text-green-400" />
                    {title}
                </span>
            </div>
            <div className="flex-1 relative flex items-center justify-center">

                <div className="flex items-end gap-1 h-32 w-full px-8 pb-4 justify-between opacity-30">
                    {[40, 65, 30, 80, 55, 90, 45, 70, 35, 60].map((h, i) => (
                        <div key={`param-${i}`} style={{ height: `${h}%` }} className="w-4 bg-green-500 rounded-t"></div>
                    ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-xs text-white/50 backdrop-blur-sm bg-black/30 px-2 py-1 rounded">TimeSeries Chart</p>
                </div>
            </div>
        </div>
    );
}

export function DummyTextWidget({ title, className }: WidgetProps) {
    return (
        <div className={cn("w-full h-full bg-slate-900 rounded-lg border border-white/10 flex flex-col overflow-hidden", className)}>
            <div className="bg-white/5 px-3 py-2 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-medium text-white/80 flex items-center gap-2">
                    <Type className="w-3 h-3 text-yellow-400" />
                    {title}
                </span>
            </div>
            <div className="flex-1 p-4">
                <p className="text-sm text-white/60">Important notes or guidelines for this dashboard view.</p>
            </div>
        </div>
    );
}
