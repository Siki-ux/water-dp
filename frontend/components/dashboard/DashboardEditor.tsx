"use client";

import React, { useState, useEffect } from "react";
import GridLayout, { Layout } from "react-grid-layout";
import { Dashboard } from "@/types/dashboard";
import { Widget, WidgetType } from "@/types/widget";
import { WidgetMenu } from "./WidgetMenu";
import { DummyMapWidget, DummyChartWidget, DummyTextWidget } from "./DummyWidgets";
import { Button } from "@/components/ui/button";
import { Save, Loader2, X } from "lucide-react";
import api from "@/lib/api";
import { v4 as uuidv4 } from "uuid";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

// Use ResponsiveGridLayout or just GridLayout.
// Since we had issues with WidthProvider, we'll try explicit width first.
// If needed, we can try: import { Responsive, WidthProvider } from "react-grid-layout"; 
// But let's verify if `GridLayout` works as default export.
const ReactGridLayout = GridLayout as any;

interface DashboardEditorProps {
    dashboard: Dashboard;
}

export default function DashboardEditor({ dashboard }: DashboardEditorProps) {
    // Backend expects layout_config to be a Dict, but RGL uses an array.
    // We wrap/unwrap it for persistence.
    const initialLayout = (dashboard.layout_config as any)?.layout || (dashboard.layout_config as unknown as any[]) || [];

    // Safety check if initialLayout came back as just the array (legacy data)
    const [layout, setLayout] = useState<any[]>(Array.isArray(initialLayout) ? initialLayout : []);

    const [widgets, setWidgets] = useState<Widget[]>(
        dashboard.widgets || []
    );
    const [saving, setSaving] = useState(false);

    // If initial layout is empty/invalid but we have widgets, generate simple layout
    useEffect(() => {
        if (widgets.length > 0 && layout.length === 0) {
            const newLayout = widgets.map((w, i) => ({
                i: w.id,
                x: (i * 4) % 12,
                y: Math.floor(i / 3) * 4,
                w: 4,
                h: 4
            }));
            setLayout(newLayout);
        }
    }, [widgets, layout.length]);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const type = e.dataTransfer.getData("widgetType") as WidgetType;
        if (!type) return;

        const id = uuidv4();
        console.log("New Widget ID:", id);

        const newWidget: Widget = {
            id,
            type,
            title: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`
        };

        const newItem: any = {
            i: id,
            x: 0,
            y: Infinity,
            w: 4,
            h: 4
        };

        const newWidgets = [...widgets, newWidget];
        console.log("Widgets list:", newWidgets.map(w => w.id));

        setWidgets(newWidgets);
        setLayout([...layout, newItem]);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const removeWidget = (id: string) => {
        setWidgets(widgets.filter(w => w.id !== id));
        setLayout(layout.filter((l: any) => l.i !== id));
    };

    const saveDashboard = async () => {
        setSaving(true);
        try {
            await api.put(`/dashboards/${dashboard.id}`, {
                layout_config: { layout: layout },
                widgets: widgets
            });
        } catch (error) {
            console.error("Failed to save dashboard", error);
            // Add toast notification here
        } finally {
            setSaving(false);
        }
    };

    const renderWidget = (widget: Widget) => {
        switch (widget.type) {
            case 'map': return <DummyMapWidget title={widget.title} />;
            case 'chart': return <DummyChartWidget title={widget.title} />;
            case 'text': return <DummyTextWidget title={widget.title} />;
            default: return <div className="text-white">Unknown Widget</div>;
        }
    };

    const [containerWidth, setContainerWidth] = useState(1200);
    const containerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const updateWidth = () => {
            if (containerRef.current) {
                setContainerWidth(containerRef.current.clientWidth);
            }
        };

        // Initial measurement
        updateWidth();
        // Delay to allow layout to settle
        setTimeout(updateWidth, 100);

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });

        resizeObserver.observe(containerRef.current);

        window.addEventListener('resize', updateWidth);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateWidth);
        };
    }, []);

    return (
        <div className="flex h-full">
            <WidgetMenu />

            <div className="flex-1 flex flex-col h-full relative">
                <div className="absolute top-4 right-4 z-50">
                    <Button
                        onClick={saveDashboard}
                        disabled={saving}
                        className="bg-hydro-primary hover:bg-blue-600 shadow-lg shadow-blue-500/20"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Save Layout
                            </>
                        )}
                    </Button>
                </div>

                <div
                    ref={containerRef}
                    className="flex-1 overflow-auto bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] bg-slate-950/50"
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                >
                    <ReactGridLayout
                        className="layout"
                        layout={layout}
                        cols={12}
                        rowHeight={30}
                        width={containerWidth}
                        onLayoutChange={(newLayout: Layout[]) => setLayout(newLayout)}
                        draggableHandle=".drag-handle"
                        isDraggable
                        isResizable
                        resizeHandles={['se']}
                        resizeHandle={
                            <span className="react-resizable-handle react-resizable-handle-se absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20">
                                <svg viewBox="0 0 24 24" className="w-4 h-4 text-white/30 hover:text-white/80 rotate-90">
                                    <path fill="currentColor" d="M22 22h-2v-2h2v2zm0-4h-2v-2h2v2zm-4 4h-2v-2h2v2z" />
                                </svg>
                            </span>
                        }
                    >
                        {widgets.map((widget) => (
                            <div key={widget.id} className="relative group bg-slate-900 border border-white/10 rounded-lg overflow-hidden">
                                <div className="absolute top-0 right-0 z-10 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={() => removeWidget(widget.id)}
                                        className="bg-red-500/80 hover:bg-red-600 text-white rounded p-1"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="drag-handle absolute inset-x-0 top-0 h-8 cursor-move z-0" title="Drag to move"></div>
                                {renderWidget(widget)}
                            </div>
                        ))}
                    </ReactGridLayout>

                    {widgets.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-white/20 pointer-events-none">
                            <p className="text-xl font-medium">Drag widgets here</p>
                            <p className="text-sm">Select from the menu on the left</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
