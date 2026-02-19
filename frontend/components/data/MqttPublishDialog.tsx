"use client";

import { useState } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { getApiUrl } from "@/lib/utils";

interface MqttPublishDialogProps {
    isOpen: boolean;
    onClose: () => void;
    sensorUuid: string;
    sensorName: string;
    token: string;
}

export default function MqttPublishDialog({
    isOpen,
    onClose,
    sensorUuid,
    sensorName,
    token,
}: MqttPublishDialogProps) {
    const [topicSuffix, setTopicSuffix] = useState("data");
    const [jsonPayload, setJsonPayload] = useState('{\n  "hello": "world"\n}');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

    if (!isOpen) return null;

    const handlePublish = async () => {
        setStatus({ type: null, message: '' });

        // validate JSON
        let parsedData;
        try {
            parsedData = JSON.parse(jsonPayload);
        } catch (e) {
            setStatus({ type: 'error', message: 'Invalid JSON payload' });
            return;
        }

        setLoading(true);
        const apiUrl = getApiUrl();

        try {
            const res = await fetch(`${apiUrl}/mqtt/things/${sensorUuid}/publish`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    topic_suffix: topicSuffix,
                    data: parsedData
                })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || 'Failed to publish message');
            }

            setStatus({ type: 'success', message: 'Message published successfully!' });
            setTimeout(() => {
                onClose();
                setStatus({ type: null, message: '' });
            }, 1500);

        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0a0a0a] border border-white/10 rounded-xl w-full max-w-lg shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h3 className="text-lg font-semibold text-white">Publish MQTT Message</h3>
                    <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm text-blue-300">
                        Publishing to sensor: <span className="font-semibold text-white">{sensorName}</span>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Topic Suffix</label>
                        <input
                            type="text"
                            value={topicSuffix}
                            onChange={(e) => setTopicSuffix(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            placeholder="e.g. data"
                        />
                        <p className="text-xs text-white/40 mt-1">Appended to base topic (e.g. <code>.../{topicSuffix}</code>)</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">JSON Payload</label>
                        <textarea
                            value={jsonPayload}
                            onChange={(e) => setJsonPayload(e.target.value)}
                            className="w-full h-40 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                            placeholder="{ ... }"
                        />
                    </div>

                    {status.message && (
                        <div className={`p-3 rounded-lg text-sm border ${status.type === 'success'
                            ? 'bg-green-500/10 border-green-500/20 text-green-400'
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}>
                            {status.message}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 hover:bg-white/5 text-white/70 hover:text-white rounded-lg text-sm transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handlePublish}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Publish
                    </button>
                </div>
            </div>
        </div>
    );
}
