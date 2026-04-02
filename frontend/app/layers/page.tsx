"use client";

import Link from "next/link";
import { Layers, Plus, Loader2, Trash2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useLayers, useDeleteLayer } from "@/hooks/queries/useLayers";

interface LayerInfo {
    layer_name: string;
    title: string;
    workspace?: string;
    is_public?: boolean;
}

export default function LayersPage() {
    const { t } = useTranslation();
    const { data: raw, isLoading: loading } = useLayers();
    const deleteLayerMut = useDeleteLayer();
    const layers: LayerInfo[] = raw?.layers ?? [];

    const handleDelete = (layerName: string) => {
        if (!confirm(t('layers.deleteConfirm'))) return;
        deleteLayerMut.mutate(layerName);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Layers className="w-7 h-7 text-hydro-primary" />
                        {t('layers.title')}
                    </h1>
                    <p className="text-white/50 text-sm mt-1">{t('layers.manageDesc')}</p>
                </div>
                <Link
                    href="/layers/create"
                    className="flex items-center gap-2 px-4 py-2 bg-hydro-primary/20 hover:bg-hydro-primary/30 text-hydro-primary rounded-lg text-sm font-semibold border border-hydro-primary/30 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    {t('layers.create')}
                </Link>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-hydro-primary" />
                </div>
            ) : layers.length === 0 ? (
                <div className="text-center py-20">
                    <Layers className="w-16 h-16 text-white/10 mx-auto mb-4" />
                    <p className="text-white/40 text-lg">{t('layers.noLayers')}</p>
                    <p className="text-white/25 text-sm mt-1">{t('layers.createFirstDesc')}</p>
                    <Link
                        href="/layers/create"
                        className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-hydro-primary text-white rounded-lg text-sm font-semibold hover:bg-hydro-primary/90 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        {t('layers.create')}
                    </Link>
                </div>
            ) : (
                <div className="rounded-xl border border-white/10 overflow-hidden">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/10">
                                <th className="text-left px-6 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">{t('layers.layerNameCol')}</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">{t('layers.titleCol')}</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">{t('layers.workspaceCol')}</th>
                                <th className="text-right px-6 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">{t('layers.actionsCol')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {layers.map((layer) => (
                                <tr
                                    key={layer.layer_name}
                                    className="border-b border-white/5 hover:bg-white/5 transition-colors group"
                                >
                                    <td className="px-6 py-4">
                                        <Link
                                            href={`/layers/${encodeURIComponent(layer.layer_name)}`}
                                            className="text-sm font-medium text-hydro-primary hover:text-hydro-primary/80 transition-colors"
                                        >
                                            {layer.layer_name}
                                        </Link>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-white/70">{layer.title}</td>
                                    <td className="px-6 py-4 text-sm text-white/50">{layer.workspace || "—"}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleDelete(layer.layer_name)}
                                            className="p-2 text-white/30 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                            title={t('layers.deleteTitle')}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
