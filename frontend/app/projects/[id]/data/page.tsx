
"use client";

import { useEffect, useState, useCallback } from "react";
import React from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import SensorList from "@/components/data/SensorList";
import SensorDetailModal from "@/components/data/SensorDetailModal";
import SensorFormModal from "@/components/data/SensorFormModal";
import DataUploadModal from "@/components/data/DataUploadModal";
import DatasetUploadModal from "@/components/data/DatasetUploadModal";
import SensorLinkModal from "@/components/data/SensorLinkModal";
import { useTranslation } from "@/lib/i18n";
import { useProjectPermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function ProjectDataPage({ params }: PageProps) {
    const { id } = React.use(params);
    const { t } = useTranslation();
    const { data: perms } = useProjectPermissions(id);

    const [sensors, setSensors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal States
    const [selectedSensor, setSelectedSensor] = useState<any | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [grafanaFolderUid, setGrafanaFolderUid] = useState<string | null>(null);

    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const LIMIT = 20;

    // Fetch Sensors Function
    const fetchSensors = useCallback(async (isLoadMore = false) => {
        if (!id) return;

        if (isLoadMore && (!hasMore || isLoadingMore)) return;

        try {
            if (isLoadMore) setIsLoadingMore(true);
            else setLoading(true);

            const currentOffset = isLoadMore ? sensors.length : 0;

            const res = await api.get(`/projects/${id}/sensors`, {
                params: { skip: currentOffset, limit: LIMIT }
            });

            const data = res.data;
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
        } catch (err) {
            console.error("Failed to fetch sensors", err);
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    }, [id, sensors.length, hasMore, isLoadingMore]);

    // Initial Fetch
    useEffect(() => {
        fetchSensors(false);
    }, [id]);

    // Fetch Grafana folder UID for this project
    useEffect(() => {
        if (!id) return;
        api.get(`/projects/${id}/grafana-folder`)
            .then(res => {
                if (res.data?.folder_uid) setGrafanaFolderUid(res.data.folder_uid);
            })
            .catch(() => { });
    }, [id]);

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
        if (data.station_type === 'dataset') {
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

            await api.post('/datasets/', payload);
        } else {
            await api.post(`/projects/${id}/sensors`, data);
        }

        await fetchSensors();
        setIsAddModalOpen(false);
    };

    const handleLinkSensor = async (sensorId: string) => {
        await api.post(`/projects/${id}/sensors`, null, {
            params: { thing_uuid: sensorId }
        });

        await fetchSensors();
        setIsLinkModalOpen(false);
    };

    const handleDeleteSensor = async (sensorId: string, deleteFromSource: boolean) => {
        try {
            await api.delete(`/projects/${id}/sensors/${sensorId}`, {
                params: deleteFromSource ? { delete_from_source: true } : undefined
            });
            await fetchSensors();
            setSelectedSensor(null);
        } catch (e) {
            console.error("Delete failed", e);
            alert(t("projects.dataSources.deleteError"));
        }
    };

    // Data Upload State
    const [uploadSensor, setUploadSensor] = useState<any | null>(null);

    const handleUploadData = async (file: File, parameter: string) => {
        if (!uploadSensor) return;
        const thingId = uploadSensor.id;

        const formData = new FormData();
        formData.append("file", file);

        await api.post(`/projects/${id}/things/${thingId}/import`, formData, {
            params: { parameter },
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white">{t("projects.dataSources.title")}</h1>
                    <p className="text-white/60 flex items-center gap-2">
                        {t("projects.dataSources.desc")}
                        <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-white/50">
                            {t("projects.dataSources.autoRefresh")}
                        </span>
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => fetchSensors()}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-lg transition-colors border border-white/10"
                    >
                        ↻ {t("projects.dataSources.refresh")}
                    </button>
                    {perms?.can_link_sensors && (
                        <button
                            onClick={() => setIsLinkModalOpen(true)}
                            className="px-4 py-2 bg-hydro-primary text-black font-semibold rounded-lg hover:bg-hydro-accent transition-colors"
                        >
                            + {t("projects.dataSources.linkDatasource")}
                        </button>
                    )}
                </div>
            </div>

            {loading && sensors.length === 0 ? (
                <div className="text-white/50 animate-pulse">{t("projects.dataSources.loading")}</div>
            ) : (
                <SensorList
                    sensors={sensors}
                    onSelectSensor={setSelectedSensor}
                    onUpload={setUploadSensor}
                    onDelete={handleDeleteSensor}
                />
            )}

            {/* Detail Modal */}
            {selectedSensor && (
                <SensorDetailModal
                    sensor={selectedSensor}
                    isOpen={!!selectedSensor}
                    onClose={() => setSelectedSensor(null)}
                    onDelete={handleDeleteSensor}
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
            />
        </div>
    );
}
