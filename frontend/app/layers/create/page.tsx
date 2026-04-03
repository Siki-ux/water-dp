"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Upload, Pencil, Save, Loader2, Trash2, ArrowLeft, Plus, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/components/ThemeContext";

type DrawMode = "none" | "polygon" | "line" | "point";

interface DrawnFeature {
    id: string;
    type: "Feature";
    geometry: GeoJSON.Geometry;
    properties: Record<string, any>;
}

export default function CreateLayerPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const { t } = useTranslation();
    const { theme } = useTheme();

    const mapStyle = theme === 'light'
        ? "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const [mapReady, setMapReady] = useState(false);

    // Drawing state
    const [drawMode, setDrawMode] = useState<DrawMode>("none");
    const [drawnFeatures, setDrawnFeatures] = useState<DrawnFeature[]>([]);
    const drawingPoints = useRef<[number, number][]>([]);
    const drawingSourceAdded = useRef(false);

    // Form state
    const [layerName, setLayerName] = useState("");
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Upload state
    const [uploadMode, setUploadMode] = useState<"draw" | "upload">("draw");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
    const [uploadedGeoJson, setUploadedGeoJson] = useState<any>(null);

    // Initialize map
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: mapStyle,
            center: [15.4, 49.8],
            zoom: 6,
            attributionControl: false,
        });

        map.current.addControl(new maplibregl.NavigationControl(), "top-right");

        map.current.on("load", () => {
            // Highlight water features
            const style = map.current?.getStyle();
            if (style?.layers) {
                style.layers.forEach((layer) => {
                    if (layer.id.includes("water")) {
                        if (layer.type === "fill") {
                            map.current?.setPaintProperty(layer.id, "fill-color", "#0ea5e9");
                            map.current?.setPaintProperty(layer.id, "fill-opacity", 0.3);
                        } else if (layer.type === "line") {
                            map.current?.setPaintProperty(layer.id, "line-color", "#38bdf8");
                            map.current?.setPaintProperty(layer.id, "line-opacity", 0.6);
                        }
                    }
                });
            }
            setMapReady(true);
        });

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []);

    // Handle theme switching dynamically
    useEffect(() => {
        if (!map.current || !mapReady) return;
        // On style reload, we might lose our sources and layers.
        // A full robust implementation would re-add sources on "style.load".
        // For now setStyle handles the basemap.
        map.current.setStyle(mapStyle);

        const handleStyleLoad = () => {
            drawingSourceAdded.current = false; // Force re-add drawing layers
            setMapReady(false);
            setTimeout(() => setMapReady(true), 50); // Small delay to trigger effects
        };

        map.current.once("style.load", handleStyleLoad);
        return () => {
            map.current?.off("style.load", handleStyleLoad);
        }
    }, [mapStyle, mapReady]);

    // Drawing source/layer setup
    useEffect(() => {
        if (!mapReady || !map.current || drawingSourceAdded.current) return;

        map.current.addSource("drawing", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
        });
        map.current.addSource("drawing-points", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
        });

        // Filled polygon layer
        map.current.addLayer({
            id: "drawing-fill",
            type: "fill",
            source: "drawing",
            paint: { "fill-color": "#06b6d4", "fill-opacity": 0.2 },
        });
        // Outline
        map.current.addLayer({
            id: "drawing-line",
            type: "line",
            source: "drawing",
            paint: { "line-color": "#06b6d4", "line-width": 2.5, "line-opacity": 0.9 },
        });
        // Points
        map.current.addLayer({
            id: "drawing-circle",
            type: "circle",
            source: "drawing",
            filter: ["==", "$type", "Point"],
            paint: { "circle-radius": 7, "circle-color": "#06b6d4", "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
        });
        // Temp points while drawing
        map.current.addLayer({
            id: "drawing-temp-points",
            type: "circle",
            source: "drawing-points",
            paint: { "circle-radius": 5, "circle-color": "#facc15", "circle-stroke-width": 1.5, "circle-stroke-color": "#fff" },
        });

        drawingSourceAdded.current = true;
    }, [mapReady]);

    // Update drawn features source
    const updateDrawingSource = useCallback(() => {
        if (!map.current || !drawingSourceAdded.current) return;
        const src = map.current.getSource("drawing") as maplibregl.GeoJSONSource;
        if (src) {
            src.setData({
                type: "FeatureCollection",
                features: drawnFeatures as any[],
            });
        }
    }, [drawnFeatures]);

    useEffect(() => {
        updateDrawingSource();
    }, [drawnFeatures, updateDrawingSource]);

    // Map click handler for drawing
    useEffect(() => {
        if (!map.current || !mapReady) return;

        const handleClick = (e: maplibregl.MapMouseEvent) => {
            if (drawMode === "none") return;

            const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];

            if (drawMode === "point") {
                const feat: DrawnFeature = {
                    id: `feat_${Date.now()}`,
                    type: "Feature",
                    geometry: { type: "Point", coordinates: lngLat },
                    properties: {},
                };
                setDrawnFeatures((prev) => [...prev, feat]);
                setDrawMode("none");
                return;
            }

            // Polygon / Line: accumulate points
            drawingPoints.current.push(lngLat);

            // Update temp points
            const ptSrc = map.current?.getSource("drawing-points") as maplibregl.GeoJSONSource;
            if (ptSrc) {
                ptSrc.setData({
                    type: "FeatureCollection",
                    features: drawingPoints.current.map((c) => ({
                        type: "Feature" as const,
                        geometry: { type: "Point" as const, coordinates: c },
                        properties: {},
                    })),
                });
            }
        };

        const handleDblClick = (e: maplibregl.MapMouseEvent) => {
            if (drawMode === "none" || drawMode === "point") return;
            e.preventDefault();

            const pts = drawingPoints.current;
            if (pts.length < 2) return;

            let feat: DrawnFeature;
            if (drawMode === "polygon" && pts.length >= 3) {
                feat = {
                    id: `feat_${Date.now()}`,
                    type: "Feature",
                    geometry: { type: "Polygon", coordinates: [[...pts, pts[0]]] },
                    properties: {},
                };
            } else {
                feat = {
                    id: `feat_${Date.now()}`,
                    type: "Feature",
                    geometry: { type: "LineString", coordinates: pts },
                    properties: {},
                };
            }

            setDrawnFeatures((prev) => [...prev, feat]);
            drawingPoints.current = [];

            // Clear temp points
            const ptSrc = map.current?.getSource("drawing-points") as maplibregl.GeoJSONSource;
            if (ptSrc) ptSrc.setData({ type: "FeatureCollection", features: [] });

            setDrawMode("none");
        };

        map.current.on("click", handleClick);
        map.current.on("dblclick", handleDblClick);
        map.current.doubleClickZoom.disable();

        return () => {
            map.current?.off("click", handleClick);
            map.current?.off("dblclick", handleDblClick);
            map.current?.doubleClickZoom.enable();
        };
    }, [drawMode, mapReady]);

    // Cursor
    useEffect(() => {
        if (!map.current) return;
        map.current.getCanvas().style.cursor = drawMode !== "none" ? "crosshair" : "";
    }, [drawMode]);

    // File upload handler
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const geojson = JSON.parse(text);

            if (geojson.type !== "FeatureCollection" && geojson.type !== "Feature") {
                setError("File must contain a GeoJSON FeatureCollection or Feature");
                return;
            }

            setUploadedGeoJson(geojson);
            setUploadedFileName(file.name);
            setError(null);

            // Set layer name from filename if empty
            if (!layerName) {
                const baseName = file.name.replace(/\.(geo)?json$/i, "").replace(/[^a-zA-Z0-9_]/g, "_");
                setLayerName(baseName.toLowerCase());
                setTitle(baseName.replace(/_/g, " "));
            }

            // Preview on map
            const fc = geojson.type === "Feature" ? { type: "FeatureCollection", features: [geojson] } : geojson;
            if (map.current && drawingSourceAdded.current) {
                const src = map.current.getSource("drawing") as maplibregl.GeoJSONSource;
                if (src) src.setData(fc);

                // Fit to bounds
                try {
                    const bounds = new maplibregl.LngLatBounds();
                    const addCoords = (coords: any) => {
                        if (typeof coords[0] === "number") {
                            bounds.extend(coords as [number, number]);
                        } else {
                            coords.forEach(addCoords);
                        }
                    };
                    fc.features.forEach((f: any) => addCoords(f.geometry.coordinates));
                    map.current.fitBounds(bounds, { padding: 60, maxZoom: 14 });
                } catch { }
            }
        } catch {
            setError("Invalid JSON file");
        }
    };

    // Save layer
    const handleSave = async () => {
        if (!session?.accessToken) return;
        if (!layerName.trim()) {
            setError("Layer name is required");
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("layer_name", layerName.trim().replace(/\s+/g, "_").toLowerCase());
            formData.append("title", title || layerName);
            if (description) formData.append("description", description);

            if (uploadMode === "upload" && uploadedGeoJson) {
                // Send as raw GeoJSON string
                formData.append("geojson_data", JSON.stringify(uploadedGeoJson));
            } else {
                // Send drawn features
                if (drawnFeatures.length === 0) {
                    setError("Draw at least one feature on the map");
                    setSaving(false);
                    return;
                }
                const fc = { type: "FeatureCollection", features: drawnFeatures };
                formData.append("geojson_data", JSON.stringify(fc));
            }

            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/geospatial/layers/from-geojson`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${session.accessToken}` },
                    body: formData,
                }
            );

            if (res.ok) {
                const data = await res.json();
                router.push(`/layers/${encodeURIComponent(data.layer_name)}`);
            } else {
                const err = await res.json().catch(() => ({ detail: "Unknown error" }));
                setError(err.detail || "Failed to create layer");
            }
        } catch (e: any) {
            setError(e.message || "Network error");
        } finally {
            setSaving(false);
        }
    };

    const removeFeature = (id: string) => {
        setDrawnFeatures((prev) => prev.filter((f) => f.id !== id));
    };

    const clearAll = () => {
        setDrawnFeatures([]);
        drawingPoints.current = [];
        setUploadedGeoJson(null);
        setUploadedFileName(null);
        if (map.current && drawingSourceAdded.current) {
            const src = map.current.getSource("drawing") as maplibregl.GeoJSONSource;
            const ptSrc = map.current.getSource("drawing-points") as maplibregl.GeoJSONSource;
            if (src) src.setData({ type: "FeatureCollection", features: [] });
            if (ptSrc) ptSrc.setData({ type: "FeatureCollection", features: [] });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <button onClick={() => router.push("/layers")} className="p-2 text-[var(--foreground)]/50 hover:text-[var(--foreground)] transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-[var(--foreground)]">{t('layers.create')}</h1>
                    <p className="text-[var(--foreground)]/50 text-sm">{t('layers.createDesc')}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
                {/* Map */}
                <div className="relative rounded-xl overflow-hidden border border-border bg-card min-h-[500px]">
                    {/* Toolbar */}
                    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                        {/* Mode tabs */}
                        <div className="flex bg-card/90 backdrop-blur-md rounded-lg border border-border overflow-hidden">
                            <button
                                onClick={() => { setUploadMode("draw"); clearAll(); }}
                                className={`px-3 py-2 text-xs font-semibold transition-colors ${uploadMode === "draw" ? "bg-hydro-primary/20 text-hydro-primary" : "text-[var(--foreground)]/60 hover:text-[var(--foreground)]"}`}
                            >
                                <Pencil className="w-3.5 h-3.5 inline mr-1" />{t('layers.draw')}
                            </button>
                            <button
                                onClick={() => { setUploadMode("upload"); clearAll(); }}
                                className={`px-3 py-2 text-xs font-semibold transition-colors ${uploadMode === "upload" ? "bg-hydro-primary/20 text-hydro-primary" : "text-[var(--foreground)]/60 hover:text-[var(--foreground)]"}`}
                            >
                                <Upload className="w-3.5 h-3.5 inline mr-1" />{t('layers.upload')}
                            </button>
                        </div>

                        {uploadMode === "draw" && (
                            <div className="flex flex-col gap-1 bg-card/90 backdrop-blur-md rounded-lg border border-border p-1.5">
                                {(["polygon", "line", "point"] as DrawMode[]).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => {
                                            drawingPoints.current = [];
                                            const ptSrc = map.current?.getSource("drawing-points") as maplibregl.GeoJSONSource;
                                            if (ptSrc) ptSrc.setData({ type: "FeatureCollection", features: [] });
                                            setDrawMode(drawMode === mode ? "none" : mode);
                                        }}
                                        className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors capitalize ${drawMode === mode ? "bg-cyan-500/30 text-cyan-300" : "text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-muted/50"}`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        )}

                        {uploadMode === "upload" && (
                            <div className="bg-card/90 backdrop-blur-md rounded-lg border border-border p-3">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json,.geojson"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-[var(--foreground)] rounded-lg text-xs font-semibold transition-colors w-full"
                                >
                                    <Upload className="w-4 h-4" />
                                    {uploadedFileName || t('layers.chooseFile')}
                                </button>
                                {uploadedFileName && (
                                    <div className="mt-2 text-[10px] text-green-400">✓ {uploadedFileName} {t('layers.loaded')}</div>
                                )}
                            </div>
                        )}
                    </div>

                    {drawMode !== "none" && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-card/90 backdrop-blur-md rounded-lg border border-cyan-500/30 px-4 py-2 text-xs text-cyan-300 font-medium">
                            {drawMode === "point" ? t('layers.pointHint') : t('layers.polygonHint')}
                        </div>
                    )}

                    <div ref={mapContainer} className="w-full h-full min-h-[500px]" />
                </div>

                {/* Side panel */}
                <div className="space-y-4">
                    {/* Layer info form */}
                    <div className="rounded-xl border border-border bg-muted/50 p-5 space-y-4">
                        <h2 className="text-sm font-semibold text-[var(--foreground)]">{t('layers.layerDetails')}</h2>

                        <div>
                            <label className="block text-xs text-[var(--foreground)]/50 mb-1">{t('layers.layerNameStar')}</label>
                            <input
                                value={layerName}
                                onChange={(e) => setLayerName(e.target.value)}
                                placeholder="e.g. morava_watershed"
                                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-[var(--foreground)] placeholder-[var(--foreground)]/30 focus:outline-none focus:border-hydro-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--foreground)]/50 mb-1">{t('layers.displayTitle')}</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Morava River Watershed"
                                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-[var(--foreground)] placeholder-[var(--foreground)]/30 focus:outline-none focus:border-hydro-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--foreground)]/50 mb-1">{t('layers.description')}</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                placeholder="Optional description..."
                                className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-[var(--foreground)] placeholder-[var(--foreground)]/30 focus:outline-none focus:border-hydro-primary/50 resize-none"
                            />
                        </div>
                    </div>

                    {/* Features list */}
                    {uploadMode === "draw" && (
                        <div className="rounded-xl border border-border bg-muted/50 p-5 space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                                    {t('layers.drawnFeatures')} ({drawnFeatures.length})
                                </h2>
                                {drawnFeatures.length > 0 && (
                                    <button onClick={clearAll} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                                        {t('layers.clearAll')}
                                    </button>
                                )}
                            </div>
                            {drawnFeatures.length === 0 ? (
                                <p className="text-xs text-[var(--foreground)]/30 italic">{t('layers.noFeaturesDrawn')}</p>
                            ) : (
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {drawnFeatures.map((f) => (
                                        <div key={f.id} className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg">
                                            <span className="text-xs text-[var(--foreground)]/70 capitalize">{f.geometry.type}</span>
                                            <button onClick={() => removeFeature(f.id)} className="text-[var(--foreground)]/30 hover:text-red-400 transition-colors">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-200">
                            {error}
                        </div>
                    )}

                    <button
                        onClick={handleSave}
                        disabled={saving || (!drawnFeatures.length && !uploadedGeoJson)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-hydro-primary text-[var(--foreground)] rounded-lg text-sm font-semibold hover:bg-hydro-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? t('layers.saving') : t('layers.saveLayer')}
                    </button>
                </div>
            </div>
        </div>
    );
}
