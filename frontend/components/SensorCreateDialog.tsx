"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Save, X, Plus, MapPin } from "lucide-react";
import LocationPickerMap from "./data/LocationPickerMap";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useTranslation } from "@/lib/i18n";

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

interface ApiType {
    id: number;
    name: string;
    properties: any;
}

export function SensorCreateDialog() {
    const router = useRouter();
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);
    const { t } = useTranslation();

    useEscapeKey(() => setIsOpen(false), isOpen);

    // Form States
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Data Sources
    const [groups, setGroups] = useState<Group[]>([]);
    const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);
    const [ingestTypes, setIngestTypes] = useState<IngestType[]>([]);
    const [parsers, setParsers] = useState<Parser[]>([]);
    const [apiTypes, setApiTypes] = useState<ApiType[]>([]);

    // Form Data
    const [formData, setFormData] = useState<{
        name: string; description: string; group_id: string;
        device_type: string; ingest_type: string; latitude: string;
        longitude: string; auto_mqtt: boolean; mqtt_username: string;
        mqtt_password: string; mqtt_topic: string; parser_id: string;
        // External API
        ext_api_type: string; ext_api_sync_interval: string;
        ext_api_enabled: boolean; ext_api_settings: string;
        // External SFTP
        ext_sftp_uri: string; ext_sftp_path: string; ext_sftp_username: string;
        ext_sftp_password: string; ext_sftp_public_key: string;
        ext_sftp_private_key: string; ext_sftp_sync_interval: string;
        ext_sftp_enabled: boolean;
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
        parser_id: "",

        // External API
        ext_api_type: "",
        ext_api_sync_interval: "60",
        ext_api_enabled: true,
        ext_api_settings: "{}",

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

            // Fetch External API Types
            fetch(`${apiUrl}/external-sources/api-types`, {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            })
                .then(res => res.json())
                .then(data => {
                    if (data.items) {
                        setApiTypes(data.items);
                    }
                })
                .catch(err => console.error("Failed to fetch API types", err));
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

        if ((formData.ingest_type === 'sftp' || formData.ingest_type === 'extsftp') && !formData.parser_id) {
            setError("Parser is required when using SFTP ingestion type");
            setLoading(false);
            return;
        }

        if (formData.ingest_type === 'extapi' && !formData.ext_api_type) {
            setError("API Type is required when using External API ingestion type");
            setLoading(false);
            return;
        }

        if (formData.ingest_type === 'extsftp' && !formData.ext_sftp_uri) {
            setError("SFTP URI is required when using External SFTP ingestion type");
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

            // Add External API config
            if (formData.ingest_type === 'extapi') {
                let settings = {};
                try { settings = JSON.parse(formData.ext_api_settings); } catch { /* keep empty */ }
                payload.external_api = {
                    type: formData.ext_api_type,
                    enabled: formData.ext_api_enabled,
                    sync_interval: parseInt(formData.ext_api_sync_interval) || 60,
                    settings,
                };
            }

            // Add External SFTP config
            if (formData.ingest_type === 'extsftp') {
                payload.external_sftp = {
                    uri: formData.ext_sftp_uri,
                    path: formData.ext_sftp_path,
                    username: formData.ext_sftp_username,
                    password: formData.ext_sftp_password || null,
                    public_key: formData.ext_sftp_public_key,
                    private_key: formData.ext_sftp_private_key,
                    sync_interval: parseInt(formData.ext_sftp_sync_interval) || 60,
                    sync_enabled: formData.ext_sftp_enabled,
                };
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
            parser_id: "",
            ext_api_type: "",
            ext_api_sync_interval: "60",
            ext_api_enabled: true,
            ext_api_settings: "{}",
            ext_sftp_uri: "",
            ext_sftp_path: "",
            ext_sftp_username: "",
            ext_sftp_password: "",
            ext_sftp_public_key: "",
            ext_sftp_private_key: "",
            ext_sftp_sync_interval: "60",
            ext_sftp_enabled: true,
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
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 rounded-lg text-sm font-medium transition-colors"
            >
                <Plus className="w-4 h-4" />
                {t('sms.sensors.createSensorBtn')}
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">

                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
                            <div>
                                <h2 className="text-xl font-bold text-[var(--foreground)]">{t('sms.sensors.addTitle')}</h2>
                                <p className="text-[var(--foreground)]/40 text-sm">{t('sms.sensors.addDesc')}</p>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-[var(--foreground)]/40 hover:text-[var(--foreground)] transition-colors"
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
                                    <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                        {t('sms.sensors.ownerGroup')} <span className="text-red-400">*</span>
                                    </label>
                                    <select
                                        name="group_id"
                                        value={formData.group_id}
                                        onChange={handleChange}
                                        required
                                        className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                                    >
                                        <option value="" className="bg-card">{t('sms.sensors.selectGroup')}</option>
                                        {groups.map(g => (
                                            <option key={g.id} value={g.id} className="bg-card">
                                                {displayGroupName(g.name)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                        {t('sms.sensors.sensorName')} <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        required
                                        placeholder={t('sms.sensors.placeholderName')}
                                        className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">{t('sms.sensors.description')}</label>
                                    <textarea
                                        name="description"
                                        value={formData.description}
                                        onChange={handleChange}
                                        rows={2}
                                        placeholder={t('sms.sensors.optionalDesc')}
                                        className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                    />
                                </div>
                            </div>

                            <hr className="border-border" />

                            <div className="space-y-4">
                                <h3 className="text-[var(--foreground)] font-medium">{t('sms.sensors.configuration')}</h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                            {t('sms.sensors.ingestType')} <span className="text-red-400">*</span>
                                        </label>
                                        <select
                                            name="ingest_type"
                                            value={formData.ingest_type}
                                            onChange={handleChange}
                                            required
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                                        >
                                            {ingestTypes.map(it => (
                                                <option key={it.id} value={it.name} className="bg-card">{it.name.toUpperCase()}</option>
                                            ))}
                                            {ingestTypes.length === 0 && <option value="mqtt" className="bg-card">MQTT</option>}
                                        </select>
                                    </div>

                                    {formData.ingest_type === "mqtt" && (
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                                {t('sms.sensors.deviceType')} <span className="text-red-400">*</span>
                                            </label>
                                            <select
                                                name="device_type"
                                                value={formData.device_type}
                                                onChange={handleChange}
                                                required
                                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                                            >
                                                <option value="chirpstack_generic" className="bg-card">{t('sms.sensors.genericChirpstack')}</option>
                                                {deviceTypes.map(dt => (
                                                    dt.name !== "chirpstack_generic" && (
                                                        <option key={dt.name} value={dt.name} className="bg-card">{dt.name}</option>
                                                    )
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">{t('sms.sensors.latitude')}</label>
                                        <input
                                            type="number"
                                            step="any"
                                            name="latitude"
                                            value={formData.latitude}
                                            onChange={handleChange}
                                            placeholder={t('sms.sensors.placeholderLat')}
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">{t('sms.sensors.longitude')}</label>
                                        <input
                                            type="number"
                                            step="any"
                                            name="longitude"
                                            value={formData.longitude}
                                            onChange={handleChange}
                                            placeholder={t('sms.sensors.placeholderLon')}
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                        />
                                    </div>

                                    {/* Map Location Picker */}
                                    <div className="col-span-2">
                                        <label className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]/80 mb-2">
                                            <MapPin className="w-4 h-4 text-blue-400" />
                                            {t('sms.sensors.pickLocation')}
                                            <span className="text-[var(--foreground)]/30 text-xs font-normal">{t('sms.sensors.clickDragDesc')}</span>
                                        </label>
                                        <div className="w-full h-64 border border-border rounded-lg overflow-hidden">
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
                                </div>
                            </div>

                            <hr className="border-border" />

                            {/* MQTT Credentials - Only if MQTT */}
                            {formData.ingest_type === "mqtt" && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[var(--foreground)] font-medium">{t('sms.sensors.mqttCredentials')}</h3>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="auto_mqtt"
                                                checked={formData.auto_mqtt}
                                                onChange={handleChange}
                                                className="w-4 h-4 rounded border-border text-blue-600 focus:ring-blue-500 bg-background"
                                            />
                                            <span className="text-sm text-[var(--foreground)]/60">{t('sms.sensors.autoGenerate')}</span>
                                        </label>
                                    </div>

                                    {!formData.auto_mqtt && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <div>
                                                <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">{t('sms.sensors.username')}</label>
                                                <input
                                                    type="text"
                                                    name="mqtt_username"
                                                    value={formData.mqtt_username}
                                                    onChange={handleChange}
                                                    placeholder={t('sms.sensors.username')}
                                                    className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">{t('sms.sensors.password')}</label>
                                                <input
                                                    type="text"
                                                    name="mqtt_password"
                                                    value={formData.mqtt_password}
                                                    onChange={handleChange}
                                                    placeholder={t('sms.sensors.password')}
                                                    className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">{t('sms.sensors.topic')}</label>
                                                <input
                                                    type="text"
                                                    name="mqtt_topic"
                                                    value={formData.mqtt_topic}
                                                    onChange={handleChange}
                                                    placeholder={t('sms.sensors.optionalTopic')}
                                                    className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                                />
                                                <p className="text-xs text-[var(--foreground)]/40 mt-1">{t('sms.sensors.topicAutoDesc')}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Parser - Required for SFTP and External SFTP */}
                            {(formData.ingest_type === 'sftp' || formData.ingest_type === 'extsftp') && (
                                <div className="space-y-4">
                                    <div className="col-span-2">
                                        <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                            {t('sms.sensors.parser')} <span className="text-red-400">*</span>
                                        </label>
                                        <select
                                            name="parser_id"
                                            value={formData.parser_id}
                                            onChange={handleChange}
                                            required
                                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                                        >
                                            <option value="" className="bg-card">{t('sms.sensors.selectParser')}</option>
                                            {parsers.map(p => (
                                                <option key={p.id} value={p.id} className="bg-card">{p.name}</option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-[var(--foreground)]/40 mt-1">{t('sms.sensors.sftpDesc')}</p>
                                    </div>
                                </div>
                            )}

                            {/* External API Configuration */}
                            {formData.ingest_type === 'extapi' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <h3 className="text-[var(--foreground)] font-medium">{t('sms.sensors.extApiConfig')}</h3>
                                    <p className="text-xs text-[var(--foreground)]/40 -mt-2">{t('sms.sensors.extApiDesc')}</p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                                {t('sms.sensors.extApiType')} <span className="text-red-400">*</span>
                                            </label>
                                            <select
                                                name="ext_api_type"
                                                value={formData.ext_api_type}
                                                onChange={handleChange}
                                                required
                                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                                            >
                                                <option value="" className="bg-card">{t('sms.sensors.selectApiType')}</option>
                                                {apiTypes.map(at => (
                                                    <option key={at.id} value={at.name} className="bg-card">{at.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                                {t('sms.sensors.extApiSyncInterval')}
                                            </label>
                                            <input
                                                type="number"
                                                name="ext_api_sync_interval"
                                                value={formData.ext_api_sync_interval}
                                                onChange={handleChange}
                                                min="1"
                                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                            />
                                        </div>

                                        <div className="flex items-end pb-1">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    name="ext_api_enabled"
                                                    checked={formData.ext_api_enabled}
                                                    onChange={handleChange}
                                                    className="w-4 h-4 rounded border-border text-blue-600 focus:ring-blue-500 bg-background"
                                                />
                                                <span className="text-sm text-[var(--foreground)]/80">{t('sms.sensors.extApiEnabled')}</span>
                                            </label>
                                        </div>

                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                                {t('sms.sensors.extApiSettings')}
                                            </label>
                                            <textarea
                                                name="ext_api_settings"
                                                value={formData.ext_api_settings}
                                                onChange={handleChange}
                                                rows={3}
                                                placeholder={t('sms.sensors.extApiSettingsPlaceholder')}
                                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* External SFTP Configuration */}
                            {formData.ingest_type === 'extsftp' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                    <h3 className="text-[var(--foreground)] font-medium">{t('sms.sensors.extSftpConfig')}</h3>
                                    <p className="text-xs text-[var(--foreground)]/40 -mt-2">{t('sms.sensors.extSftpDesc')}</p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                                {t('sms.sensors.extSftpUri')} <span className="text-red-400">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                name="ext_sftp_uri"
                                                value={formData.ext_sftp_uri}
                                                onChange={handleChange}
                                                required
                                                placeholder={t('sms.sensors.extSftpUriPlaceholder')}
                                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                                {t('sms.sensors.extSftpPath')}
                                            </label>
                                            <input
                                                type="text"
                                                name="ext_sftp_path"
                                                value={formData.ext_sftp_path}
                                                onChange={handleChange}
                                                placeholder={t('sms.sensors.extSftpPathPlaceholder')}
                                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                                {t('sms.sensors.extSftpUsername')}
                                            </label>
                                            <input
                                                type="text"
                                                name="ext_sftp_username"
                                                value={formData.ext_sftp_username}
                                                onChange={handleChange}
                                                placeholder={t('sms.sensors.extSftpUsername')}
                                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                                {t('sms.sensors.extSftpPassword')}
                                            </label>
                                            <input
                                                type="password"
                                                name="ext_sftp_password"
                                                value={formData.ext_sftp_password}
                                                onChange={handleChange}
                                                placeholder={t('sms.sensors.extSftpPassword')}
                                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                            />
                                        </div>

                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                                {t('sms.sensors.extSftpPublicKey')}
                                            </label>
                                            <textarea
                                                name="ext_sftp_public_key"
                                                value={formData.ext_sftp_public_key}
                                                onChange={handleChange}
                                                rows={2}
                                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                            />
                                        </div>

                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                                {t('sms.sensors.extSftpPrivateKey')}
                                            </label>
                                            <textarea
                                                name="ext_sftp_private_key"
                                                value={formData.ext_sftp_private_key}
                                                onChange={handleChange}
                                                rows={2}
                                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-[var(--foreground)]/20"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                                                {t('sms.sensors.extSftpSyncInterval')}
                                            </label>
                                            <input
                                                type="number"
                                                name="ext_sftp_sync_interval"
                                                value={formData.ext_sftp_sync_interval}
                                                onChange={handleChange}
                                                min="1"
                                                className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                            />
                                        </div>

                                        <div className="flex items-end pb-1">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    name="ext_sftp_enabled"
                                                    checked={formData.ext_sftp_enabled}
                                                    onChange={handleChange}
                                                    className="w-4 h-4 rounded border-border text-blue-600 focus:ring-blue-500 bg-background"
                                                />
                                                <span className="text-sm text-[var(--foreground)]/80">{t('sms.sensors.extSftpEnabled')}</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Footer Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-border sticky bottom-0 bg-card -mx-6 px-6 pb-2">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 rounded-lg text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-background transition-colors"
                                >
                                    {t('sms.sensors.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {t('sms.sensors.createSensor')}
                                </button>
                            </div>

                        </form>
                    </div >
                </div >
            )
            }
        </>
    );
}
