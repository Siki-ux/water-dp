"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TimeSeriesChart from "./TimeSeriesChart";
import { X, Trash2, Edit, ArrowUpRight, Loader2, Activity } from "lucide-react";
import { getApiUrl } from "@/lib/utils";

// Helper to fetch data
async function getDataPoints(sensorUuid: string, token: string, datastream: string) {
    const apiUrl = getApiUrl();
    // New Endpoint: /things/{uuid}/datastream/{ds_name}/observations
    // Use limit=100 for "Recent Data" chart
    const url = `${apiUrl}/things/${sensorUuid}/datastream/${encodeURIComponent(datastream)}/observations?limit=100`;

    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) return [];
        const observations = await res.json();

        // Map Observations -> Chart Data
        // API: [{ "phenomenon_time", "result", ... }, ...]
        // Chart: [{ timestamp, value }]
        return observations.map((obs: any) => ({
            timestamp: obs.phenomenon_time || obs.phenomenonTime,
            value: obs.result,
            unit: '', // Unit is handled at series level
            datastream: datastream
        })).reverse();
    } catch (e) {
        console.error("Failed to fetch data points", e);
        return [];
    }
}

import SensorMiniMap from "./SensorMiniMap";

// ... (getDataPoints implementation remains same) ...

interface SensorDetailModalProps {
    sensor: any;
    isOpen: boolean;
    onClose: () => void;
    token: string;
    onDelete: (sensorId: string, deleteFromSource: boolean) => void;
    onEdit: (sensor: any) => void;
}

