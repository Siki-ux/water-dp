"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Save, X, Edit, Globe, Server, MapPin } from "lucide-react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import dynamic from "next/dynamic";

const LocationPickerMap = dynamic(() => import("@/components/data/LocationPickerMap"), { ssr: false });

interface SensorEditDialogProps {
    sensor: any;
}

const inputClass = "w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20";
const selectClass = "w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none cursor-pointer";
const labelClass = "block text-sm font-medium text-[var(--foreground)]/80 mb-1";

export function SensorEditDialog({ sensor }: SensorEditDialogProps) {
    const router = useRouter();
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);

    useEscapeKey(() => setIsOpen(false), isOpen);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'general' | 'mqtt' | 'external'>('general');

    const [formData, setFormData] = useState({
        name: "",
        description: "",
        ingest_type_id: "",
        latitude: "",
        longitude: "",
        mqtt_username: "",
        mqtt_password: "",
        mqtt_topic: "",
        mqtt_device_type_id: "",
        file_parser_id: "",
        // External API
        ext_api_type: "",
        ext_api_sync_interval: "60",
        ext_api_enabled: true,
        ext_api_settings: "",
        // External SFTP
        ext_sftp_uri: "",
        ext_sftp_path: "",
        ext_sftp_username: "",
        ext_sftp_password: "",
        ext_sftp_public_key: "",
        ext_sftp_private_key: "",
        ext_sftp_sync_interval: "60",
        ext_sftp_enabled: true,
    });

    const [ingestTypes, setIngestTypes] = useState<any[]>([]);
    const [deviceTypes, setDeviceTypes] = useState<any[]>([]);
    const [parsers, setParsers] = useState<any[]>([]);
    const [apiTypes, setApiTypes] = useState<any[]>([]);
    const [fetchingDevices, setFetchingDevices] = useState(false);
    const [fetchingParsers, setFetchingParsers] = useState(false);
    const [changePassword, setChangePassword] = useState(false);

    // Derive current ingest type name from selected ID
    const currentIngestType = ingestTypes.find(
        it => it.id?.toString() === formData.ingest_type_id
    )?.name || sensor.ingest_type || 'mqtt';

    const showExternalTab = currentIngestType === 'extapi' || currentIngestType === 'extsftp';

    useEffect(() => {
        if (isOpen && sensor) {
            setFormData({
                name: sensor.name || "",
                description: sensor.description || "",
                ingest_type_id: sensor.ingest_type_id?.toString() || "",
                latitude: sensor.latitude?.toString() || "",
                longitude: sensor.longitude?.toString() || "",
                mqtt_username: sensor.mqtt_username || "",
                mqtt_password: "",
                mqtt_topic: sensor.mqtt_topic || "",
                mqtt_device_type_id: sensor.device_type_id?.toString() || sensor.device_type?.id?.toString() || "",
                file_parser_id: sensor.parser_id?.toString() || sensor.parser?.id?.toString() || "",
                ext_api_type: sensor.external_api?.type_name || "",
                ext_api_sync_interval: sensor.external_api?.sync_interval?.toString() || "60",
                ext_api_enabled: sensor.external_api?.sync_enabled ?? true,
                ext_api_settings: sensor.external_api?.settings ? JSON.stringify(sensor.external_api.settings, null, 2) : "",
                ext_sftp_uri: sensor.external_sftp?.uri || "",
                ext_sftp_path: sensor.external_sftp?.path || "",
                ext_sftp_username: sensor.external_sftp?.username || "",
                ext_sftp_password: "",
                ext_sftp_public_key: "",
                ext_sftp_private_key: "",
                ext_sftp_sync_interval: sensor.external_sftp?.sync_interval?.toString() || "60",
                ext_sftp_enabled: sensor.external_sftp?.sync_enabled ?? true,
            });
            setActiveTab('general');
            setChangePassword(false);
            setError(null);
            fetchIngestTypes();
            fetchDeviceTypes();
            fetchParsers();
            fetchApiTypes();
        }
    }, [isOpen, sensor]);

    // Reset tab if external source no longer applies
    useEffect(() => {
        if (!showExternalTab && activeTab === 'external') {
            setActiveTab('general');
        }
    }, [showExternalTab, activeTab]);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    const authHeaders = { Authorization: `Bearer ${session?.accessToken}` };

    const fetchIngestTypes = async () => {
        try {
            const res = await fetch(`${apiUrl}/sms/attributes/ingest-types`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) setIngestTypes(data);
            }
        } catch (err) {
            console.error("Failed to fetch ingest types:", err);
        }
    };

    const fetchParsers = async () => {
        setFetchingParsers(true);
        try {
            const res = await fetch(`${apiUrl}/sms/attributes/parsers?page_size=500`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setParsers(data.items || []);
            }
        } catch (err) {
            console.error("Failed to fetch parsers:", err);
        } finally {
            setFetchingParsers(false);
        }
    };

    const fetchDeviceTypes = async () => {
        setFetchingDevices(true);
        try {
            const res = await fetch(`${apiUrl}/sms/attributes/device-types?page_size=500`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setDeviceTypes(data.items || []);
            }
        } catch (err) {
            console.error("Failed to fetch device types:", err);
        } finally {
            setFetchingDevices(false);
        }
    };

    const fetchApiTypes = async () => {
        try {
            const res = await fetch(`${apiUrl}/external-sources/api-types`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setApiTypes(data.items || data || []);
            }
        } catch (err) {
            console.error("Failed to fetch API types:", err);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const payload: any = {
                name: formData.name,
                description: formData.description,
                mqtt_username: formData.mqtt_username,
                mqtt_topic: formData.mqtt_topic,
                mqtt_device_type_id: formData.mqtt_device_type_id ? parseInt(formData.mqtt_device_type_id) : null,
                file_parser_id: formData.file_parser_id ? parseInt(formData.file_parser_id) : null,
            };

            // Ingest type change
            if (formData.ingest_type_id) {
                payload.ingest_type_id = parseInt(formData.ingest_type_id);
            }

            // Location
            if (formData.latitude && formData.longitude) {
                payload.latitude = parseFloat(formData.latitude);
                payload.longitude = parseFloat(formData.longitude);
            }

            // Password
            if (changePassword && formData.mqtt_password) {
                payload.mqtt_password = formData.mqtt_password;
            }

            // External API config
            if (currentIngestType === 'extapi') {
                let settings = {};
                if (formData.ext_api_settings.trim()) {
                    try {
                        settings = JSON.parse(formData.ext_api_settings);
                    } catch {
                        throw new Error("Invalid JSON in External API settings");
                    }
                }
                payload.external_api = {
                    type: formData.ext_api_type,
                    sync_interval: parseInt(formData.ext_api_sync_interval) || 60,
                    enabled: formData.ext_api_enabled,
                    settings,
                };
            }

            // External SFTP config
            if (currentIngestType === 'extsftp') {
                payload.external_sftp = {
                    uri: formData.ext_sftp_uri,
                    path: formData.ext_sftp_path,
                    username: formData.ext_sftp_username,
                    sync_interval: parseInt(formData.ext_sftp_sync_interval) || 60,
                    sync_enabled: formData.ext_sftp_enabled,
                };
                if (formData.ext_sftp_password) {
                    payload.external_sftp.password = formData.ext_sftp_password;
                }
                if (formData.ext_sftp_private_key) {
                    payload.external_sftp.private_key = formData.ext_sftp_private_key;
                }
                if (formData.ext_sftp_public_key) {
                    payload.external_sftp.public_key = formData.ext_sftp_public_key;
                }
            }

            const res = await fetch(`${apiUrl}/sms/sensors/${sensor.uuid}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to update sensor");
            }

            setIsOpen(false);
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const TabButton = ({ id, label }: { id: typeof activeTab; label: string }) => (
        <button
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-[var(--foreground)]/40 hover:text-[var(--foreground)]/70'
            }`}
        >
            {label}
        </button>
    );

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="px-4 py-2 bg-background hover:bg-muted border border-border rounded-lg text-[var(--foreground)] text-sm font-medium transition-colors flex items-center gap-2"
            >
                <Edit className="w-4 h-4" />
                Edit Sensor
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">

                        {/* Header */}
                        <div className="flex items-center justify-between p-6 pb-0 sticky top-0 bg-card z-10">
                            <div>
                                <h2 className="text-xl font-bold text-[var(--foreground)]">Edit Sensor</h2>
                                <p className="text-[var(--foreground)]/40 text-sm">{sensor.uuid}</p>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-[var(--foreground)]/40 hover:text-[var(--foreground)] transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Tab Bar */}
                        <div className="flex border-b border-border px-6 sticky top-[72px] bg-card z-10">
                            <TabButton id="general" label="General" />
                            <TabButton id="mqtt" label="MQTT & Parsing" />
                            {showExternalTab && (
                                <TabButton id="external" label={
                                    currentIngestType === 'extapi' ? 'External API' : 'External SFTP'
                                } />
                            )}
                        </div>

                        {/* Content */}
                        <form onSubmit={handleSubmit} className="p-6 space-y-6">

                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* ==================== TAB: General ==================== */}
                            {activeTab === 'general' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className={labelClass}>
                                            Sensor Name <span className="text-red-400">*</span>
                                        </label>
                                        <input type="text" name="name" value={formData.name}
                                            onChange={handleChange} required className={inputClass} />
                                    </div>

                                    <div>
                                        <label className={labelClass}>Description</label>
                                        <textarea name="description" value={formData.description}
                                            onChange={handleChange} rows={2} className={inputClass} />
                                    </div>

                                    <div>
                                        <label className={labelClass}>Ingestion Type</label>
                                        <select
                                            value={formData.ingest_type_id}
                                            onChange={(e) => setFormData(prev => ({ ...prev, ingest_type_id: e.target.value }))}
                                            className={selectClass}
                                        >
                                            <option value="" className="bg-card">Select Ingest Type</option>
                                            {ingestTypes.map((it: any) => (
                                                <option key={it.id} value={it.id} className="bg-card">
                                                    {it.name?.toUpperCase()}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-[var(--foreground)]/40 mt-1">
                                            Primary data source. MQTT and file upload are always available regardless of this setting.
                                        </p>
                                    </div>

                                    <div>
                                        <label className={`${labelClass} flex items-center gap-2`}>
                                            <MapPin className="w-4 h-4 text-blue-400" />
                                            Location
                                        </label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <input type="number" step="any" name="latitude"
                                                    value={formData.latitude} onChange={handleChange}
                                                    placeholder="Latitude (e.g. 52.52)" className={inputClass} />
                                            </div>
                                            <div>
                                                <input type="number" step="any" name="longitude"
                                                    value={formData.longitude} onChange={handleChange}
                                                    placeholder="Longitude (e.g. 13.41)" className={inputClass} />
                                            </div>
                                        </div>
                                    </div>

                                    {formData.latitude && formData.longitude &&
                                     !isNaN(parseFloat(formData.latitude)) && !isNaN(parseFloat(formData.longitude)) && (
                                        <div className="h-48 rounded-lg overflow-hidden border border-border">
                                            <LocationPickerMap
                                                latitude={parseFloat(formData.latitude)}
                                                longitude={parseFloat(formData.longitude)}
                                                onLocationChange={(lat: number, lon: number) => setFormData(prev => ({
                                                    ...prev, latitude: lat.toString(), longitude: lon.toString()
                                                }))}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ==================== TAB: MQTT & Parsing ==================== */}
                            {activeTab === 'mqtt' && (
                                <div className="space-y-6">
                                    {/* MQTT */}
                                    <div className="space-y-4">
                                        <h3 className="text-[var(--foreground)] font-medium">MQTT Configuration</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className={labelClass}>Username</label>
                                                <input type="text" name="mqtt_username"
                                                    value={formData.mqtt_username} onChange={handleChange}
                                                    className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Topic</label>
                                                <input type="text" name="mqtt_topic"
                                                    value={formData.mqtt_topic} onChange={handleChange}
                                                    className={inputClass} />
                                            </div>

                                            <div className="col-span-2 space-y-2">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="checkbox" checked={changePassword}
                                                        onChange={(e) => setChangePassword(e.target.checked)}
                                                        className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-700" />
                                                    <span className="text-sm font-medium text-[var(--foreground)]/80">Change Password</span>
                                                </label>
                                                {changePassword && (
                                                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <label className={labelClass}>New Password</label>
                                                        <input type="text" name="mqtt_password"
                                                            value={formData.mqtt_password} onChange={handleChange}
                                                            placeholder="Enter new password" className={inputClass} />
                                                        <p className="text-xs text-[var(--foreground)]/40 mt-1">
                                                            Updating this will require re-configuring your physical device.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <hr className="border-border" />

                                    {/* Device Type & File Parser */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-[var(--foreground)] font-medium">Device Type & Parsing</h3>
                                            {(fetchingDevices || fetchingParsers) && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                                        </div>

                                        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                            Changing device type or parser affects how new incoming data is interpreted. Existing data remains unchanged.
                                        </p>

                                        <div>
                                            <label className={labelClass}>Device Type (MQTT)</label>
                                            <select value={formData.mqtt_device_type_id}
                                                onChange={(e) => setFormData(prev => ({ ...prev, mqtt_device_type_id: e.target.value }))}
                                                className={selectClass}
                                            >
                                                <option value="" className="bg-card">Select a Device Type</option>
                                                {deviceTypes.map((dt) => (
                                                    <option key={dt.id} value={dt.id} className="bg-card">
                                                        {dt.name} {dt.parser_name ? `(${dt.parser_name})` : ""}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-[var(--foreground)]/40 mt-1">
                                                Determines how MQTT payloads are translated into observations.
                                            </p>
                                        </div>

                                        <div>
                                            <label className={labelClass}>File Parser (CSV/S3)</label>
                                            <select value={formData.file_parser_id}
                                                onChange={(e) => setFormData(prev => ({ ...prev, file_parser_id: e.target.value }))}
                                                className={selectClass}
                                            >
                                                <option value="" className="bg-card">Select a File Parser</option>
                                                {parsers.map((p) => (
                                                    <option key={p.id} value={p.id} className="bg-card">
                                                        {p.name} {p.type_name ? `(${p.type_name})` : ""}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-[var(--foreground)]/40 mt-1">
                                                Used for file upload and external SFTP ingestion.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ==================== TAB: External Source ==================== */}
                            {activeTab === 'external' && showExternalTab && (
                                <div className="space-y-4">
                                    {/* External API */}
                                    {currentIngestType === 'extapi' && (
                                        <>
                                            <h3 className="text-[var(--foreground)] font-medium flex items-center gap-2">
                                                <Globe className="w-4 h-4 text-purple-400" />
                                                External API Configuration
                                            </h3>

                                            <div>
                                                <label className={labelClass}>
                                                    API Type <span className="text-red-400">*</span>
                                                </label>
                                                <select value={formData.ext_api_type}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, ext_api_type: e.target.value }))}
                                                    className={selectClass.replace('blue', 'purple')}
                                                >
                                                    <option value="" className="bg-card">Select API Type</option>
                                                    {apiTypes.map((at: any) => (
                                                        <option key={at.id} value={at.name} className="bg-card">
                                                            {at.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className={labelClass}>Sync Interval (minutes)</label>
                                                    <input type="number" min="1" value={formData.ext_api_sync_interval}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_api_sync_interval: e.target.value }))}
                                                        className={inputClass} />
                                                </div>
                                                <div className="flex items-center gap-3 pt-6">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="checkbox" checked={formData.ext_api_enabled}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, ext_api_enabled: e.target.checked }))}
                                                            className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500 bg-gray-700" />
                                                        <span className="text-sm font-medium text-[var(--foreground)]/80">Sync Enabled</span>
                                                    </label>
                                                </div>
                                            </div>

                                            <div>
                                                <label className={labelClass}>Settings (JSON)</label>
                                                <textarea value={formData.ext_api_settings}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, ext_api_settings: e.target.value }))}
                                                    rows={4} placeholder='{"latitude": 52.52, "longitude": 13.41}'
                                                    className={`${inputClass} font-mono text-sm`} />
                                                <p className="text-xs text-[var(--foreground)]/40 mt-1">
                                                    Custom settings passed to the API syncer script.
                                                </p>
                                            </div>
                                        </>
                                    )}

                                    {/* External SFTP */}
                                    {currentIngestType === 'extsftp' && (
                                        <>
                                            <h3 className="text-[var(--foreground)] font-medium flex items-center gap-2">
                                                <Server className="w-4 h-4 text-orange-400" />
                                                External SFTP Configuration
                                            </h3>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className={labelClass}>
                                                        SFTP URI <span className="text-red-400">*</span>
                                                    </label>
                                                    <input type="text" value={formData.ext_sftp_uri}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_uri: e.target.value }))}
                                                        placeholder="sftp://host:22" className={inputClass} />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Remote Path</label>
                                                    <input type="text" value={formData.ext_sftp_path}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_path: e.target.value }))}
                                                        placeholder="/data/sensors/" className={inputClass} />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className={labelClass}>Username</label>
                                                    <input type="text" value={formData.ext_sftp_username}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_username: e.target.value }))}
                                                        placeholder="sftp_user" className={inputClass} />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Password</label>
                                                    <input type="password" value={formData.ext_sftp_password}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_password: e.target.value }))}
                                                        placeholder="Leave empty to keep current" className={inputClass} />
                                                </div>
                                            </div>

                                            <div>
                                                <label className={labelClass}>SSH Public Key</label>
                                                <textarea value={formData.ext_sftp_public_key}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_public_key: e.target.value }))}
                                                    rows={2} placeholder="Leave empty to keep current"
                                                    className={`${inputClass} font-mono text-xs`} />
                                            </div>

                                            <div>
                                                <label className={labelClass}>SSH Private Key</label>
                                                <textarea value={formData.ext_sftp_private_key}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_private_key: e.target.value }))}
                                                    rows={2} placeholder="Leave empty to keep current"
                                                    className={`${inputClass} font-mono text-xs`} />
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className={labelClass}>Sync Interval (minutes)</label>
                                                    <input type="number" min="1" value={formData.ext_sftp_sync_interval}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_sync_interval: e.target.value }))}
                                                        className={inputClass} />
                                                </div>
                                                <div className="flex items-center gap-3 pt-6">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="checkbox" checked={formData.ext_sftp_enabled}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_enabled: e.target.checked }))}
                                                            className="w-4 h-4 rounded border-gray-600 text-orange-600 focus:ring-orange-500 bg-gray-700" />
                                                        <span className="text-sm font-medium text-[var(--foreground)]/80">Sync Enabled</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Footer Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-border sticky bottom-0 bg-card -mx-6 px-6 pb-2">
                                <button type="button" onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 rounded-lg text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-background transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading}
                                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-[var(--foreground)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Save Changes
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
