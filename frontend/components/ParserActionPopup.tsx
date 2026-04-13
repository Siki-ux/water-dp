"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getApiUrl } from "@/lib/utils";
import { toast } from "sonner";
import { Edit2, Trash2, X, Loader2, Save, AlertTriangle } from "lucide-react";
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useTranslation } from "@/lib/i18n";

interface Parser {
    id: number;
    uuid: string;
    name: string;
    type_name?: string;
    params?: any;
}

interface ParserActionPopupProps {
    parser: Parser;
    isOpen: boolean;
    onClose: () => void;
}

export function ParserActionPopup({ parser, isOpen, onClose }: ParserActionPopupProps) {
    useEscapeKey(onClose, isOpen);

    const [mode, setMode] = useState<"actions" | "edit" | "delete">("actions");
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState(parser.name);
    const [settingsJson, setSettingsJson] = useState(JSON.stringify(parser.params || {}, null, 2));
    const [deleteError, setDeleteError] = useState<{ message: string; linked_sensors?: string[] } | null>(null);
    const router = useRouter();
    const { data: session } = useSession();
    const { t } = useTranslation();

    if (!isOpen) return null;

    const handleClose = () => {
        setMode("actions");
        setDeleteError(null);
        setName(parser.name);
        setSettingsJson(JSON.stringify(parser.params || {}, null, 2));
        onClose();
    };

    const handleEdit = async () => {
        if (!session?.accessToken) return;
        setLoading(true);
        try {
            let parsedSettings;
            try {
                parsedSettings = JSON.parse(settingsJson);
            } catch {
                toast.error(t('sms.parsers.invalidJson'));
                setLoading(false);
                return;
            }

            const res = await fetch(`${getApiUrl()}/sms/parsers/${parser.uuid}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${session.accessToken}`,
                },
                body: JSON.stringify({ name, settings: parsedSettings }),
            });

            if (!res.ok) throw new Error(t('sms.parsers.updateFail'));

            toast.success(t('sms.parsers.updateSuccess'));
            handleClose();
            router.refresh();
        } catch (error) {
            toast.error(t('sms.parsers.updateFail'));
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!session?.accessToken) return;
        setLoading(true);
        setDeleteError(null);
        try {
            const res = await fetch(`${getApiUrl()}/sms/parsers/${parser.id}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${session.accessToken}`,
                },
            });

            if (res.status === 409) {
                const data = await res.json();
                setDeleteError({
                    message: data.detail?.message || t('sms.parsers.assignedError'),
                    linked_sensors: data.detail?.linked_sensors || [],
                });
                setLoading(false);
                return;
            }

            if (!res.ok) throw new Error(t('sms.parsers.deleteFail'));

            toast.success(t('sms.parsers.deleteSuccess'));
            handleClose();
            router.refresh();
        } catch (error) {
            toast.error(t('sms.parsers.deleteFail'));
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200" onClick={handleClose}>
            <div
                className="bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--foreground)]">
                            {mode === "actions" && parser.name}
                            {mode === "edit" && t('sms.parsers.editParser')}
                            {mode === "delete" && t('sms.parsers.deleteParser')}
                        </h2>
                        <p className="text-xs text-[var(--foreground)]/40 font-mono mt-0.5">
                            ID: #{parser.id} · {parser.type_name || t('sms.parsers.unknownType')}
                        </p>
                    </div>
                    <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted text-[var(--foreground)]/40 hover:text-[var(--foreground)] transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4">
                    {/* Actions View */}
                    {mode === "actions" && (
                        <div className="space-y-2">
                            <button
                                onClick={() => setMode("edit")}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/50 hover:bg-muted border border-border hover:border-purple-500/30 text-[var(--foreground)] transition-all group"
                            >
                                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                                    <Edit2 className="w-4 h-4" />
                                </div>
                                <div className="text-left">
                                    <div className="font-medium">{t('sms.parsers.editParser')}</div>
                                    <div className="text-xs text-[var(--foreground)]/40">{t('sms.parsers.modifyDesc')}</div>
                                </div>
                            </button>

                            <button
                                onClick={() => setMode("delete")}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/50 hover:bg-red-500/10 border border-border hover:border-red-500/30 text-[var(--foreground)] transition-all group"
                            >
                                <div className="p-2 rounded-lg bg-red-500/10 text-red-400 group-hover:bg-red-500/20 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </div>
                                <div className="text-left">
                                    <div className="font-medium">{t('sms.parsers.deleteParser')}</div>
                                    <div className="text-xs text-[var(--foreground)]/40">{t('sms.parsers.removeDesc')}</div>
                                </div>
                            </button>
                        </div>
                    )}

                    {/* Edit View */}
                    {mode === "edit" && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs uppercase text-[var(--foreground)]/50 font-semibold mb-1.5">{t('sms.parsers.name')}</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full bg-muted/50 border border-border rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                                />
                            </div>
                            <div>
                                <label className="block text-xs uppercase text-[var(--foreground)]/50 font-semibold mb-1.5">{t('sms.parsers.settingsJson')}</label>
                                <textarea
                                    value={settingsJson}
                                    onChange={(e) => setSettingsJson(e.target.value)}
                                    rows={8}
                                    className="w-full bg-muted/50 border border-border rounded-lg px-4 py-2 text-[var(--foreground)] font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none"
                                />
                                <p className="text-xs text-[var(--foreground)]/30 mt-1">{t('sms.parsers.rawJsonDesc')}</p>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => setMode("actions")}
                                    disabled={loading}
                                    className="px-4 py-2 rounded-lg text-sm text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-muted/50 transition-colors"
                                >
                                    {t('sms.parsers.back')}
                                </button>
                                <button
                                    onClick={handleEdit}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {t('sms.parsers.saveChanges')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Delete View */}
                    {mode === "delete" && (
                        <div className="space-y-4">
                            {deleteError ? (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                                    <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        {t('sms.parsers.cannotDelete')}
                                    </div>
                                    <p className="text-sm text-[var(--foreground)]/60 mb-3">{deleteError.message}. {t('sms.parsers.unassignDesc')}</p>
                                    <ul className="space-y-1">
                                        {deleteError.linked_sensors?.map((s, i) => (
                                            <li key={i} className="text-xs text-[var(--foreground)]/50 font-mono bg-muted/50 rounded px-3 py-1.5">
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                                    <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        {t('sms.parsers.areYouSure')}
                                    </div>
                                    <p className="text-sm text-[var(--foreground)]/60">
                                        {t('sms.parsers.deletePermanently')} <span className="text-[var(--foreground)] font-medium">{parser.name}</span>.
                                        {t('sms.parsers.cannotBeUndone')}
                                    </p>
                                </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    onClick={() => { setMode("actions"); setDeleteError(null); }}
                                    disabled={loading}
                                    className="px-4 py-2 rounded-lg text-sm text-[var(--foreground)]/60 hover:text-[var(--foreground)] hover:bg-muted/50 transition-colors"
                                >
                                    {deleteError ? t('sms.parsers.close') : t('sms.parsers.cancel')}
                                </button>
                                {!deleteError && (
                                    <button
                                        onClick={handleDelete}
                                        disabled={loading}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        {t('sms.parsers.deleteParser')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