export default function SensorDetailModal({
    sensor,
    isOpen,
    onClose,
    token,
    onDelete,
    onEdit,
}: SensorDetailModalProps) {
    const [seriesData, setSeriesData] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(false);
    const [deleteMode, setDeleteMode] = useState<"none" | "unlink" | "source">("none");
    const [fullSensor, setFullSensor] = useState<any>(null);
    const [selectedDatastream, setSelectedDatastream] = useState<string>("");

    const params = useParams();
    const projectId = params?.id;



    useEffect(() => {
        if (isOpen && sensor) {
            setLoading(true);
            const sensorUuid = sensor.uuid || sensor.id;

            // 1. Fetch Rich Details
            fetch(`${getApiUrl()}/things/${sensorUuid}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) {
                        setFullSensor(data);

                        // 2. Determine Datastreams
                        const datastreams = data.datastreams || [];
                        const dsNames = datastreams.map((ds: any) => ds.name);

                        // Select default datastream logic
                        let effectiveDs = selectedDatastream;
                        if (dsNames.length > 0) {
                            if (!selectedDatastream || !dsNames.includes(selectedDatastream)) {
                                effectiveDs = dsNames[0];
                                setSelectedDatastream(effectiveDs);
                            }
                        }

                        // 3. Fetch Data for Selected Datastream
                        if (effectiveDs) {
                            getDataPoints(sensorUuid, token, effectiveDs).then(points => {
                                setSeriesData({ [effectiveDs]: points });
                                setLoading(false);
                            });
                        } else {
                            setLoading(false);
                        }
                    } else {
                        setLoading(false);
                    }
                })
                .catch(() => setLoading(false));

            document.body.style.overflow = "hidden";
        }

        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen, sensor, token, selectedDatastream]);

    const handleDatastreamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedDatastream(e.target.value);
    };



    const confirmDelete = () => {
        if (deleteMode === 'none') return;
        onDelete(String(sensor.uuid || sensor.id), deleteMode === 'source');
        onClose();
    };
    const cancelDelete = () => setDeleteMode("none");

    if (!isOpen || !sensor) return null;

    const displaySensor = fullSensor || sensor;
    const datastreams = displaySensor.datastreams || [];

    // --- Coordinate Extraction Logic ---
    let latitude = displaySensor.latitude;
    let longitude = displaySensor.longitude;

    if (latitude === undefined || longitude === undefined) {
        // Try location object
        if (displaySensor.location?.coordinates) {
            if (displaySensor.location.type === 'Point' && typeof displaySensor.location.coordinates === 'object') {
                // e.g. { latitude: 52, longitude: 54 }
                latitude = displaySensor.location.coordinates.latitude;
                longitude = displaySensor.location.coordinates.longitude;
            } else if (Array.isArray(displaySensor.location.coordinates)) {
                // GeoJSON Point [lon, lat]
                longitude = displaySensor.location.coordinates[0];
                latitude = displaySensor.location.coordinates[1];
            }
        }

        // Try properites.location (GeoJSON)
        if ((latitude === undefined || longitude === undefined) && displaySensor.properties?.location?.coordinates) {
            const coords = displaySensor.properties.location.coordinates;
            if (Array.isArray(coords)) {
                longitude = coords[0];
                latitude = coords[1];
            }
        }
    }

    const hasCoordinates = typeof latitude === 'number' && typeof longitude === 'number' &&
        !isNaN(latitude) && !isNaN(longitude);

    // Detect if this is a dataset (not a physical sensor)
    const isDataset = displaySensor.station_type === 'dataset' ||
        displaySensor.properties?.station_type === 'dataset' ||
        displaySensor.properties?.type === 'static_dataset';


    // Chart Series format
    const chartSeries = Object.entries(seriesData).map(([name, data]) => {
        const dsInfo = datastreams.find((d: any) => d.name === name);
        return {
            name: name,
            label: dsInfo?.label || dsInfo?.name || name,
            color: "#3b82f6", // default blue
            unit: dsInfo?.unit || "",
            data: data
        };
    });

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-start sticky top-0 bg-[#0a0a0a] z-10">
                    <div>
                        <h2 className="text-2xl font-bold text-white">{displaySensor.name}</h2>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="bg-white/10 px-2 py-0.5 rounded text-xs text-white/70 font-mono">
                                {displaySensor.uuid || displaySensor.sensor_uuid}
                            </span>
                            {datastreams.length > 0 && (
                                <span className="flex items-center gap-1 text-xs text-hydro-primary bg-hydro-primary/10 px-2 py-0.5 rounded border border-hydro-primary/20">
                                    <Activity className="w-3 h-3" />
                                    {datastreams.length} Datastreams
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {deleteMode !== 'none' ? (
                            <>
                                <span className="text-sm self-center mr-2 font-semibold text-white">
                                    {deleteMode === 'source'
                                        ? <span className="text-red-500">DANGER: Permanently delete data?</span>
                                        : <span className="text-yellow-400">Unlink sensor from project?</span>
                                    }
                                </span>
                                <button
                                    onClick={confirmDelete}
                                    className={`px-3 py-1 text-white rounded text-sm transition-colors ${deleteMode === 'source' ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'
                                        }`}
                                >
                                    Confirm
                                </button>
                                <button onClick={cancelDelete} className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-sm transition-colors">Cancel</button>
                            </>
                        ) : (
                            <>
                                <Link
                                    href={`/projects/${projectId}/data/${displaySensor.uuid || displaySensor.sensor_uuid || displaySensor.id}`}
                                    className="flex items-center gap-1 px-3 py-1 bg-hydro-primary/10 hover:bg-hydro-primary/20 text-hydro-primary rounded text-sm transition-colors border border-hydro-primary/20"
                                >
                                    <ArrowUpRight className="w-3 h-3" />
                                    Full History
                                </Link>
                                <button onClick={() => onEdit(sensor)} className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-sm transition-colors text-white">
                                    <Edit className="w-3 h-3" /> Edit
                                </button>
                                <button
                                    onClick={() => setDeleteMode("unlink")}
                                    className="flex items-center gap-1 px-3 py-1 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 rounded text-sm transition-colors border border-yellow-500/20"
                                >
                                    <Trash2 className="w-3 h-3" /> Unlink
                                </button>
                                <button
                                    onClick={() => setDeleteMode("source")}
                                    className="flex items-center gap-1 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded text-sm transition-colors border border-red-500/20 font-bold"
                                >
                                    <Trash2 className="w-3 h-3" /> Delete
                                </button>
                            </>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 ml-2">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-6 flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Metadata & Map */}
                    <div className="space-y-6 lg:col-span-1">
                        <h3 className="text-sm font-semibold text-hydro-primary uppercase tracking-wider">Metadata</h3>

                        <div className="grid grid-cols-1 gap-4 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                    <div className="text-white/40 mb-1">Status</div>
                                    <div className="text-white capitalize">{displaySensor.status || "Active"}</div>
                                </div>
                                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                    <div className="text-white/40 mb-1">Device Type</div>
                                    <div className="text-white">{isDataset ? "Dataset" : (displaySensor.device_type || "Generic")}</div>
                                </div>
                            </div>

                            <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                <div className="text-white/40 mb-1">Description</div>
                                <div className="text-white">{displaySensor.description || "No description provided."}</div>
                            </div>

                            {/* Only show coordinates/map for physical sensors, not datasets */}
                            {!isDataset && (
                                <>
                                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                        <div className="text-white/40 mb-1">Coordinates</div>
                                        <div className="text-white font-mono flex items-center gap-2">
                                            {hasCoordinates
                                                ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
                                                : <span className="text-white/30 italic">Not set</span>
                                            }
                                        </div>
                                    </div>

                                    {/* Mini Map */}
                                    {hasCoordinates && (
                                        <div className="w-full h-48 rounded-xl overflow-hidden border border-white/10 relative">
                                            <SensorMiniMap latitude={latitude} longitude={longitude} />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Chart */}
                    <div className="space-y-4 lg:col-span-2 flex flex-col">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-hydro-primary uppercase tracking-wider">Recent Data</h3>
                            {datastreams.length > 0 && (
                                <select
                                    value={selectedDatastream}
                                    onChange={handleDatastreamChange}
                                    className="bg-white/10 border border-white/10 rounded text-sm text-white px-3 py-1.5 outline-none focus:border-hydro-primary"
                                >
                                    {datastreams.map((ds: any) => (
                                        <option key={ds.name} value={ds.name} className="bg-gray-900 text-white">
                                            {ds.label || ds.name} ({ds.unit})
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="bg-white/5 border border-white/5 rounded-xl p-4 flex-1 min-h-[400px]">
                            {loading ? (
                                <div className="h-full flex items-center justify-center">
                                    <Loader2 className="w-8 h-8 text-hydro-primary animate-spin" />
                                </div>
                            ) : chartSeries.length > 0 && chartSeries[0].data.length > 0 ? (
                                <TimeSeriesChart
                                    series={chartSeries}
                                    yMin="auto"
                                    yMax="auto"
                                />
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-white/30">
                                    <Activity className="w-8 h-8 mb-2 opacity-50" />
                                    <p>No recent data available</p>
                                    {datastreams.length === 0 && <p className="text-xs mt-1">No datastreams found</p>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
