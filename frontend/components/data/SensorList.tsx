
"use client";


import { useEffect, useState, useRef } from "react";
import { format } from "date-fns";
import { Eye, Edit, Trash2 } from "lucide-react";

interface Sensor {
    id: string | number;
    name: string;
    description: string;
    status: string;
    updated_at: string;
    last_activity?: string;
    properties?: any;
    station_type?: string;
}

interface SensorListProps {
    sensors: Sensor[];
    onSelectSensor: (sensor: Sensor) => void;
    onUpload?: (sensor: Sensor) => void;
    onEdit?: (sensor: Sensor) => void;
    onDelete?: (sensorId: string, deleteFromSource: boolean) => void;
    onLoadMore?: () => void;
    hasMore?: boolean;
    isLoadingMore?: boolean;
}

export default function SensorList({
    sensors,
    onSelectSensor,
    onUpload,
    onEdit,
    onDelete,
    onLoadMore,
    hasMore,
    isLoadingMore
}: SensorListProps) {
    const observerTarget = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !isLoadingMore && onLoadMore) {
                    onLoadMore();
                }
            },
            { threshold: 0.5 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => {
            if (observerTarget.current) {
                observer.unobserve(observerTarget.current);
            }
        };
    }, [hasMore, isLoadingMore, onLoadMore]);

    return (
        <div className="space-y-4">
            {sensors.length === 0 ? (
                <div className="text-white/50 text-center py-10 bg-white/5 rounded-xl border border-white/10">
                    No data sources found.
                </div>
            ) : (
                <div className="max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-white/5 custom-scrollbar">
                    <table className="w-full text-left text-sm text-white/70">
                        <thead className="bg-white/10 text-white uppercase font-semibold">
                            <tr>
                                <th className="px-6 py-4">Name</th>
                                <th className="px-6 py-4">ID</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Last Update</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {sensors.map((sensor) => {
                                const isDataset = sensor.station_type === 'dataset' ||
                                    sensor.properties?.station_type === 'dataset' ||
                                    sensor.properties?.type === 'static_dataset';

                                return (
                                    <tr
                                        key={sensor.id}
                                        className="hover:bg-white/5 transition-colors cursor-pointer group"
                                        onClick={() => onSelectSensor(sensor)}
                                    >
                                        <td className="px-6 py-4 font-medium text-white">
                                            {sensor.name}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs text-white/50">
                                            {sensor.id || "-"}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${sensor.status === "active"
                                                    ? "bg-green-400/10 text-green-400"
                                                    : "bg-gray-400/10 text-gray-400"
                                                    }`}
                                            >
                                                {sensor.status || "Unknown"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {(sensor.last_activity || sensor.updated_at)
                                                ? format(new Date(sensor.last_activity || sensor.updated_at), "MMM d, HH:mm")
                                                : "-"}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {onUpload && isDataset && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onUpload(sensor);
                                                        }}
                                                        className="text-hydro-primary hover:text-white px-2 py-1 bg-hydro-primary/10 rounded text-xs transition-colors"
                                                        title="Upload Data"
                                                    >
                                                        Upload
                                                    </button>
                                                )}

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectSensor(sensor);
                                                    }}
                                                    className="text-white/50 hover:text-white transition-colors"
                                                    title="View Details"
                                                >
                                                    <Eye size={16} />
                                                </button>

                                                {onEdit && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onEdit(sensor);
                                                        }}
                                                        className="text-white/50 hover:text-white transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Edit size={16} />
                                                    </button>
                                                )}

                                                {onDelete && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (confirm("Unlink this sensor? Details will remain in database.")) {
                                                                onDelete(sensor.id as string, false); // False = Unlink only (safer default)
                                                            }
                                                        }}
                                                        className="text-white/50 hover:text-red-400 transition-colors"
                                                        title="Unlink"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>

                </div>
            )}
        </div>
    );
}
