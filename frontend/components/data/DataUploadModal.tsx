"use client";

import { useState } from "react";
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface DataUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpload: (file: File, parameter: string) => Promise<void>;
    sensorName: string;
}

export default function DataUploadModal({ isOpen, onClose, onUpload, sensorName }: DataUploadModalProps) {
    useEscapeKey(onClose, isOpen);

    const [file, setFile] = useState<File | null>(null);
    const [parameter, setParameter] = useState("Level");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError("Please select a file.");
            return;
        }

        setLoading(true);
        setError("");
        setSuccess("");

        try {
            await onUpload(file, parameter);
            setSuccess("Data uploaded successfully!");
            setTimeout(() => {
                onClose();
                setSuccess("");
                setFile(null);
            }, 1000);
        } catch (err: any) {
            let msg = "Upload failed";
            if (typeof err === "string") msg = err;
            else if (err.message) msg = err.message;

            // If message is still object, stringify it
            if (typeof msg === "object") msg = JSON.stringify(msg);

            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
            onClick={onClose}
        >
            <div
                className="bg-card border border-border rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 border-b border-border flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-bold text-[var(--foreground)]">
                        Upload Data to <span className="text-hydro-primary">{sensorName}</span>
                    </h2>
                    <button onClick={onClose} className="text-[var(--foreground)]/50 hover:text-[var(--foreground)]">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden min-h-0">
                    <div className="overflow-y-auto p-6 space-y-6 flex-1">
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded text-sm">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-400 rounded text-sm">
                                {success}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-xs uppercase text-[var(--foreground)]/50">Parameter Name (Observed Property)</label>
                            <input
                                type="text"
                                required
                                value={parameter}
                                onChange={e => setParameter(e.target.value)}
                                className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-[var(--foreground)] focus:outline-none focus:border-hydro-primary"
                                placeholder="e.g. Level, Flow, Temperature"
                            />
                            <p className="text-xs text-[var(--foreground)]/40">This identifies the datastream (DS_STATIONID_PARAMETER).</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs uppercase text-[var(--foreground)]/50">Data File (CSV or JSON)</label>
                            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-hydro-primary/50 transition-colors bg-muted/50">
                                <input
                                    type="file"
                                    accept=".csv,.json"
                                    onChange={e => setFile(e.target.files?.[0] || null)}
                                    className="hidden"
                                    id="file-upload"
                                />
                                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                                    <span className="text-2xl mb-2">📄</span>
                                    <span className="text-[var(--foreground)] font-medium">
                                        {file ? file.name : "Click to select file"}
                                    </span>
                                    <span className="text-[var(--foreground)]/40 text-sm mt-1">
                                        Supports CSV or JSON
                                    </span>
                                </label>
                            </div>
                        </div>

                        <div className="bg-muted/50 rounded-lg p-4 text-xs font-mono space-y-3">
                            <div className="text-[var(--foreground)]/50 uppercase font-sans font-semibold">Expected Formats</div>

                            <div>
                                <div className="text-hydro-primary mb-1">CSV Example</div>
                                <div className="text-[var(--foreground)]/70 bg-black/30 p-2 rounded">
                                    timestamp,value,quality_flag<br />
                                    2026-01-01T10:00:00Z,12.5,good<br />
                                    2026-01-01T11:00:00Z,13.1,good
                                </div>
                            </div>

                            <div>
                                <div className="text-hydro-primary mb-1">JSON Example</div>
                                <div className="text-[var(--foreground)]/70 bg-black/30 p-2 rounded whitespace-pre-wrap">
                                    {`[
  { "timestamp": "2026-01-01T10:00:00Z", "value": 12.5, "quality_flag": "good" },
  { "timestamp": "2026-01-01T11:00:00Z", "value": 13.1 }
]`}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 p-6 pt-4 border-t border-border bg-card flex-shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-[var(--foreground)]/70 hover:text-[var(--foreground)] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !file}
                            className="px-6 py-2 bg-hydro-primary text-black font-semibold rounded hover:bg-hydro-accent transition-colors disabled:opacity-50"
                        >
                            {loading ? "Uploading..." : "Upload Data"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
