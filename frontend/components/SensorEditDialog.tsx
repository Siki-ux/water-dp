"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Save, X, Edit, Globe, Server, MapPin, FlaskConical, Play, Trash2, Plus } from "lucide-react";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useTranslation } from "@/lib/i18n";
import dynamic from "next/dynamic";
import {
    getThingQAQC,
    createThingQAQC,
    deleteThingQAQC,
    triggerThingQAQC,
    addThingQAQCTest,
    deleteThingQAQCTest,
    QAQCConfig,
} from "@/lib/qaqc-api";
import { SAQC_FUNCTIONS, getSaQCFunction, CUSTOM_FUNCTION_SENTINEL } from "@/lib/saqc-functions";

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
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);

    useEscapeKey(() => setIsOpen(false), isOpen);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'general' | 'mqtt' | 'external' | 'qaqc'>('general');
    const [thingQAQC, setThingQAQC] = useState<QAQCConfig | null | undefined>(undefined);
    const [qaqcLoading, setQAQCLoading] = useState(false);
    const [qaqcError, setQAQCError] = useState<string | null>(null);
    const [qaqcName, setQAQCName] = useState("");
    const [qaqcWindow, setQAQCWindow] = useState("5d");
    const [addingTest, setAddingTest] = useState(false);
    const [newTestFunc, setNewTestFunc] = useState(SAQC_FUNCTIONS[0].name);
    const [newTestName, setNewTestName] = useState("");
    const [newTestArgs, setNewTestArgs] = useState("{}");
    const [triggerSuccess, setTriggerSuccess] = useState(false);

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

    // Load per-sensor QA/QC when the qaqc tab is opened
    useEffect(() => {
        if (activeTab === 'qaqc' && thingQAQC === undefined && session?.accessToken && sensor?.uuid) {
            setQAQCLoading(true);
            getThingQAQC(sensor.uuid, session.accessToken)
                .then((cfg) => setThingQAQC(cfg))
                .catch((e) => setQAQCError(e.message))
                .finally(() => setQAQCLoading(false));
        }
    }, [activeTab, sensor?.uuid, session?.accessToken, thingQAQC]);

    const handleAssignQAQC = async () => {
        if (!session?.accessToken || !sensor?.uuid) return;
        setQAQCLoading(true);
        setQAQCError(null);
        try {
            const cfg = await createThingQAQC(sensor.uuid, { name: qaqcName, context_window: qaqcWindow }, session.accessToken);
            setThingQAQC(cfg);
        } catch (e: any) {
            setQAQCError(e.message);
        } finally {
            setQAQCLoading(false);
        }
    };

    const handleUnassignQAQC = async () => {
        if (!session?.accessToken || !sensor?.uuid) return;
        if (!confirm("Remove the per-sensor QA/QC override?")) return;
        setQAQCLoading(true);
        setQAQCError(null);
        try {
            await deleteThingQAQC(sensor.uuid, session.accessToken);
            setThingQAQC(null);
        } catch (e: any) {
            setQAQCError(e.message);
        } finally {
            setQAQCLoading(false);
        }
    };

    const handleTriggerQAQC = async () => {
        if (!session?.accessToken || !sensor?.uuid) return;
        setTriggerSuccess(false);
        try {
            await triggerThingQAQC(sensor.uuid, session.accessToken);
            setTriggerSuccess(true);
        } catch (e: any) {
            setQAQCError(e.message);
        }
    };

    const handleAddTest = async () => {
        if (!session?.accessToken || !thingQAQC) return;
        setQAQCLoading(true);
        setQAQCError(null);
        try {
            let args: Record<string, unknown> | null = null;
            try { args = JSON.parse(newTestArgs); } catch { args = null; }
            await addThingQAQCTest(sensor.uuid, { function: newTestFunc, name: newTestName || null, args, position: null, streams: null }, session.accessToken);
            // Refresh
            const cfg = await getThingQAQC(sensor.uuid, session.accessToken);
            setThingQAQC(cfg);
            setAddingTest(false);
            setNewTestName("");
            setNewTestArgs("{}");
        } catch (e: any) {
            setQAQCError(e.message);
        } finally {
            setQAQCLoading(false);
        }
    };

    const handleDeleteTest = async (testId: number) => {
        if (!session?.accessToken) return;
        try {
            await deleteThingQAQCTest(sensor.uuid, testId, session.accessToken);
            const cfg = await getThingQAQC(sensor.uuid, session.accessToken);
            setThingQAQC(cfg);
        } catch (e: any) {
            setQAQCError(e.message);
        }
    };

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
                {t('sms.sensors.editSensor')}
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">

                        {/* Header */}
                        <div className="flex items-center justify-between p-6 pb-0 sticky top-0 bg-card z-10">
                            <div>
                                <h2 className="text-xl font-bold text-[var(--foreground)]">{t('sms.sensors.editSensor')}</h2>
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
                            <TabButton id="general" label={t("sms.sensors.tabs.general")} />
                            <TabButton id="mqtt" label={t("sms.sensors.tabs.mqttParsing")} />
                            {showExternalTab && (
                                <TabButton id="external" label={
                                    currentIngestType === 'extapi' ? t("sms.sensors.tabs.externalApi") : t("sms.sensors.tabs.externalSftp")
                                } />
                            )}
                            <TabButton id="qaqc" label="QA/QC" />
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
                                            {t("sms.sensors.sensorName")} <span className="text-red-400">*</span>
                                        </label>
                                        <input type="text" name="name" value={formData.name}
                                            onChange={handleChange} required className={inputClass} />
                                    </div>

                                    <div>
                                        <label className={labelClass}>{t("sms.sensors.description")}</label>
                                        <textarea name="description" value={formData.description}
                                            onChange={handleChange} rows={2} className={inputClass} />
                                    </div>

                                    <div>
                                        <label className={labelClass}>{t("sms.sensors.ingestionType")}</label>
                                        <select
                                            value={formData.ingest_type_id}
                                            onChange={(e) => setFormData(prev => ({ ...prev, ingest_type_id: e.target.value }))}
                                            className={selectClass}
                                        >
                                            <option value="" className="bg-card">{t("sms.sensors.selectIngestType")}</option>
                                            {ingestTypes.map((it: any) => (
                                                <option key={it.id} value={it.id} className="bg-card">
                                                    {it.name?.toUpperCase()}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-[var(--foreground)]/40 mt-1">
                                            {t('sms.sensors.hints.primaryDataSource')}
                                        </p>
                                    </div>

                                    <div>
                                        <label className={`${labelClass} flex items-center gap-2`}>
                                            <MapPin className="w-4 h-4 text-blue-400" />
                                            {t("sms.sensors.location")}
                                        </label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <input type="number" step="any" name="latitude"
                                                    value={formData.latitude} onChange={handleChange}
                                                    placeholder={t("sms.sensors.latPlaceholder", { defaultValue: "Latitude (e.g. 52.52)" })} className={inputClass} />
                                            </div>
                                            <div>
                                                <input type="number" step="any" name="longitude"
                                                    value={formData.longitude} onChange={handleChange}
                                                    placeholder={t("sms.sensors.lonPlaceholder", { defaultValue: "Longitude (e.g. 13.41)" })} className={inputClass} />
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
                                        <h3 className="text-[var(--foreground)] font-medium">{t("sms.sensors.mqttConfig")}</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className={labelClass}>{t("sms.sensors.username")}</label>
                                                <input type="text" name="mqtt_username"
                                                    value={formData.mqtt_username} onChange={handleChange}
                                                    className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>{t("sms.sensors.topic")}</label>
                                                <input type="text" name="mqtt_topic"
                                                    value={formData.mqtt_topic} onChange={handleChange}
                                                    className={inputClass} />
                                            </div>

                                            <div className="col-span-2 space-y-2">
                                                <label className="flex items-center gap-2 cursor-pointer">
                                                    <input type="checkbox" checked={changePassword}
                                                        onChange={(e) => setChangePassword(e.target.checked)}
                                                        className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-700" />
                                                    <span className="text-sm font-medium text-[var(--foreground)]/80">{t("sms.sensors.changePassword")}</span>
                                                </label>
                                                {changePassword && (
                                                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <label className={labelClass}>{t("sms.sensors.newPassword")}</label>
                                                        <input type="text" name="mqtt_password"
                                                            value={formData.mqtt_password} onChange={handleChange}
                                                            placeholder={t("sms.sensors.enterNewPassword")} className={inputClass} />
                                                        <p className="text-xs text-[var(--foreground)]/40 mt-1">
                                                            {t('sms.sensors.hints.updatePasswordWarning')}
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
                                            <h3 className="text-[var(--foreground)] font-medium">{t("sms.sensors.deviceTypeParsing")}</h3>
                                            {(fetchingDevices || fetchingParsers) && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                                        </div>

                                        <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                            {t('sms.sensors.hints.changeDeviceWarning')}
                                        </p>

                                        <div>
                                            <label className={labelClass}>{t("sms.sensors.deviceTypeMqtt")}</label>
                                            <select value={formData.mqtt_device_type_id}
                                                onChange={(e) => setFormData(prev => ({ ...prev, mqtt_device_type_id: e.target.value }))}
                                                className={selectClass}
                                            >
                                                <option value="" className="bg-card">{t("sms.sensors.selectDeviceType")}</option>
                                                {deviceTypes.map((dt) => (
                                                    <option key={dt.id} value={dt.id} className="bg-card">
                                                        {dt.name} {dt.parser_name ? `(${dt.parser_name})` : ""}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-[var(--foreground)]/40 mt-1">
                                                {t('sms.sensors.hints.mqttPayloadTranslation')}
                                            </p>
                                        </div>

                                        <div>
                                            <label className={labelClass}>{t("sms.sensors.fileParser")}</label>
                                            <select value={formData.file_parser_id}
                                                onChange={(e) => setFormData(prev => ({ ...prev, file_parser_id: e.target.value }))}
                                                className={selectClass}
                                            >
                                                <option value="" className="bg-card">{t("sms.sensors.selectFileParser")}</option>
                                                {parsers.map((p) => (
                                                    <option key={p.id} value={p.id} className="bg-card">
                                                        {p.name} {p.type_name ? `(${p.type_name})` : ""}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-[var(--foreground)]/40 mt-1">
                                                {t('sms.sensors.hints.fileUploadUsage')}
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
                                                {t("sms.sensors.tabs.externalApi")}
                                            </h3>

                                            <div>
                                                <label className={labelClass}>
                                                    {t("sms.sensors.apiType")} <span className="text-red-400">*</span>
                                                </label>
                                                <select value={formData.ext_api_type}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, ext_api_type: e.target.value }))}
                                                    className={selectClass.replace('blue', 'purple')}
                                                >
                                                    <option value="" className="bg-card">{t("sms.sensors.selectApiType")}</option>
                                                    {apiTypes.map((at: any) => (
                                                        <option key={at.id} value={at.name} className="bg-card">
                                                            {at.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className={labelClass}>{t("sms.sensors.extApiSyncInterval")}</label>
                                                    <input type="number" min="1" value={formData.ext_api_sync_interval}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_api_sync_interval: e.target.value }))}
                                                        className={inputClass} />
                                                </div>
                                                <div className="flex items-center gap-3 pt-6">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="checkbox" checked={formData.ext_api_enabled}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, ext_api_enabled: e.target.checked }))}
                                                            className="w-4 h-4 rounded border-gray-600 text-purple-600 focus:ring-purple-500 bg-gray-700" />
                                                        <span className="text-sm font-medium text-[var(--foreground)]/80">{t("sms.sensors.extApiEnabled")}</span>
                                                    </label>
                                                </div>
                                            </div>

                                            <div>
                                                <label className={labelClass}>{t("sms.sensors.settingsJson")}</label>
                                                <textarea value={formData.ext_api_settings}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, ext_api_settings: e.target.value }))}
                                                    rows={4} placeholder='{"latitude": 52.52, "longitude": 13.41}'
                                                    className={`${inputClass} font-mono text-sm`} />
                                                <p className="text-xs text-[var(--foreground)]/40 mt-1">
                                                    {t('sms.sensors.hints.customApiSettings')}
                                                </p>
                                            </div>
                                        </>
                                    )}

                                    {/* External SFTP */}
                                    {currentIngestType === 'extsftp' && (
                                        <>
                                            <h3 className="text-[var(--foreground)] font-medium flex items-center gap-2">
                                                <Server className="w-4 h-4 text-orange-400" />
                                                {t("sms.sensors.tabs.externalSftp")}
                                            </h3>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className={labelClass}>
                                                        {t("sms.sensors.sftpUri")} <span className="text-red-400">*</span>
                                                    </label>
                                                    <input type="text" value={formData.ext_sftp_uri}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_uri: e.target.value }))}
                                                        placeholder={t("sms.sensors.extSftpUriPlaceholder")} className={inputClass} />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>{t("sms.sensors.extSftpPath")}</label>
                                                    <input type="text" value={formData.ext_sftp_path}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_path: e.target.value }))}
                                                        placeholder={t("sms.sensors.extSftpPathPlaceholder", { defaultValue: "/data/sensors/" })} className={inputClass} />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className={labelClass}>{t("sms.sensors.username")}</label>
                                                    <input type="text" value={formData.ext_sftp_username}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_username: e.target.value }))}
                                                        placeholder="sftp_user" className={inputClass} />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>{t("sms.sensors.extSftpPassword")}</label>
                                                    <input type="password" value={formData.ext_sftp_password}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_password: e.target.value }))}
                                                        placeholder={t("sms.sensors.leaveEmptyToKeep")} className={inputClass} />
                                                </div>
                                            </div>

                                            <div>
                                                <label className={labelClass}>{t("sms.sensors.extSftpPublicKey")}</label>
                                                <textarea value={formData.ext_sftp_public_key}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_public_key: e.target.value }))}
                                                    rows={2} placeholder={t("sms.sensors.leaveEmptyToKeep")}
                                                    className={`${inputClass} font-mono text-xs`} />
                                            </div>

                                            <div>
                                                <label className={labelClass}>{t("sms.sensors.extSftpPrivateKey")}</label>
                                                <textarea value={formData.ext_sftp_private_key}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_private_key: e.target.value }))}
                                                    rows={2} placeholder={t("sms.sensors.leaveEmptyToKeep")}
                                                    className={`${inputClass} font-mono text-xs`} />
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className={labelClass}>{t("sms.sensors.extApiSyncInterval")}</label>
                                                    <input type="number" min="1" value={formData.ext_sftp_sync_interval}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_sync_interval: e.target.value }))}
                                                        className={inputClass} />
                                                </div>
                                                <div className="flex items-center gap-3 pt-6">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input type="checkbox" checked={formData.ext_sftp_enabled}
                                                            onChange={(e) => setFormData(prev => ({ ...prev, ext_sftp_enabled: e.target.checked }))}
                                                            className="w-4 h-4 rounded border-gray-600 text-orange-600 focus:ring-orange-500 bg-gray-700" />
                                                        <span className="text-sm font-medium text-[var(--foreground)]/80">{t("sms.sensors.extApiEnabled")}</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ==================== TAB: QA/QC ==================== */}
                            {activeTab === 'qaqc' && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-white/60">
                                        <FlaskConical className="w-4 h-4 text-hydro-secondary" />
                                        <span className="text-sm font-medium">Per-sensor QA/QC Override</span>
                                    </div>
                                    <p className="text-xs text-white/30">
                                        Assign a dedicated QA/QC configuration to this sensor that overrides the project default.
                                    </p>

                                    {qaqcLoading && (
                                        <div className="flex items-center gap-2 text-white/40 text-sm">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Loading…
                                        </div>
                                    )}
                                    {qaqcError && (
                                        <p className="text-red-400 text-xs">{qaqcError}</p>
                                    )}
                                    {triggerSuccess && (
                                        <p className="text-green-400 text-xs">QC triggered successfully.</p>
                                    )}

                                    {thingQAQC === null && !qaqcLoading && (
                                        <div className="space-y-3 p-4 border border-dashed border-white/10 rounded-lg">
                                            <p className="text-xs text-white/40">No per-sensor override assigned.</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-xs text-white/40 block mb-1">Config name</label>
                                                    <input
                                                        value={qaqcName}
                                                        onChange={(e) => setQAQCName(e.target.value)}
                                                        placeholder="e.g. sensor_override_v1"
                                                        className={inputClass}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-white/40 block mb-1">Context window</label>
                                                    <input
                                                        value={qaqcWindow}
                                                        onChange={(e) => setQAQCWindow(e.target.value)}
                                                        placeholder="5d"
                                                        className={inputClass}
                                                    />
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleAssignQAQC}
                                                disabled={!qaqcName || !qaqcWindow}
                                                className="px-3 py-1.5 text-sm rounded-lg bg-hydro-primary/20 border border-hydro-primary/30 text-hydro-secondary hover:bg-hydro-primary/30 disabled:opacity-40"
                                            >
                                                Assign Override
                                            </button>
                                        </div>
                                    )}

                                    {thingQAQC && (
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <span className="font-medium text-sm">{thingQAQC.name}</span>
                                                    <span className="text-xs text-white/30 ml-2">window: {thingQAQC.context_window}</span>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleTriggerQAQC}
                                                        title="Trigger QC now"
                                                        className="p-1.5 rounded text-white/40 hover:text-hydro-secondary hover:bg-hydro-primary/10"
                                                    >
                                                        <Play className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleUnassignQAQC}
                                                        title="Remove override"
                                                        className="p-1.5 rounded text-white/40 hover:text-red-400 hover:bg-red-500/10"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Tests */}
                                            <div className="space-y-1">
                                                {thingQAQC.tests.map((test, i) => (
                                                    <div key={test.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/3 border border-white/5 text-sm">
                                                        <span className="text-white/25 text-xs w-4">{i + 1}</span>
                                                        <span className="font-mono text-hydro-secondary flex-1 truncate">{test.function}</span>
                                                        {test.name && <span className="text-xs text-white/30">({test.name})</span>}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteTest(test.id)}
                                                            className="p-1 text-white/30 hover:text-red-400"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>

                                            {addingTest ? (
                                                <div className="space-y-2 p-3 border border-hydro-secondary/20 rounded-lg bg-hydro-secondary/5">
                                                    <select
                                                        value={newTestFunc}
                                                        onChange={(e) => setNewTestFunc(e.target.value)}
                                                        className={selectClass}
                                                    >
                                                        {SAQC_FUNCTIONS.map((f) => (
                                                            <option key={f.name} value={f.name}>{f.label} ({f.name})</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        value={newTestName}
                                                        onChange={(e) => setNewTestName(e.target.value)}
                                                        placeholder="Test label (optional)"
                                                        className={inputClass}
                                                    />
                                                    <textarea
                                                        value={newTestArgs}
                                                        onChange={(e) => setNewTestArgs(e.target.value)}
                                                        rows={2}
                                                        placeholder='{"min": 0, "max": 100}'
                                                        className={`${inputClass} font-mono text-xs`}
                                                    />
                                                    <div className="flex gap-2">
                                                        <button type="button" onClick={() => setAddingTest(false)}
                                                            className="px-3 py-1.5 text-xs rounded border border-white/10 hover:bg-white/5">
                                                            Cancel
                                                        </button>
                                                        <button type="button" onClick={handleAddTest}
                                                            className="px-3 py-1.5 text-xs rounded bg-hydro-secondary/20 border border-hydro-secondary/30 text-hydro-secondary">
                                                            Add
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setAddingTest(true)}
                                                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/10 text-sm text-white/30 hover:text-white/60"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                    Add QC Test
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Footer Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-border sticky bottom-0 bg-card -mx-6 px-6 pb-2">
                                <button type="button" onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 rounded-lg text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-background transition-colors">
                                    {t("sms.sensors.cancel")}
                                </button>
                                <button type="submit" disabled={loading}
                                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-[var(--foreground)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {t("sms.sensors.saveChanges")}
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
