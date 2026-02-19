"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Upload, Loader2, CheckCircle, FileText } from "lucide-react";
import { getApiUrl } from "@/lib/utils";

interface FileUploadDialogProps {
    isOpen: boolean;
    onClose: () => void;
    sensorUuid: string;
    sensorName: string;
    token: string;
}

export default function FileUploadDialog({
    isOpen,
    onClose,
    sensorUuid,
    sensorName,
    token
}: FileUploadDialogProps) {
    const [mounted, setMounted] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<{ status: string; bucket: string; file: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setResult(null);
            setError(null);
            setSelectedFile(null);
        }
    }, [isOpen]);

    if (!isOpen || !mounted) return null;

    const handleFileSelect = (file: File) => {
        setSelectedFile(file);
        setResult(null);
        setError(null);
    };

    const handleUpload = async () => {
        if (!selectedFile) return;

        setUploading(true);
        setError(null);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append("file", selectedFile);

            const res = await fetch(`${getApiUrl()}/things/${sensorUuid}/ingest/csv`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                setError(err.detail || "Upload failed");
                return;
            }

            const data = await res.json();
            setResult(data);
            setSelectedFile(null);
        } catch (e) {
            console.error(e);
            setError("Upload failed. Check connection and try again.");
        } finally {
            setUploading(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0a0a0a] border border-white/10 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-[#0a0a0a] z-10">
                    <div>
                        <h3 className="text-lg font-semibold text-white">Upload Data File</h3>
                        <p className="text-xs text-white/40 mt-0.5">{sensorName}</p>
                    </div>
                    <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Drop Zone */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver
                                ? "border-blue-500 bg-blue-500/10"
                                : "border-white/10 hover:border-white/30 hover:bg-white/5"
                            }`}
                    >
                        <Upload className="w-8 h-8 text-white/30 mx-auto mb-3" />
                        <p className="text-sm text-white/70">
                            Drop a file here or <span className="text-blue-400 underline">browse</span>
                        </p>
                        <p className="text-xs text-white/30 mt-1">CSV, JSON, or any supported format</p>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileSelect(file);
                        }}
                    />

                    {/* Selected File */}
                    {selectedFile && (
                        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-3">
                            <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-white font-medium truncate">{selectedFile.name}</p>
                                <p className="text-xs text-white/40">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <button
                                onClick={() => setSelectedFile(null)}
                                className="text-white/40 hover:text-white transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
                            {error}
                        </div>
                    )}

                    {/* Success */}
                    {result && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-start gap-2">
                            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm text-green-400 font-medium">Upload successful!</p>
                                <p className="text-xs text-white/40 mt-1">
                                    File <span className="text-white/60 font-mono">{result.file}</span> uploaded to bucket <span className="text-white/60 font-mono">{result.bucket}</span>
                                </p>
                                <p className="text-xs text-white/30 mt-0.5">The TSM worker will process this file shortly.</p>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="pt-2 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 hover:bg-white/5 text-white/70 hover:text-white rounded-lg text-sm transition-colors"
                        >
                            {result ? "Done" : "Cancel"}
                        </button>
                        {!result && (
                            <button
                                onClick={handleUpload}
                                disabled={uploading || !selectedFile}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                            >
                                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {uploading ? "Uploading..." : "Upload"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
