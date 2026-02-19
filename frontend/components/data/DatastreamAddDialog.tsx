"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Save, Loader2 } from "lucide-react";
import { getApiUrl } from "@/lib/utils";

interface DatastreamAddDialogProps {
    isOpen: boolean;
    onClose: () => void;
    sensorUuid: string;
    token: string;
    onUpdate: () => void;
}

export default function DatastreamAddDialog({
    isOpen,
    onClose,
    sensorUuid,
    token,
    onUpdate
}: DatastreamAddDialogProps) {
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
    }, []);

    // Reset form when dialog opens
    useEffect(() => {
        if (isOpen) {
            setFormData({
                name: "",
                unitName: "",
                unitSymbol: "",
                unitDefinition: "",
                description: ""
            });
        }
    }, [isOpen]);

    if (!isOpen || !mounted) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            alert("Datastream name is required");
            return;
        }

        setLoading(true);

        try {
            const payload = {
                name: formData.name.trim(),
                description: formData.description || undefined,
                unit_of_measurement: {
                    label: formData.unitName || formData.name,
                    symbol: formData.unitSymbol || "?",
                    definition: formData.unitDefinition || "http://unknown"
                }
            };

            const res = await fetch(`${getApiUrl()}/things/${sensorUuid}/datastreams`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                alert(`Error: ${err.detail || "Failed to create datastream"}`);
                return;
            }

            onUpdate();
            onClose();
        } catch (e) {
            console.error(e);
            alert("Failed to create datastream");
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0a0a0a] border border-white/10 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-[#0a0a0a] z-10">
                    <h3 className="text-lg font-semibold text-white">Add Datastream</h3>
                    <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Name *</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="e.g. temperature, humidity"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Description</label>
                        <textarea
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            rows={2}
                            placeholder="Optional description"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-1">Unit Label</label>
                            <input
                                type="text"
                                value={formData.unitName}
                                onChange={e => setFormData({ ...formData, unitName: e.target.value })}
                                placeholder="e.g. Celsius"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-1">Unit Symbol</label>
                            <input
                                type="text"
                                value={formData.unitSymbol}
                                onChange={e => setFormData({ ...formData, unitSymbol: e.target.value })}
                                placeholder="e.g. °C"
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Unit Definition (URI)</label>
                        <input
                            type="text"
                            value={formData.unitDefinition}
                            onChange={e => setFormData({ ...formData, unitDefinition: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            placeholder="http://..."
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 hover:bg-white/5 text-white/70 hover:text-white rounded-lg text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !formData.name.trim()}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Create Datastream
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
