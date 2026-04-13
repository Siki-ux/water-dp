"use client";

import React, { useEffect, useRef, useState, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ArrowLeft, Loader2, Trash2, Plus, X, FolderOpen } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useTheme } from "@/components/ThemeContext";

interface PageProps {
    params: Promise<{ layerName: string }>;
}

interface ProjectInfo {
    id: string;
    name: string;
    schema_name?: string;
}

export default function LayerDetailPage({ params }: PageProps) {
    const { layerName: rawLayerName } = use(params);
    const layerName = decodeURIComponent(rawLayerName);
    const { data: session } = useSession();
    const router = useRouter();
    const { t } = useTranslation();
    const { theme } = useTheme();

    const mapStyle = theme === 'light'
        ? "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);

    const [loading, setLoading] = useState(true);
    const [layerInfo, setLayerInfo] = useState<any>(null);
    const [assignedProjects, setAssignedProjects] = useState<string[]>([]);
    const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
    const [selectedProject, setSelectedProject] = useState("");
    const [assigning, setAssigning] = useState(false);

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

    // Fetch layer info + assignments + projects list
    useEffect(() => {
        if (!session?.accessToken) return;
        fetchAll();
    }, [session]);

    const fetchAll = async () => {
        setLoading(true);
        const headers = { Authorization: `Bearer ${session?.accessToken}` };

        try {
            // Layer info from GeoServer
            const infoRes = await fetch(`${apiBase}/geospatial/geoserver/layers/${layerName}`, { headers });
            if (infoRes.ok) setLayerInfo(await infoRes.json());

            // Assignments
            const assignRes = await fetch(`${apiBase}/geospatial/layers/${layerName}/assignments`, { headers });
            if (assignRes.ok) {
                const data = await assignRes.json();
                setAssignedProjects(data.project_ids || []);
            }

            // All projects — response is List[ProjectResponse] directly
            const projRes = await fetch(`${apiBase}/projects/`, { headers });
            if (projRes.ok) {
                const data = await projRes.json();
                // Handle both array and {projects: [...]} response formats
                const projects = Array.isArray(data) ? data : (data.projects || []);
                setAllProjects(projects);
            }
        } catch (e) {
            console.error("Failed to fetch layer data", e);
        } finally {
            setLoading(false);
        }
    };

    // Initialize map and show layer preview
    useEffect(() => {
        // Wait until loading is done so mapContainer is in the DOM
        if (loading || !mapContainer.current || !session?.accessToken) return;
        if (map.current) return; // Prevent double initialization

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: mapStyle,
            center: [15.4, 49.8],
            zoom: 6,
            attributionControl: false,
        });
        map.current.addControl(new maplibregl.NavigationControl(), "top-right");

        map.current.on("load", async () => {
            // Highlight water
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

            // Fetch GeoJSON with auth headers (MapLibre URL sources don't support auth)
            try {
                const geojsonRes = await fetch(
                    `${apiBase}/geospatial/geoserver/layers/${layerName}/geojson`,
                    { headers: { Authorization: `Bearer ${session?.accessToken}` } }
                );
                if (!geojsonRes.ok) throw new Error(`GeoJSON fetch failed: ${geojsonRes.status}`);
                const geojsonData = await geojsonRes.json();

                // Remove CRS field — GeoServer WFS returns a non-standard CRS that MapLibre rejects
                if (geojsonData.crs) {
                    delete geojsonData.crs;
                }

                map.current?.addSource("preview-layer", {
                    type: "geojson",
                    data: geojsonData,
                });

                map.current?.addLayer({
                    id: "preview-fill",
                    type: "fill",
                    source: "preview-layer",
                    paint: { "fill-color": "#06b6d4", "fill-opacity": 0.15 },
                });
                map.current?.addLayer({
                    id: "preview-line",
                    type: "line",
                    source: "preview-layer",
                    paint: { "line-color": "#06b6d4", "line-width": 2, "line-opacity": 0.8 },
                });
                map.current?.addLayer({
                    id: "preview-circle",
                    type: "circle",
                    source: "preview-layer",
                    filter: ["==", "$type", "Point"],
                    paint: { "circle-radius": 7, "circle-color": "#06b6d4", "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
                });

                // Fit bounds from the GeoJSON data itself
                if (geojsonData.features?.length) {
                    const bounds = new maplibregl.LngLatBounds();
                    const addCoords = (coords: any) => {
                        if (typeof coords[0] === "number") {
                            bounds.extend(coords as [number, number]);
                        } else {
                            coords.forEach(addCoords);
                        }
                    };
                    geojsonData.features.forEach((f: any) => {
                        if (f.geometry?.coordinates) addCoords(f.geometry.coordinates);
                    });
                    if (!bounds.isEmpty()) {
                        map.current?.fitBounds(bounds, { padding: 50, maxZoom: 14 });
                    }
                }
            } catch (err) {
                console.error("Failed to load layer GeoJSON:", err);
            }
        });

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [session, loading]); // Remove activeTheme from these deps so we only init once!

    // Handle theme switching dynamically
    useEffect(() => {
        if (!map.current) return;
        map.current.setStyle(mapStyle);
    }, [mapStyle]);

    const assignProject = async () => {
        if (!selectedProject || !session?.accessToken) return;
        setAssigning(true);
        try {
            const res = await fetch(`${apiBase}/geospatial/layers/${layerName}/assign`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${session.accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ project_ids: [selectedProject] }),
            });
            if (res.ok) {
                setAssignedProjects((prev) => [...prev, selectedProject]);
                setSelectedProject("");
            }
        } catch (e) {
            console.error("Assignment failed", e);
        } finally {
            setAssigning(false);
        }
    };

    const unassignProject = async (projectId: string) => {
        if (!session?.accessToken) return;
        try {
            await fetch(`${apiBase}/geospatial/layers/${layerName}/assign/${projectId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${session.accessToken}` },
            });
            setAssignedProjects((prev) => prev.filter((p) => p !== projectId));
        } catch (e) {
            console.error("Unassign failed", e);
        }
    };

    const deleteLayer = async () => {
        if (!confirm(t('layers.deleteConfirm'))) return;
        try {
            await fetch(`${apiBase}/geospatial/layers/${layerName}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${session?.accessToken}` },
            });
            router.push("/layers");
        } catch (e) {
            console.error("Delete failed", e);
        }
    };

    const getProjectName = (id: string) => {
        const proj = allProjects.find((p) => p.id === id || p.schema_name === id);
        return proj?.name || id;
    };

    // Projects not yet assigned
    const availableProjects = allProjects.filter(
        (p) => !assignedProjects.includes(p.id) && !assignedProjects.includes(p.schema_name || "")
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-hydro-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => router.push("/layers")} className="p-2 text-[var(--foreground)]/50 hover:text-[var(--foreground)] transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--foreground)]">{layerInfo?.title || layerName}</h1>
                        <p className="text-[var(--foreground)]/40 text-sm font-mono">{layerName}</p>
                    </div>
                </div>
                <button
                    onClick={deleteLayer}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-semibold border border-red-500/20 transition-colors"
                >
                    <Trash2 className="w-4 h-4" />
                    {t('layers.deleteTitle')}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
                {/* Map preview */}
                <div className="rounded-xl overflow-hidden border border-border bg-card min-h-[400px]">
                    <div ref={mapContainer} className="w-full h-full min-h-[400px]" />
                </div>

                {/* Info + Assignment panel */}
                <div className="space-y-4">
                    {layerInfo && (
                        <div className="rounded-xl border border-border bg-muted/50 p-5 space-y-3">
                            <h2 className="text-sm font-semibold text-[var(--foreground)]">{t('layers.layerInfo')}</h2>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between"><span className="text-[var(--foreground)]/40">{t('layers.workspaceCol')}</span><span className="text-[var(--foreground)]/80">{layerInfo.workspace}</span></div>
                                <div className="flex justify-between"><span className="text-[var(--foreground)]/40">{t('layers.store')}</span><span className="text-[var(--foreground)]/80">{layerInfo.store}</span></div>
                                <div className="flex justify-between"><span className="text-[var(--foreground)]/40">{t('layers.srs')}</span><span className="text-[var(--foreground)]/80">{layerInfo.srs}</span></div>
                            </div>
                        </div>
                    )}

                    <div className="rounded-xl border border-border bg-muted/50 p-5 space-y-4">
                        <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                            <FolderOpen className="w-4 h-4 text-hydro-primary" />
                            {t('layers.projectAssignments')} ({assignedProjects.length})
                        </h2>

                        {assignedProjects.length > 0 ? (
                            <div className="space-y-1.5">
                                {assignedProjects.map((pid) => (
                                    <div key={pid} className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-lg">
                                        <span className="text-xs text-[var(--foreground)]/70">{getProjectName(pid)}</span>
                                        <button
                                            onClick={() => unassignProject(pid)}
                                            className="text-[var(--foreground)]/30 hover:text-red-400 transition-colors"
                                            title={t('layers.removeAssignment')}
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-[var(--foreground)]/30 italic">{t('layers.notAssigned')}</p>
                        )}

                        {/* Add assignment */}
                        <div className="flex gap-2">
                            <select
                                value={selectedProject}
                                onChange={(e) => setSelectedProject(e.target.value)}
                                className="flex-1 px-3 py-2 bg-muted/50 border border-border rounded-lg text-xs text-[var(--foreground)] focus:outline-none focus:border-hydro-primary/50 [&>option]:bg-muted"
                            >
                                <option value="">{t('layers.selectProject')}</option>
                                {availableProjects.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={assignProject}
                                disabled={!selectedProject || assigning}
                                className="px-3 py-2 bg-hydro-primary/20 hover:bg-hydro-primary/30 text-hydro-primary rounded-lg text-xs font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
