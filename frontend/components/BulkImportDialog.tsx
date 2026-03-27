"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import axios from "axios";
import { Upload, Download, X, CheckCircle, XCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface BulkResult {
    row: number;
    sensor_name: string;
    status: "created" | "failed";
    uuid?: string;
    error?: string;
}

interface BulkResponse {
    created: number;
    failed: number;
    results: BulkResult[];
}

interface Props {
    open: boolean;
    onClose: (createdCount: number) => void;
}

export function BulkImportDialog({ open, onClose }: Props) {
    const { data: session } = useSession();
    const { t } = useTranslation();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/water-api/api/v1";
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [file, setFile] = useState<File | null>(null);
    const [dragging, setDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState<BulkResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (!open) return null;

    const authHeader = { Authorization: `Bearer ${session?.accessToken}` };

    const handleDownloadTemplate = async () => {
        try {
            const res = await axios.get(`${apiUrl}/things/bulk/template`, {
                headers: authHeader,
                responseType: "blob",
            });
            const url = URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement("a");
            a.href = url;
            a.download = "sensor_bulk_template.csv";
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            setError("Failed to download template.");
        }
    };

    const handleFileChange = (f: File | null) => {
        setFile(f);
        setResponse(null);
        setError(null);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped?.name.endsWith(".csv")) handleFileChange(dropped);
    };

    const handleSubmit = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        setResponse(null);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await axios.post<BulkResponse>(`${apiUrl}/things/bulk`, form, {
                headers: { ...authHeader, "Content-Type": "multipart/form-data" },
            });
            setResponse(res.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Import failed.");
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        onClose(response?.created ?? 0);
        setFile(null);
        setResponse(null);
        setError(null);
    };

    const failedRows = response?.results.filter(r => r.status === "failed") ?? [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-xl bg-[#0f1a2e] border border-white/10 rounded-2xl shadow-2xl p-6 space-y-5 mx-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">{t("sms.sensors.bulkImportTitle")}</h2>
                    <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Instructions */}
                <p className="text-sm text-white/60">{t("sms.sensors.bulkImportInstructions")}</p>
                <p className="text-xs text-white/40">{t("sms.sensors.bulkImportGroupIdNote")}</p>

                {/* Download template */}
                <button
                    onClick={handleDownloadTemplate}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-sm text-white/70 hover:text-white hover:border-white/30 transition-colors"
                >
                    <Download className="w-4 h-4" />
                    {t("sms.sensors.downloadTemplate")}
                </button>

                {/* Drop zone */}
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                        dragging ? "border-hydro-primary bg-hydro-primary/10" : "border-white/10 hover:border-white/30"
                    }`}
                >
                    <Upload className="w-6 h-6 mx-auto mb-2 text-white/40" />
                    {file ? (
                        <span className="text-sm text-white/80">{file.name}</span>
                    ) : (
                        <span className="text-sm text-white/40">{t("sms.sensors.uploadLabel")}</span>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
                    />
                </div>

                {error && (
                    <div className="p-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                        {error}
                    </div>
                )}

                {/* Results */}
                {response && (
                    <div className="space-y-3">
                        <p className="text-sm font-medium text-white">{t("sms.sensors.bulkResults")}</p>
                        <div className="flex gap-4 text-sm">
                            <span className="flex items-center gap-1.5 text-green-400">
                                <CheckCircle className="w-4 h-4" />
                                {response.created} {t("sms.sensors.bulkCreated")}
                            </span>
                            {response.failed > 0 && (
                                <span className="flex items-center gap-1.5 text-red-400">
                                    <XCircle className="w-4 h-4" />
                                    {response.failed} {t("sms.sensors.bulkFailed")}
                                </span>
                            )}
                        </div>
                        {failedRows.length > 0 && (
                            <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-lg bg-white/5 p-3">
                                {failedRows.map(r => (
                                    <div key={r.row} className="text-xs text-red-300">
                                        <span className="text-white/50">{t("sms.sensors.bulkRow")} {r.row} &ldquo;{r.sensor_name}&rdquo;:</span> {r.error}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-1">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!file || loading}
                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-hydro-primary to-hydro-secondary rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
                    >
                        <Upload className="w-4 h-4" />
                        {loading ? t("sms.sensors.importing") : t("sms.sensors.importBtn")}
                    </button>
                </div>
            </div>
        </div>
    );
}
