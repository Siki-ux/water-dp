"use client";

import { Activity, Map as MapIcon, Type, GripVertical } from "lucide-react";

export function WidgetMenu() {
    const handleDragStart = (e: React.DragEvent, type: string) => {
        e.dataTransfer.setData("widgetType", type);
    };

    return (
        <div className="w-16 flex flex-col items-center py-4 bg-white/5 border-r border-white/10 gap-4">
            <div className="text-xs text-white/30 font-bold mb-2 uppercase tracking-wide writing-vertical text-orientation-sideways">
                Widgets
            </div>

            <div
                className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-white/10 hover:border-blue-500 hover:text-blue-400 text-white/60 cursor-grab active:cursor-grabbing transition-colors"
                draggable
                onDragStart={(e) => handleDragStart(e, 'map')}
                title="Map Widget"
            >
                <MapIcon className="w-5 h-5" />
            </div>

            <div
                className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-white/10 hover:border-green-500 hover:text-green-400 text-white/60 cursor-grab active:cursor-grabbing transition-colors"
                draggable
                onDragStart={(e) => handleDragStart(e, 'chart')}
                title="Chart Widget"
            >
                <Activity className="w-5 h-5" />
            </div>

            <div
                className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center border border-white/10 hover:border-yellow-500 hover:text-yellow-400 text-white/60 cursor-grab active:cursor-grabbing transition-colors"
                draggable
                onDragStart={(e) => handleDragStart(e, 'text')}
                title="Text Widget"
            >
                <Type className="w-5 h-5" />
            </div>
        </div>
    );
}
