"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Save, X, Edit, Lock } from "lucide-react";
import { PasswordField } from "./PasswordField";

interface SensorEditDialogProps {
    sensor: any;
}

export function SensorEditDialog({ sensor }: SensorEditDialogProps) {
    const router = useRouter();
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);

    // Form States
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form Data
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        mqtt_username: "",
        mqtt_password: "", // Will be empty initially for security
        mqtt_topic: "",
        mqtt_device_type_id: "",
        file_parser_id: ""
    });

    const [deviceTypes, setDeviceTypes] = useState<any[]>([]);
    const [parsers, setParsers] = useState<any[]>([]);
    const [fetchingDevices, setFetchingDevices] = useState(false);
    const [fetchingParsers, setFetchingParsers] = useState(false);
    const [changePassword, setChangePassword] = useState(false);

    // Initialize form and fetch device types when modal opens
    useEffect(() => {
        if (isOpen && sensor) {
            setFormData({
                name: sensor.name || "",
                description: sensor.description || "",
                mqtt_username: sensor.mqtt_username || "",
                mqtt_password: "", // Don't prefill password
                mqtt_topic: sensor.mqtt_topic || "",
                mqtt_device_type_id: sensor.device_type_id?.toString() || sensor.device_type?.id?.toString() || "",
                file_parser_id: sensor.parser_id?.toString() || sensor.parser?.id?.toString() || ""
            });
            setChangePassword(false);
            setError(null);
            fetchDeviceTypes();
            fetchParsers();
        }
    }, [isOpen, sensor]);

    const fetchParsers = async () => {
        setFetchingParsers(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
            const res = await fetch(`${apiUrl}/sms/attributes/parsers?page_size=500`, {
                headers: {
                    Authorization: `Bearer ${session?.accessToken}`,
                },
            });
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
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
            const res = await fetch(`${apiUrl}/sms/attributes/device-types?page_size=500`, {
                headers: {
                    Authorization: `Bearer ${session?.accessToken}`,
                },
            });
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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

            // Payload
            const payload: any = {
                name: formData.name,
                description: formData.description,
                mqtt_username: formData.mqtt_username,
                mqtt_topic: formData.mqtt_topic,
                mqtt_device_type_id: formData.mqtt_device_type_id ? parseInt(formData.mqtt_device_type_id) : null,
                file_parser_id: formData.file_parser_id ? parseInt(formData.file_parser_id) : null
            };

            // Only send password if changing
            if (changePassword && formData.mqtt_password) {
                payload.mqtt_password = formData.mqtt_password;
            }

            const res = await fetch(`${apiUrl}/sms/sensors/${sensor.uuid}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session?.accessToken}`,
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to update sensor");
            }

            // Success
            setIsOpen(false);
            router.refresh();

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
                <Edit className="w-4 h-4" />
                Edit Sensor
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#0A0A0A] border border-white/10 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">

                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/10 sticky top-0 bg-[#0A0A0A] z-10">
                            <div>
                                <h2 className="text-xl font-bold text-white">Edit Sensor</h2>
                                <p className="text-white/40 text-sm">{sensor.uuid}</p>
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
                                <h3 className="text-white font-medium">General Information</h3>
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
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-white/20"
                                    />
                                </div>
                            </div>

                            <hr className="border-white/10" />

                            {/* MQTT Credentials */}
                            <div className="space-y-4">
                                <h3 className="text-white font-medium">MQTT Configuration</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-1">Username</label>
                                        <input
                                            type="text"
                                            name="mqtt_username"
                                            value={formData.mqtt_username}
                                            onChange={handleChange}
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-white/20"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-white/80 mb-1">
                                            Topic
                                        </label>
                                        <input
                                            type="text"
                                            name="mqtt_topic"
                                            value={formData.mqtt_topic}
                                            onChange={handleChange}
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-white/20"
                                        />
                                    </div>

                                    <div className="col-span-2 space-y-2">
                                        <label className="flex items-center gap-2 cursor-pointer mb-2">
                                            <input
                                                type="checkbox"
                                                checked={changePassword}
                                                onChange={(e) => setChangePassword(e.target.checked)}
                                                className="w-4 h-4 rounded border-gra-600 text-blue-600 focus:ring-blue-500 bg-gray-700"
                                            />
                                            <span className="text-sm font-medium text-white/80">Change Password</span>
                                        </label>

                                        {changePassword && (
                                            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                                                <label className="block text-sm font-medium text-white/80 mb-1">New Password</label>
                                                <input
                                                    type="text"
                                                    name="mqtt_password"
                                                    value={formData.mqtt_password}
                                                    onChange={handleChange}
                                                    placeholder="Enter new password"
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-white/20"
                                                />
                                                <p className="text-xs text-white/40 mt-1">
                                                    Updating this will require re-configuring your physical device.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <hr className="border-white/10" />

                            {/* Device Type / Parser */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-white font-medium">Device Type & Parsing</h3>
                                    {fetchingDevices && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                                </div>

                                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                                    <div className="flex items-center gap-2 text-amber-400">
                                        <Lock className="w-4 h-4" />
                                        <span className="text-sm font-semibold uppercase tracking-wider">Warning</span>
                                    </div>
                                    <p className="text-sm text-white/70 leading-relaxed">
                                        Changing the device type will switch the <span className="text-white font-bold">parser</span> for new incoming data. Existing data remains unchanged. Ensure the new parser uses compatible field names to avoid data fragmentation.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-1">
                                        Selected Device Type
                                    </label>
                                    <select
                                        name="mqtt_device_type_id"
                                        value={formData.mqtt_device_type_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, mqtt_device_type_id: e.target.value }))}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none cursor-pointer"
                                    >
                                        <option value="" className="bg-[#0A0A0A]">Select a Device Type</option>
                                        {deviceTypes.map((dt) => (
                                            <option key={dt.id} value={dt.id} className="bg-[#0A0A0A]">
                                                {dt.name} {dt.parser_name ? `(${dt.parser_name})` : ""}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-white/40 mt-2">
                                        This determines how your MQTT payloads are translated into sensor observations.
                                    </p>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-medium text-white/80">
                                            File Parser (S3/MinIO)
                                        </label>
                                        {fetchingParsers && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                                    </div>
                                    <select
                                        name="file_parser_id"
                                        value={formData.file_parser_id}
                                        onChange={(e) => setFormData(prev => ({ ...prev, file_parser_id: e.target.value }))}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none cursor-pointer"
                                    >
                                        <option value="" className="bg-[#0A0A0A]">Select a File Parser</option>
                                        {parsers.map((p) => (
                                            <option key={p.id} value={p.id} className="bg-[#0A0A0A]">
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-white/40 mt-2">
                                        Used when ingesting historical data via file upload (CSV).
                                    </p>
                                </div>
                            </div>

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
