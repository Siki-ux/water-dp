"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Save } from "lucide-react";
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

export function SensorForm() {
    const router = useRouter();
    const { data: session } = useSession();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [groups, setGroups] = useState<Group[]>([]);
    const [deviceTypes, setDeviceTypes] = useState<DeviceType[]>([]);

    const [formData, setFormData] = useState({
        name: "",
        description: "",
        group_id: "",
        device_type: "chirpstack_generic",
        latitude: "",
        longitude: "",
    });

    // Fetch dependencies
    useEffect(() => {
        if (session?.accessToken) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

            // Fetch Keycloak Groups
            fetch(`${apiUrl}/groups/my-authorization-groups`, {
                headers: { Authorization: `Bearer ${session.accessToken}` }
            })
                .then(res => res.json())
                .then(data => setGroups(Array.isArray(data) ? data : []))
                .catch(err => console.error("Failed to fetch groups", err));

            // Fetch Device Types (from new SMS endpoint)
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
        }
    }, [session]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!formData.group_id) {
            setError(t('sms.sensors.selectGroupError'));
            setLoading(false);
            return;
        }

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

            // Payload — group_id based (Keycloak-centric)
            const payload = {
                sensor_name: formData.name,
                description: formData.description,
                group_id: formData.group_id,
                device_type: formData.device_type,
                latitude: formData.latitude ? parseFloat(formData.latitude) : null,
                longitude: formData.longitude ? parseFloat(formData.longitude) : null,
                properties: []
            };

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
                throw new Error(errData.detail || t('sms.sensors.createSensorError'));
            }

            // Success
            router.push("/sms/sensors");
            router.refresh();

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    /** Strip "UFZ-TSM:" prefix for display */
    const displayGroupName = (name: string) =>
        name.startsWith("UFZ-TSM:") ? name.slice(8) : name;

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto bg-card backdrop-blur-md rounded-xl p-6 border border-border space-y-6">
            <div>
                <h2 className="text-xl font-bold text-[var(--foreground)] mb-1">{t('sms.sensors.sensorDetails')}</h2>
                <p className="text-[var(--foreground)]/40 text-sm">{t('sms.sensors.sensorDetailsDesc')}</p>
            </div>

            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {error}
                </div>
            )}

            <div className="space-y-4">
                {/* Group Selection */}
                <div>
                    <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                        {t('sms.sensors.ownerGroup')} <span className="text-red-400">*</span>
                    </label>
                    <p className="text-xs text-[var(--foreground)]/40 mb-2">
                        {t('sms.sensors.ownerGroupDesc')}
                    </p>
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

                {/* Name */}
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
                        className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">{t('sms.sensors.description')}</label>
                    <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        rows={3}
                        placeholder={t('sms.sensors.optionalDesc')}
                        className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                </div>

                {/* Device Type */}
                <div>
                    <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">
                        {t('sms.sensors.deviceTypeParser')} <span className="text-red-400">*</span>
                    </label>
                    <p className="text-xs text-[var(--foreground)]/40 mb-2">
                        {t('sms.sensors.deviceTypeParserDesc')}
                    </p>
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

                {/* Location */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1">{t('sms.sensors.latitude')}</label>
                        <input
                            type="number"
                            step="any"
                            name="latitude"
                            value={formData.latitude}
                            onChange={handleChange}
                            placeholder={t('sms.sensors.placeholderLat')}
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                            className="w-full bg-background border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                    </div>
                </div>

            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-4 py-2 rounded-lg text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-muted/50 transition-colors"
                >
                    {t('sms.sensors.cancel')}
                </button>
                <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {t('sms.sensors.createSensorBtn')}
                </button>
            </div>
        </form >
    );
}
