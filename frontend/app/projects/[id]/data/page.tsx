
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import SensorList from "@/components/data/SensorList";
import SensorDetailModal from "@/components/data/SensorDetailModal";
import SensorFormModal from "@/components/data/SensorFormModal";
import DataUploadModal from "@/components/data/DataUploadModal";
import DatasetUploadModal from "@/components/data/DatasetUploadModal";
import SensorLinkModal from "@/components/data/SensorLinkModal";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function ProjectDataPage({ params }: PageProps) {
    const { data: session } = useSession();
    const { id } = React.use(params);

    const [sensors, setSensors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal States
    const [selectedSensor, setSelectedSensor] = useState<any | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [editingSensor, setEditingSensor] = useState<any | null>(null);
    const [grafanaFolderUid, setGrafanaFolderUid] = useState<string | null>(null);

    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const LIMIT = 20;

    // Fetch Sensors Function
    const fetchSensors = useCallback(async (isLoadMore = false) => {
        if (!session?.accessToken || !id) return;

        // Prevent concurrent fetches or fetching if no more data
        if (isLoadMore && (!hasMore || isLoadingMore)) return;

        try {
            if (isLoadMore) setIsLoadingMore(true);
            else setLoading(true);

            const currentOffset = isLoadMore ? sensors.length : 0;
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

            // Allow caching?
            const res = await fetch(`${apiUrl}/projects/${id}/sensors?skip=${currentOffset}&limit=${LIMIT}`, {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            });

            if (res.ok) {
                const data = await res.json();
                const mapped = data.map((t: any) => {
                    let lat = "";
                    let lon = "";
                    const loc = t.properties?.location || t.location;
                    if (loc?.type === "Point" && loc?.coordinates?.length >= 2) {
                        lon = loc.coordinates[0];
                        lat = loc.coordinates[1];
                    }

                    return {
                        ...t,
                        id: t.sensor_uuid || t.thing_id,
                        uuid: t.sensor_uuid,
                        status: 'active',
                        latitude: lat,
                        longitude: lon
                    };
                });

                if (isLoadMore) {
                    setSensors(prev => [...prev, ...mapped]);
                } else {
                    setSensors(mapped);
                }

                // If we got fewer items than limit, we reached the end
                setHasMore(mapped.length === LIMIT);
            }
        } catch (err) {
            console.error("Failed to fetch sensors", err);
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    }, [session, id, sensors.length, hasMore, isLoadingMore]);

    // Initial Fetch
    useEffect(() => {
        // Only fetch initial if empty or we want to force refresh on mount
        // We can just call it once on mount
        fetchSensors(false);
        // Disable auto-refresh for now as it conflicts with infinite scroll
    }, [session?.accessToken, id]); // Dependencies minimized to avoid loops

    // Fetch Grafana folder UID for this project
    useEffect(() => {
        if (!session?.accessToken || !id) return;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        fetch(`${apiUrl}/projects/${id}/grafana-folder`, {
            headers: { Authorization: `Bearer ${session.accessToken}` }
        })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.folder_uid) setGrafanaFolderUid(data.folder_uid);
            })
            .catch(() => { });
    }, [session?.accessToken, id]);

    // ID param logic must wait for sensors to be loaded
    const searchParams = useSearchParams();
    const sensorIdParam = searchParams.get('sensorId');

    useEffect(() => {
        if (sensorIdParam && sensors.length > 0 && !selectedSensor) {
            const found = sensors.find((s: any) => s.id === sensorIdParam || s.station_id === sensorIdParam);
            if (found) {
                setSelectedSensor(found);
            }
        }
    }, [sensorIdParam, sensors, selectedSensor]);

    // Handlers
    const handleAddSensor = async (data: any) => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

        // Check if this is a dataset creation
        if (data.station_type === 'dataset') {
            // Use the datasets API endpoint
            const payload = {
                name: data.name,
                description: data.description,
                project_id: id,
                parser_config: data.parser_config || {
                    delimiter: ",",
                    exclude_headlines: 1,
                    timestamp_columns: [{ column: 0, format: "%Y-%m-%d %H:%M:%S" }]
                },
                filename_pattern: data.filename_pattern || "*.csv"
            };

            const res = await fetch(`${apiUrl}/datasets/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.accessToken}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to create dataset");
            }
        } else {
            // Regular sensor creation
            const res = await fetch(`${apiUrl}/projects/${id}/sensors`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.accessToken}`
                },
                body: JSON.stringify(data)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Failed to create sensor");
            }
        }

        // Refresh and close
        await fetchSensors();
        setIsAddModalOpen(false);
    };

    const handleLinkSensor = async (sensorId: string) => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        const res = await fetch(`${apiUrl}/projects/${id}/sensors?thing_uuid=${sensorId}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session?.accessToken}`
            }
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Failed to link sensor");
        }

        await fetchSensors();
        setIsLinkModalOpen(false);
    };

    const handleUpdateSensor = async (data: any) => {
        if (!editingSensor) return;
        // Use the internal thing ID, not the station_id string
        const thingId = editingSensor.id;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

        const res = await fetch(`${apiUrl}/projects/${id}/things/${thingId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session?.accessToken}`
            },
            body: JSON.stringify(data)
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Failed to update sensor");
        }

        // Refresh list and update selected sensor detail context
        await fetchSensors();
        setEditingSensor(null);
        setSelectedSensor(null); // Close detail modal to avoid stale data, or verify logic
    };

    const handleDeleteSensor = async (sensorId: string, deleteFromSource: boolean) => {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        try {
            const url = `${apiUrl}/projects/${id}/sensors/${sensorId}` + (deleteFromSource ? `?delete_from_source=true` : ``);
            const res = await fetch(url, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${session?.accessToken}` }
            });
            if (res.ok) {
                // Refresh list from server to ensure sync
                await fetchSensors();
                setSelectedSensor(null);
            } else {
                alert("Failed to delete sensor");
            }
        } catch (e) {
            console.error("Delete failed", e);
            alert("Error deleting sensor");
        }
    };

    // Data Upload State
    const [uploadSensor, setUploadSensor] = useState<any | null>(null);

    const handleUploadData = async (file: File, parameter: string) => {
        if (!uploadSensor) return;
        const thingId = uploadSensor.id;
        const stationIdStr = uploadSensor.station_id || String(uploadSensor.id); // Or use what API expects?
        // My implementation in project_data.py uses `station_id_str` to verify against project, 
        // AND then constructs series_id using it.
        // Wait, the API `import_project_thing_data` uses `station_id_str` as path param.
        // BUT it verifies `if station_id_str not in sensors`.
        // AND `ProjectService.list_sensors` returns internal IDs (int/uuid).
        // So I must use the INTERNAL thing ID as the text in path.
        // Let's ensure consistent usage.

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        const formData = new FormData();
        formData.append("file", file);

        // Parameter is query param
        const res = await fetch(`${apiUrl}/projects/${id}/things/${thingId}/import?parameter=${parameter}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session?.accessToken}`
            },
            body: formData
        });

        if (!res.ok) {
            const err = await res.json();
            const detail = err.detail;
            const errMsg = typeof detail === 'object' ? JSON.stringify(detail) : (detail || "Upload failed");
            throw new Error(errMsg);
        }

        // Success
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">Data Sources</h1>
                    <p className="text-white/60 flex items-center gap-2">
                        Manage sensors and datasets.
                        <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-white/50">
                            Auto-refresh active
                        </span>
                    </p>
                </div>
                <div className="flex gap-2">
                    <a
                        href={grafanaFolderUid ? `/visualization/dashboards/f/${grafanaFolderUid}/?orgId=1` : `/visualization/dashboards`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-hydro-secondary font-semibold rounded-lg transition-colors border border-white/10 flex items-center gap-2"
                    >
                        <span>Analytics</span>
                        <ArrowUpRight size={16} />
                    </a>
                    <button
                        onClick={() => fetchSensors()}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg transition-colors border border-white/10"
                    >
                        ↻ Refresh
                    </button>
                    <button
                        onClick={() => setIsLinkModalOpen(true)}
                        className="px-4 py-2 bg-hydro-primary text-black font-semibold rounded-lg hover:bg-hydro-accent transition-colors"
                    >
                        + Link Datasource
                    </button>
                </div>
            </div>

            {loading && sensors.length === 0 ? (
                <div className="text-white/50 animate-pulse">Loading data...</div>
            ) : (
                <SensorList
                    sensors={sensors}
                    onSelectSensor={setSelectedSensor}
                    onUpload={setUploadSensor}
                    onEdit={(sensor) => {
                        setEditingSensor(sensor);
                    }}
                    onDelete={handleDeleteSensor}
                />
            )}

            {/* Detail Modal */}
            {selectedSensor && (
                <SensorDetailModal
                    sensor={selectedSensor}
                    isOpen={!!selectedSensor}
                    onClose={() => setSelectedSensor(null)}
                    token={session?.accessToken || ""}
                    onDelete={handleDeleteSensor}
                    onEdit={(sensor) => {
                        setEditingSensor(sensor);
                        setSelectedSensor(null);
                    }}
                />
            )}

            {/* Upload Modal - use different modal for datasets vs sensors */}
            {uploadSensor && (uploadSensor.station_type === 'dataset' || uploadSensor.properties?.station_type === 'dataset') ? (
                <DatasetUploadModal
                    isOpen={!!uploadSensor}
                    onClose={() => setUploadSensor(null)}
                    dataset={uploadSensor}
                    projectId={id}
                    onSuccess={() => fetchSensors()}
                />
            ) : (
                <DataUploadModal
                    isOpen={!!uploadSensor}
                    onClose={() => setUploadSensor(null)}
                    onUpload={handleUploadData}
                    sensorName={uploadSensor?.name || "Sensor"}
                />
            )}

            {/* Add Modal (Used for Datasets or explicit creation) */}
            <SensorFormModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSubmit={handleAddSensor}
                mode="create"
                projectId={id}
            />

            {/* Link Modal (Primary for Sensors) */}
            <SensorLinkModal
                isOpen={isLinkModalOpen}
                onClose={() => setIsLinkModalOpen(false)}
                onLink={handleLinkSensor}
                projectId={id}
                token={session?.accessToken || ""}
            />

            {/* Edit Modal */}
            <SensorFormModal
                isOpen={!!editingSensor}
                onClose={() => setEditingSensor(null)}
                onSubmit={handleUpdateSensor}
                initialData={editingSensor}
                mode="edit"
            />
        </div>
    );
}
