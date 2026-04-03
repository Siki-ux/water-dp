"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Save, Upload, Code } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getApiUrl } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface ApiTypeCreateDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ApiTypeCreateDialog({ isOpen, onClose }: ApiTypeCreateDialogProps) {
    const { data: session } = useSession();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"write" | "upload">("write");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { t } = useTranslation();

    const [formData, setFormData] = useState({
        name: "",
        code: "",
        file: null as File | null
    });

    useEffect(() => {
        if (isOpen) {
            setFormData({ name: "", code: "", file: null });
            setError(null);
            setActiveTab("write");
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const apiUrl = getApiUrl();

            // If code or file provided, upload syncer script
            const hasCode = activeTab === "write" && formData.code.trim();
            const hasFile = activeTab === "upload" && formData.file;

            if (hasCode || hasFile) {
                const submitData = new FormData();
                submitData.append("api_type_name", formData.name);

                if (hasCode) {
                    const blob = new Blob([formData.code], { type: "text/x-python" });
                    const fileName = `${formData.name}.py`;
                    submitData.append("file", blob, fileName);
                } else if (formData.file) {
                    submitData.append("file", formData.file);
                }

                const res = await fetch(`${apiUrl}/external-sources/api-types/upload`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${session?.accessToken}`,
                    },
                    body: submitData,
                });

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.detail || "Failed to upload syncer");
                }
            } else {
                // Create type without syncer script (name-only registration)
                const res = await fetch(`${apiUrl}/external-sources/api-types?name=${encodeURIComponent(formData.name)}`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${session?.accessToken}`,
                    },
                });

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.detail || "Failed to create API type");
                }
            }

            onClose();
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setFormData(prev => ({ ...prev, file }));

            const reader = new FileReader();
            reader.onload = (event) => {
                if (event.target?.result) {
                    setFormData(prev => ({ ...prev, code: event.target?.result as string }));
                    setActiveTab("write");
                }
            };
            reader.readAsText(file);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl bg-card border-border text-[var(--foreground)]">
                <DialogHeader>
                    <DialogTitle>{t('sms.apiTypes.createTitle')}</DialogTitle>
                    <DialogDescription>
                        {t('sms.apiTypes.createDesc')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6 mt-4">
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label htmlFor="api-type-name" className="block text-sm font-medium text-[var(--foreground)]/80">
                            {t('sms.apiTypes.apiTypeName')}
                        </label>
                        <input
                            id="api-type-name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder={t('sms.apiTypes.placeholderName')}
                            className="w-full bg-muted/50 border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            required
                        />
                        <p className="text-xs text-[var(--foreground)]/40">{t('sms.apiTypes.apiTypeDesc')}</p>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-[var(--foreground)]/80">{t('sms.apiTypes.syncerCode')}</label>

                        <div className="flex items-center gap-2 mb-2 bg-muted/50 p-1 rounded-lg w-fit">
                            <button
                                type="button"
                                onClick={() => setActiveTab("write")}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${activeTab === "write"
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-muted/50"
                                    }`}
                            >
                                <Code className="w-4 h-4" />
                                {t('sms.apiTypes.writeCode')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab("upload")}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${activeTab === "upload"
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-muted/50"
                                    }`}
                            >
                                <Upload className="w-4 h-4" />
                                {t('sms.apiTypes.uploadFile')}
                            </button>
                        </div>

                        {activeTab === "write" ? (
                            <textarea
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                placeholder={t('sms.apiTypes.placeholderCode')}
                                className="w-full h-64 bg-[#1A1A1A] border border-border rounded-lg p-4 font-mono text-sm text-[var(--foreground)]/90 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y"
                                spellCheck={false}
                            />
                        ) : (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full h-64 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors group"
                            >
                                <Upload className="w-8 h-8 text-[var(--foreground)]/40 group-hover:text-blue-400 mb-3 transition-colors" />
                                <p className="text-sm text-[var(--foreground)]/60 group-hover:text-[var(--foreground)] transition-colors">
                                    {t('sms.apiTypes.clickToSelect')}
                                </p>
                                <p className="text-xs text-[var(--foreground)]/40 mt-1">
                                    {formData.file ? formData.file.name : t('sms.apiTypes.noFileSelected')}
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".py"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-muted/50 transition-colors"
                        >
                            {t('sms.apiTypes.cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {t('sms.apiTypes.createSubmit')}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
