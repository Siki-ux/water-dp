"use client";

import { useState, useEffect } from "react";
import { Search, Link as LinkIcon, Info } from "lucide-react";
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface SensorLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLink: (sensorId: string) => Promise<void>;
    projectId: string;
    token: string;
}

export default function SensorLinkModal({
    isOpen,
    onClose,
    onLink,
    projectId,
    token
}: SensorLinkModalProps) {
    useEscapeKey(onClose, isOpen);

    const [availableSensors, setAvailableSensors] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [linkingId, setLinkingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [error, setError] = useState("");

    const fetchAvailable = async () => {
        if (!isOpen) return;
        setLoading(true);
        setError("");
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
            const res = await fetch(`${apiUrl}/projects/${projectId}/available-sensors`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch available sensors");
            const data = await res.json();
            console.log("Available sensors data:", data);
            setAvailableSensors(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAvailable();
    }, [isOpen]);

    const handleLink = async (sensorId: string) => {
        setLinkingId(sensorId);
        try {
            await onLink(sensorId);
            // Refresh list after linking
            fetchAvailable();
        } catch (err: any) {
            setError(err.message || "Failed to link sensor");
        } finally {
            setLinkingId(null);
        }
    };

    if (!isOpen) return null;

    const filteredSensors = availableSensors.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(s.sensor_uuid).toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-md p-4" onClick={onClose}>
            <div className="bg-card border border-border rounded-2xl w-full max-w-3xl h-[80vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-6 border-b border-border flex justify-between items-center bg-muted/30">
                    <div>
                        <h2 className="text-xl font-bold text-[var(--foreground)]">Link Existing Sensors</h2>
                        <p className="text-sm opacity-50 text-[var(--foreground)]">Select a sensor from TimeIO to link to this project</p>
                    </div>
                    <button onClick={onClose} className="opacity-50 text-[var(--foreground)] hover:opacity-100 p-2">✕</button>
                </div>

                {/* Search & Feedback */}
                <div className="p-4 border-b border-border space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30 text-[var(--foreground)] w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search by name or ID..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-muted/50 border border-border rounded-lg pl-10 pr-4 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary transition-colors"
                        />
                    </div>
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs flex items-center gap-2">
                            <Info className="w-4 h-4" /> {error}
                        </div>
                    )}
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center space-y-4 text-white/20">
                            <div className="w-8 h-8 border-2 border-hydro-primary border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-medium">Scanning TimeIO...</span>
                        </div>
                    ) : filteredSensors.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-white/20 space-y-2">
                            <Search className="w-12 h-12 mb-2" />
                            <p className="font-medium text-lg">No available sensors found</p>
                            <p className="text-sm">Either everything is linked or search yielded no results.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {filteredSensors.map((s) => (
                                <div
                                    key={s.sensor_uuid}
                                    className="p-4 bg-muted/30 border border-border rounded-xl hover:bg-muted/50 transition-all group flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.station_type === 'dataset' ? 'bg-blue-500/20 text-blue-400' : 'bg-hydro-primary/20 text-hydro-primary'
                                            }`}>
                                            <Database className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-[var(--foreground)] font-semibold group-hover:text-hydro-primary transition-colors">{s.name}</h3>
                                            <div className="flex items-center gap-3 text-xs opacity-40 text-[var(--foreground)] mt-0.5">
                                                <span className="font-mono">ID: {s.sensor_uuid}</span>
                                                <span>•</span>
                                                <span className="capitalize">{s.station_type}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleLink(String(s.sensor_uuid))}
                                        disabled={linkingId === String(s.sensor_uuid)}
                                        className="px-4 py-2 bg-hydro-primary/10 hover:bg-hydro-primary text-hydro-primary hover:text-black rounded-lg text-sm font-semibold transition-all flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {linkingId === String(s.sensor_uuid) ? (
                                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <LinkIcon className="w-4 h-4" />
                                        )}
                                        Link
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-muted/30 border-t border-border text-[10px] opacity-30 text-[var(--foreground)] flex justify-between items-center">
                    <span>Showing {filteredSensors.length} of {availableSensors.length} total things in FROST</span>
                    <div className="flex gap-4">
                        <span>Shift+Click for multi-select (Not yet)</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Sub-components/Icons for better visuals
function Database({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
            <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
            <path d="M3 12A9 3 0 0 0 21 12"></path>
        </svg>
    )
}
