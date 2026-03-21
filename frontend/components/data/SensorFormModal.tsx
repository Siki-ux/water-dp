"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

import LocationPickerMap from "./LocationPickerMap";
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface SensorFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<void>;
    initialData?: any;
    mode: "create" | "edit";
    defaultType?: string;
    projectId?: string; // Added for Parser fetching
}

const CustomSelect = ({ label, value, options, onChange, direction = "down" }: any) => {
    const [isOpen, setIsOpen] = useState(false);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = () => setIsOpen(false);
        if (isOpen) window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, [isOpen]);

    const selectedOption = options.find((o: any) => o.value === value);

    return (
        <div className="space-y-2 relative" onClick={e => e.stopPropagation()}>
            <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">{label}</label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full bg-card border border-border rounded px-3 py-2 text-[var(--foreground)] text-left focus:outline-none focus:border-hydro-primary flex justify-between items-center"
                >
                    <span>{selectedOption?.label || value || "Select..."}</span>
                    <span className="opacity-50 text-[var(--foreground)] text-xs">▼</span>
                </button>

                {isOpen && (
                    <div className={`absolute left-0 right-0 bg-card border border-border rounded shadow-xl max-h-48 overflow-y-auto z-50 ${direction === "up" ? "bottom-full mb-1" : "top-full mt-1"
                        }`}>
                        {options.map((opt: any) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors ${value === opt.value ? "text-hydro-primary bg-background" : "text-[var(--foreground)]"
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default function SensorFormModal({
    isOpen,
    onClose,
    onSubmit,
    initialData,
    mode,
    defaultType,
    projectId
}: SensorFormModalProps) {
    useEscapeKey(onClose, isOpen);

    const { data: session } = useSession();
    const [formData, setFormData] = useState({
        id: "",
        name: "",
        description: "",
        latitude: "",
        longitude: "",
        elevation: "",
        status: "active",
        organization: "",
        station_type: "river",
        parser_id: null as number | null
    });
    // Parser configuration for datasets
    const [parserConfig, setParserConfig] = useState({
        delimiter: ",",
        exclude_headlines: 0,  // Extra lines to skip BEFORE header (usually 0)
        timestamp_column: 0,
        timestamp_format: "%Y-%m-%dT%H:%M:%S.%fZ",  // ISO 8601 default
        filename_pattern: "*.csv"
    });
    // Check both formData and initialData for dataset detection (initialData may have it in properties)
    const isDataset = formData.station_type === 'dataset' ||
        initialData?.station_type === 'dataset' ||
        initialData?.properties?.station_type === 'dataset' ||
        defaultType === 'dataset';
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [parsers, setParsers] = useState<any[]>([]);

    useEffect(() => {
        if (initialData && mode === "edit") {
            setFormData({
                id: initialData.id || "",
                name: initialData.name || "",
                description: initialData.description || "",
                latitude: initialData.latitude || "",
                longitude: initialData.longitude || "",
                elevation: initialData.elevation || "",
                status: initialData.status || "active",
                organization: initialData.properties?.organization || initialData.organization || "",
                station_type: initialData.properties?.station_type || initialData.station_type || "river",
                parser_id: null // Edit mode usually doesn't change parser easily yet
            });
        } else {
            // Reset for create
            setFormData({
                id: "",
                name: "",
                description: "",
                latitude: "",
                longitude: "",
                elevation: "",
                status: "active",
                organization: "",
                station_type: defaultType || "river",
                parser_id: null
            });
        }
        setError("");
    }, [initialData, mode, isOpen, defaultType]);

    // Fetch Parsers
    useEffect(() => {
        if (isOpen && mode === "create" && projectId && session?.accessToken) {
            const fetchParsers = async () => {
                try {
                    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

                    // 1. Get Project Group ID (Needed for list_parsers filtering)
                    // We assume projectId passed is the UUID or ID.
                    // The backend `list_parsers` creates a filter.
                    // Ideally we should just get all parsers for the project group.
                    // We can reuse the same logic as ParsersPage: First get project to get group_id.

                    const projectRes = await fetch(`${apiUrl}/projects/${projectId}`, {
                        headers: { Authorization: `Bearer ${session.accessToken}` }
                    });
                    if (!projectRes.ok) return;
                    const project = await projectRes.json();
                    const groupId = project.authorization_provider_group_id;

                    const res = await fetch(`${apiUrl}/parsers?group_id=${groupId}`, {
                        headers: { Authorization: `Bearer ${session.accessToken}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setParsers(data);
                    }
                } catch (e) {
                    console.error("Failed to fetch parsers", e);
                }
            };
            fetchParsers();
        }
    }, [isOpen, mode, projectId, session?.accessToken]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            // Build payload based on type
            const payload: any = {
                ...formData,
                properties: {
                    organization: formData.organization
                },
                parser_id: formData.parser_id ? Number(formData.parser_id) : null
            };

            // Add location only for non-datasets
            if (!isDataset) {
                payload.latitude = formData.latitude ? parseFloat(formData.latitude) : null;
                payload.longitude = formData.longitude ? parseFloat(formData.longitude) : null;
                payload.elevation = formData.elevation ? parseFloat(formData.elevation) : null;
            }

            // Add parser config for datasets
            if (isDataset) {
                payload.parser_config = {
                    delimiter: parserConfig.delimiter,
                    exclude_headlines: parserConfig.exclude_headlines,
                    timestamp_columns: [{
                        column: parserConfig.timestamp_column,
                        format: parserConfig.timestamp_format
                    }]
                };
                payload.filename_pattern = parserConfig.filename_pattern;
            }

            await onSubmit(payload);
            onClose();
        } catch (err: any) {
            console.error(err);
            setError(err.message || "Failed to save");
        } finally {
            setLoading(false);
        }
    };

    const statusOptions = [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
        { value: "maintenance", label: "Maintenance" }
    ];

    const typeOptions = [
        { value: "river", label: "River" },
        { value: "lake", label: "Lake" },
        { value: "groundwater", label: "Groundwater" },
        { value: "reservoir", label: "Reservoir" },
        { value: "well", label: "Well" },
        { value: "spring", label: "Spring" },
        { value: "dataset", label: "Dataset (Virtual)" },
        { value: "other", label: "Other" }
    ];

    const parserOptions = [
        { value: null, label: "None (No Ingestion)" },
        ...parsers.map(p => ({ value: p.id, label: p.name }))
    ];

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
            onClick={onClose}
        >
            <div
                className="bg-card border border-border rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <h2 className="text-xl font-bold text-[var(--foreground)]">
                        {mode === "create"
                            ? (formData.station_type === 'dataset' ? "New Dataset" : "Add New Sensor")
                            : (formData.station_type === 'dataset' ? "Edit Dataset" : "Edit Sensor")
                        }
                    </h2>
                    <button onClick={onClose} className="opacity-50 text-[var(--foreground)] hover:opacity-100">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-sm">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">
                                {formData.station_type === 'dataset' ? "Dataset ID (Unique)" : "Station ID (Unique)"}
                            </label>
                            <input
                                type="text"
                                required
                                value={formData.id}
                                onChange={e => setFormData({ ...formData, id: e.target.value })}
                                className="w-full bg-background border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary"
                                placeholder={formData.station_type === 'dataset' ? "DATASET_001" : "STATION_001"}
                                disabled={mode === "edit"}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Name</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full bg-background border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary"
                                placeholder={formData.station_type === 'dataset' ? "Imported Water Data" : "Main River Sensor"}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Description</label>
                        <textarea
                            value={formData.description}
                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                            className="w-full bg-background border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary h-20"
                            placeholder="Details about this data source..."
                        />
                    </div>

                    {/* Location fields - hidden for datasets */}
                    {!isDataset && (
                        <>
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Latitude</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={formData.latitude}
                                        onChange={e => setFormData({ ...formData, latitude: e.target.value })}
                                        className="w-full bg-background border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Longitude</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={formData.longitude}
                                        onChange={e => setFormData({ ...formData, longitude: e.target.value })}
                                        className="w-full bg-background border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Elevation (m)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        value={formData.elevation}
                                        onChange={e => setFormData({ ...formData, elevation: e.target.value })}
                                        className="w-full bg-background border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Location Picker (Click or Drag)</label>
                                <div className="w-full h-64 border border-border rounded overflow-hidden">
                                    <LocationPickerMap
                                        latitude={parseFloat(formData.latitude) || 0}
                                        longitude={parseFloat(formData.longitude) || 0}
                                        onLocationChange={(lat, lon) => {
                                            setFormData(prev => ({
                                                ...prev,
                                                latitude: lat.toFixed(6),
                                                longitude: lon.toFixed(6)
                                            }));
                                        }}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* Parser configuration - shown only for datasets */}
                    {isDataset && mode === "create" && (
                        <div className="space-y-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                            <h3 className="text-sm font-semibold text-blue-400">CSV Parser Configuration</h3>
                            <p className="text-xs opacity-50 text-[var(--foreground)]">Configure how CSV files will be parsed. Datastreams will be created automatically after the first file upload.</p>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Delimiter</label>
                                    <select
                                        value={parserConfig.delimiter}
                                        onChange={e => setParserConfig({ ...parserConfig, delimiter: e.target.value })}
                                        className="w-full bg-card border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary"
                                    >
                                        <option value=",">Comma (,)</option>
                                        <option value=";">Semicolon (;)</option>
                                        <option value="\t">Tab</option>
                                        <option value=" ">Space</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Skip Lines (before header)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={parserConfig.exclude_headlines}
                                        onChange={e => setParserConfig({ ...parserConfig, exclude_headlines: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-background border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Timestamp Column (0-based)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={parserConfig.timestamp_column}
                                        onChange={e => setParserConfig({ ...parserConfig, timestamp_column: parseInt(e.target.value) || 0 })}
                                        className="w-full bg-background border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Timestamp Format</label>
                                    <select
                                        value={parserConfig.timestamp_format}
                                        onChange={e => setParserConfig({ ...parserConfig, timestamp_format: e.target.value })}
                                        className="w-full bg-card border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary"
                                    >
                                        <option value="%Y-%m-%d %H:%M:%S">2024-01-15 14:30:00</option>
                                        <option value="%Y-%m-%dT%H:%M:%S">2024-01-15T14:30:00</option>
                                        <option value="%Y-%m-%dT%H:%M:%S.%fZ">2024-01-15T14:30:00.000Z</option>
                                        <option value="%d/%m/%Y %H:%M">15/01/2024 14:30</option>
                                        <option value="%d.%m.%Y %H:%M:%S">15.01.2024 14:30:00</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Filename Pattern</label>
                                <input
                                    type="text"
                                    value={parserConfig.filename_pattern}
                                    onChange={e => setParserConfig({ ...parserConfig, filename_pattern: e.target.value })}
                                    className="w-full bg-background border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary"
                                    placeholder="*.csv"
                                />
                                <p className="text-xs opacity-40 text-[var(--foreground)]">Glob pattern to match uploaded files (e.g., *.csv, data_*.txt)</p>
                            </div>
                        </div>
                    )}

                    {/* Status and Type - hide for datasets since they're always active/dataset */}
                    {isDataset ? (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Status</label>
                                <div className="bg-background border border-border rounded px-3 py-2 text-[var(--foreground)] opacity-60">
                                    Inactive (Always)
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs uppercase opacity-50 text-[var(--foreground)]">Type</label>
                                <div className="bg-background border border-border rounded px-3 py-2 text-[var(--foreground)] opacity-60">
                                    Dataset (Virtual)
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <CustomSelect
                                label="Status"
                                value={formData.status}
                                options={statusOptions}
                                onChange={(val: string) => setFormData({ ...formData, status: val })}
                                direction="up"
                            />
                            <CustomSelect
                                label="Type"
                                value={formData.station_type}
                                options={typeOptions}
                                onChange={(val: string) => setFormData({ ...formData, station_type: val })}
                                direction="up"
                            />
                        </div>
                    )}

                    {/* Link Parser - only for sensors (not datasets which use inline parser config) */}
                    {mode === "create" && !isDataset && (
                        <div className="border-t border-border pt-4">
                            <CustomSelect
                                label="Link Parser (Ingestion)"
                                value={formData.parser_id}
                                options={parserOptions}
                                onChange={(val: any) => setFormData({ ...formData, parser_id: val })}
                                direction="up"
                            />
                            <p className="text-xs opacity-40 text-[var(--foreground)] mt-1">Select a parser to enable automatic file ingestion (Can be done later).</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 opacity-70 text-[var(--foreground)] hover:opacity-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2 bg-hydro-primary text-black font-semibold rounded hover:bg-hydro-accent transition-colors disabled:opacity-50"
                        >
                            {loading ? "Saving..." : (
                                mode === "create"
                                    ? (formData.station_type === 'dataset' ? "Create Dataset" : "Create Sensor")
                                    : "Save Changes"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
