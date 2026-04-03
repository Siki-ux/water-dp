"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Save, Loader2 } from "lucide-react";
import { getApiUrl } from "@/lib/utils";
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface DatastreamEditDialogProps {
    isOpen: boolean;
    onClose: () => void;
    datastream: any;
    sensorUuid: string;
    token: string;
    onUpdate: () => void;
}

export default function DatastreamEditDialog({
    isOpen,
    onClose,
    datastream,
    sensorUuid,
    token,
    onUpdate
}: DatastreamEditDialogProps) {
    useEscapeKey(onClose, isOpen);

    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        unitName: "",
        unitSymbol: "",
        unitDefinition: "",
        description: ""
    });

    useEffect(() => {
        setMounted(true);
        if (datastream) {
            setFormData({
                name: datastream.name || "",
                unitName: datastream.unit_of_measurement?.label || datastream.unit_of_measurement?.name || "",
                unitSymbol: datastream.unit_of_measurement?.symbol || "",
                unitDefinition: datastream.unit_of_measurement?.definition || "",
                description: datastream.description || ""
            });
        }
    }, [datastream]);

    if (!isOpen || !datastream || !mounted) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload = {
                name: formData.name,
                description: formData.description,
                unit_of_measurement: {
                    label: formData.unitName,
                    symbol: formData.unitSymbol,
                    definition: formData.unitDefinition
                }
            };

            const dsId = datastream.datastream_id || datastream.id;

            if (!dsId) {
                alert("Error: Datastream ID missing");
                setLoading(false);
                return;
            }

            const res = await fetch(`${getApiUrl()}/things/${sensorUuid}/datastreams/id/${dsId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                alert(`Error: ${err.detail || "Failed to update"}`);
                return;
            }

            onUpdate();
            onClose();
        } catch (e) {
            console.error(e);
            alert("Failed to update datastream");
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
            <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">Edit Datastream</h3>
                    <button onClick={onClose} className="text-[var(--foreground)]/60 hover:text-[var(--foreground)] transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--foreground)]/70 mb-1">Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[var(--foreground)]/70 mb-1">Description</label>
                        <textarea
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            rows={2}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--foreground)]/70 mb-1">Unit Label (Name)</label>
                            <input
                                type="text"
                                value={formData.unitName}
                                onChange={e => setFormData({ ...formData, unitName: e.target.value })}
                                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--foreground)]/70 mb-1">Unit Symbol</label>
                            <input
                                type="text"
                                value={formData.unitSymbol}
                                onChange={e => setFormData({ ...formData, unitSymbol: e.target.value })}
                                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-[var(--foreground)]/70 mb-1">Unit Definition (URI)</label>
                        <input
                            type="text"
                            value={formData.unitDefinition}
                            onChange={e => setFormData({ ...formData, unitDefinition: e.target.value })}
                            className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            placeholder="http://..."
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 hover:bg-muted/50 text-[var(--foreground)]/70 hover:text-[var(--foreground)] rounded-lg text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-[var(--foreground)] rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
