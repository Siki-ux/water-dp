"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Save, X, Plus } from "lucide-react";

interface Group {
    id: string;
    name: string;
    path?: string;
}

interface DeviceType {
    name: string;
    properties: any;
}

interface IngestType {
    id: number;
    name: string;
}

interface Parser {
    id: number;
    name: string;
    type?: string;
}

export function SensorCreateDialog() {
    const router = useRouter();
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);

    // Form States
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Data Sources
    const [groups, setGroups] = useState<Group[]>([]);
    const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
    const [ingestTypes, setIngestTypes] = useState<IngestType[]>([]);
    const [parsers, setParsers] = useState<Parser[]>([]);

    // Form Data
    const [formData, setFormData] = useState<{
        name: string; description: string; group_id: string;
        device_type: string; ingest_type: string; latitude: string;
        longitude: string; auto_mqtt: boolean; mqtt_username: string;
        mqtt_password: string; mqtt_topic: string; parser_id: string;
    }>({
        name: "",
        description: "",
        group_id: "",
        device_type: "chirpstack_generic",
        ingest_type: "mqtt",
        latitude: "",
        longitude: "",

        // MQTT
        auto_mqtt: true,
        mqtt_username: "",
        mqtt_password: "",
        mqtt_topic: "",
        parser_id: ""
    });

    // Fetch dependencies when modal opens
    useEffect(() => {
        if (isOpen && session?.accessToken) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

            // Fetch Keycloak Groups (replaces projects)
            fetch(`${apiUrl}/groups/my-authorization-groups`, {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            })
                .then(res => res.json())
                .then(data => setGroups(Array.isArray(data) ? data : []))
                .catch(err => console.error("Failed to fetch groups", err));

            // Fetch Device Types
            fetch(`${apiUrl}/sms/attributes/device-types?page=1&page_size=100`, {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            })
                .then(res => res.json())
                .then(data => {
                    if (data.items) {
                        setDeviceTypes(data.items);
                    }
                })
                .catch(err => console.error("Failed to fetch device types", err));

            // Fetch Ingest Types
            fetch(`${apiUrl}/sms/attributes/ingest-types`, {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            })
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setIngestTypes(data);
                    }
                })
                .catch(err => console.error("Failed to fetch ingest types", err));

            // Fetch Parsers
            fetch(`${apiUrl}/sms/attributes/parsers?page=1&page_size=200`, {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            })
                .then(res => res.json())
                .then(data => {
                    if (data.items) {
                        setParsers(data.items);
                    }
                })
                .catch(err => console.error("Failed to fetch parsers", err));
        }
    }, [isOpen, session]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;

        if (type === 'checkbox') {
            const checked = (e.target as HTMLInputElement).checked;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!formData.group_id) {
            setError("Please select an Owner Group");
            setLoading(false);
            return;
        }

        if (formData.ingest_type === 'sftp' && !formData.parser_id) {
            setError("Parser is required when using SFTP ingestion type");
            setLoading(false);
            return;
        }

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

            // Payload — group_id based (Keycloak-centric)
            const payload: any = {
                sensor_name: formData.name,
                description: formData.description,
                group_id: formData.group_id,
                device_type: formData.device_type,
                ingest_type: formData.ingest_type,
                latitude: formData.latitude ? parseFloat(formData.latitude) : null,
                longitude: formData.longitude ? parseFloat(formData.longitude) : null,
                properties: [],
                parser_id: formData.parser_id ? parseInt(formData.parser_id) : undefined
            };

            // Add MQTT fields if not auto-generated
            if (!formData.auto_mqtt) {
                if (formData.mqtt_username) payload.mqtt_username = formData.mqtt_username;
                if (formData.mqtt_password) payload.mqtt_password = formData.mqtt_password;
                if (formData.mqtt_topic) payload.mqtt_topic = formData.mqtt_topic;
            }

            const res = await fetch(`${apiUrl}/things/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.accessToken}`,
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to create sensor");
            }

            // Success
            setIsOpen(false);
            resetForm();
            router.refresh();

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            name: "",
            description: "",
            group_id: "",
            device_type: "chirpstack_generic",
            ingest_type: "mqtt",
            latitude: "",
            longitude: "",
            auto_mqtt: true,
            mqtt_username: "",
            mqtt_password: "",
            mqtt_topic: "",
            parser_id: ""
        });
        setError(null);
    };

    /** Strip "UFZ-TSM:" prefix for display */
    const displayGroupName = (name: string) =>
        name.startsWith("UFZ-TSM:") ? name.slice(8) : name;

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
                <Plus className="w-4 h-4" />
                Create Sensor
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#0A0A0A] border border-white/10 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">

                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/10 sticky top-0 bg-[#0A0A0A] z-10">
                            <div>
                                <h2 className="text-xl font-bold text-white">Add New Sensor</h2>
                                <p className="text-white/40 text-sm">Register a new sensor device in the system.</p>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-white/40 hover:text-white transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Content */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-6">

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Basic Info */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-1">
                                        Owner Group <span className="text-red-400">*</span>
                                    </label>
                                    <select
                                        name="group_id"
                                        value={formData.group_id}
                                        onChange={handleChange}
                                        required
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                                        style={{ colorScheme: 'dark' }}
                                    >
                                        <option value="" className="bg-[#0A0A0A]">Select a Group...</option>
                                        {groups.map(g => (
                                            <option key={g.id} value={g.id} className="bg-[#0A0A0A]">
                                                {displayGroupName(g.name)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-1">
                                        Sensor Name <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        required
                                        placeholder="e.g. River_Station_01"
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-white/20"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-1">Description</label>
                                    <textarea
                                        name="description"
                                        value={formData.description}
                                        onChange={handleChange}
                                        rows={2}
                                        placeholder="Optional description..."
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-white/20"
                                    />
                                </div>
                            </div>

                            <hr className="border-white/10" />

                            <div className="space-y-4">
                                <h3 className="text-white font-medium">Configuration</h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-white/80 mb-1">
                                            Ingest Type <span className="text-red-400">*</span>
                                        </label>
                                        <select
                                            name="ingest_type"
                                            value={formData.ingest_type}
                                            onChange={handleChange}
                                            required
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                                            style={{ colorScheme: 'dark' }}
                                        >
                                            {ingestTypes.map(it => (
                                                <option key={it.id} value={it.name} className="bg-[#0A0A0A]">{it.name.toUpperCase()}</option>
                                            ))}
                                            {ingestTypes.length === 0 && <option value="mqtt" className="bg-[#0A0A0A]">MQTT</option>}
                                        </select>
                                    </div>

                                    {formData.ingest_type === "mqtt" && (
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-white/80 mb-1">
                                                Device Type <span className="text-red-400">*</span>
                                            </label>
                                            <select
                                                name="device_type"
                                                value={formData.device_type}
                                                onChange={handleChange}
                                                required
                                                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                                                style={{ colorScheme: 'dark' }}
                                            >
                                                <option value="chirpstack_generic" className="bg-[#0A0A0A]">Generic (Chirpstack)</option>
                                                {deviceTypes.map(dt => (
                                                    dt.name !== "chirpstack_generic" && (
                                                        <option key={dt.name} value={dt.name} className="bg-[#0A0A0A]">{dt.name}</option>
                                                    )
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-1">Latitude</label>
                                        <input
                                            type="number"
                                            step="any"
                                            name="latitude"
                                            value={formData.latitude}
                                            onChange={handleChange}
                                            placeholder="e.g. 50.123"
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-white/20"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-1">Longitude</label>
                                        <input
                                            type="number"
                                            step="any"
                                            name="longitude"
                                            value={formData.longitude}
                                            onChange={handleChange}
                                            placeholder="e.g. 14.456"
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-white/20"
                                        />
                                    </div>
                                </div>
                            </div>

                            <hr className="border-white/10" />

                            {/* MQTT Credentials - Only if MQTT */}
                            {formData.ingest_type === "mqtt" && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-white font-medium">MQTT Credentials</h3>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="auto_mqtt"
                                                checked={formData.auto_mqtt}
                                                onChange={handleChange}
                                                className="w-4 h-4 rounded border-gra-600 text-blue-600 focus:ring-blue-500 bg-gray-700"
                                            />
                                            <span className="text-sm text-white/60">Auto-generate</span>
                                        </label>
                                    </div>

                                    {!formData.auto_mqtt && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div>
                                                <label className="block text-sm font-medium text-white/80 mb-1">Username</label>
                                                <input
                                                    type="text"
                                                    name="mqtt_username"
                                                    value={formData.mqtt_username}
                                                    onChange={handleChange}
                                                    placeholder="Custom username"
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-white/20"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-white/80 mb-1">Password</label>
                                                <input
                                                    type="text" // Show as text for easier copying/verification during creation? Or password? User asked for verification.
                                                    name="mqtt_password"
                                                    value={formData.mqtt_password}
                                                    onChange={handleChange}
                                                    placeholder="Custom password"
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-white/20"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-sm font-medium text-white/80 mb-1">Topic</label>
                                                <input
                                                    type="text"
                                                    name="mqtt_topic"
                                                    value={formData.mqtt_topic}
                                                    onChange={handleChange}
                                                    placeholder="Optional custom topic"
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-white/20"
                                                />
                                                <p className="text-xs text-white/40 mt-1">Leave empty to auto-generate based on username.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Parser - Required for SFTP */}
                            {formData.ingest_type === 'sftp' && (
                                <div className="space-y-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-white/80 mb-1">
                                            Parser <span className="text-red-400">*</span>
                                        </label>
                                        <select
                                            name="parser_id"
                                            value={formData.parser_id}
                                            onChange={handleChange}
                                            required
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                                            style={{ colorScheme: 'dark' }}
                                        >
                                            <option value="" className="bg-[#0A0A0A]">Select a Parser...</option>
                                            {parsers.map(p => (
                                                <option key={p.id} value={p.id} className="bg-[#0A0A0A]">{p.name}</option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-white/40 mt-1">Required for SFTP file ingestion.</p>
                                    </div>
                                </div>
                            )}

                            {/* Footer Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-white/10 sticky bottom-0 bg-[#0A0A0A] -mx-6 px-6 pb-2">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Create Sensor
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
