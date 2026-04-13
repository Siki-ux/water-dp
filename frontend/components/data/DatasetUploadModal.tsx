"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { Upload, X, FileText, Check, AlertCircle } from "lucide-react";
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface DatasetUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    dataset: any;
    projectId: string;
    onSuccess?: () => void;
}

export default function DatasetUploadModal({
    isOpen,
    onClose,
    dataset,
    projectId,
    onSuccess
}: DatasetUploadModalProps) {
    useEscapeKey(onClose, isOpen);

    const { data: session } = useSession();
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            validateAndSetFile(droppedFile);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            validateAndSetFile(selectedFile);
        }
    };

    const validateAndSetFile = (selectedFile: File) => {
        setError("");
        setSuccess(false);

        // Check file size (max 256MB)
        const maxSize = 256 * 1024 * 1024;
        if (selectedFile.size > maxSize) {
            setError("File size exceeds 256MB limit");
            return;
        }

        // Check file extension
        const validExtensions = ['.csv', '.txt', '.tsv'];
        const ext = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
        if (!validExtensions.includes(ext)) {
            setError("Only CSV, TXT, and TSV files are supported");
            return;
        }

        setFile(selectedFile);
    };

    const handleUpload = async () => {
        if (!file || !session?.accessToken) return;

        setUploading(true);
        setError("");
        setSuccess(false);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
            const datasetId = dataset.id || dataset.uuid;

            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(
                `${apiUrl}/datasets/${datasetId}/upload?project_id=${projectId}`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${session.accessToken}`
                    },
                    body: formData
                }
            );

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.detail || `Upload failed with status ${response.status}`);
            }

            const result = await response.json();
            setSuccess(true);
            setFile(null);

            if (onSuccess) {
                onSuccess();
            }

            // Auto-close after success
            setTimeout(() => {
                onClose();
            }, 2000);

        } catch (err: any) {
            console.error("Upload error:", err);
            setError(err.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
            onClick={onClose}
        >
            <div
                className="bg-card border border-border rounded-2xl w-full max-w-lg flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-[var(--foreground)]">Upload Data</h2>
                        <p className="text-sm text-[var(--foreground)]/50 mt-1">
                            Upload to: <span className="text-hydro-primary">{dataset?.name}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="text-[var(--foreground)]/50 hover:text-[var(--foreground)]">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Success Message */}
                    {success && (
                        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-3">
                            <Check className="text-green-400" size={24} />
                            <div>
                                <p className="text-green-400 font-medium">Upload successful!</p>
                                <p className="text-green-400/70 text-sm">
                                    File is being processed. Check the data view for results.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                            <AlertCircle className="text-red-400" size={24} />
                            <p className="text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Drop Zone */}
                    {!success && (
                        <div
                            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
                                ${dragOver
                                    ? 'border-hydro-primary bg-hydro-primary/10'
                                    : 'border-white/20 hover:border-white/40'
                                }`}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.txt,.tsv"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <Upload className="mx-auto text-[var(--foreground)]/30 mb-4" size={48} />
                            <p className="text-[var(--foreground)]/70 mb-2">
                                Drag & drop your file here, or click to browse
                            </p>
                            <p className="text-[var(--foreground)]/40 text-sm">
                                Supports CSV, TXT, TSV (max 256MB)
                            </p>
                        </div>
                    )}

                    {/* Selected File */}
                    {file && !success && (
                        <div className="p-4 bg-muted/50 border border-border rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileText className="text-hydro-primary" size={24} />
                                <div>
                                    <p className="text-[var(--foreground)] font-medium">{file.name}</p>
                                    <p className="text-[var(--foreground)]/50 text-sm">{formatFileSize(file.size)}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setFile(null)}
                                className="text-[var(--foreground)]/50 hover:text-[var(--foreground)]"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    )}

                    {/* Parser Info */}
                    <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                        <p className="text-blue-400 text-sm">
                            Files will be parsed using the dataset&apos;s configured parser.
                            Datastreams are created automatically from the data columns.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-border flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-[var(--foreground)]/70 hover:text-[var(--foreground)] transition-colors"
                    >
                        {success ? "Close" : "Cancel"}
                    </button>
                    {!success && (
                        <button
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            className="px-6 py-2 bg-hydro-primary text-black font-semibold rounded hover:bg-hydro-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {uploading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Upload size={18} />
                                    Upload
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
