"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import axios from "axios";
import { useTranslation } from "@/lib/i18n";
import { use } from "react";

export default function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
    // Use React.use() to unwrap the promise in client component
    const { id } = use(params);
    const { data: session } = useSession();
    const router = useRouter();
    const { t } = useTranslation();

    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form States
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

    useEffect(() => {
        // console.log("Settings Page Session:", session);
        if (session?.accessToken && id) {
            fetchProject();
        } else if (session && !session.accessToken) {
            console.error("Session missing accessToken!", session);
        }
    }, [session, id]);

    const fetchProject = async () => {
        try {
            const res = await axios.get(`${apiUrl}/projects/${id}`, {
                headers: { Authorization: `Bearer ${session?.accessToken}` }
            });
            setProject(res.data);
            setName(res.data.name);
            setDesc(res.data.description || "");
        } catch (error: any) {
            console.error("Fetch Project Error:", error.response?.data || error.message);
            // Optionally set an error state to show in UI
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await axios.put(`${apiUrl}/projects/${id}`, {
                name,
                description: desc
            }, {
                headers: { Authorization: `Bearer ${session?.accessToken}` }
            });
            // alert("Project updated successfully");
            router.refresh();
        } catch (error) {
            console.error("Failed to update project", error);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm(t("projects.settings.deleteConfirm"))) {
            return;
        }

        try {
            await axios.delete(`${apiUrl}/projects/${id}`, {
                headers: { Authorization: `Bearer ${session?.accessToken}` }
            });
            router.push("/projects");
        } catch (error) {
            console.error("Failed to delete project", error);
            alert(t("projects.settings.deleteFail"));
        }
    };

    if (loading) return <div>{t("projects.settings.loading")}</div>;

    return (
        <div className="max-w-4xl space-y-12">
            {/* General Settings */}
            <section className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold text-white">{t("projects.settings.general")}</h2>
                    <p className="text-white/60">{t("projects.settings.generalDesc")}</p>
                </div>

                <form onSubmit={handleUpdate} className="space-y-4 bg-white/5 p-6 rounded-xl border border-white/10">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80">{t("projects.settings.projectName")}</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-hydro-primary"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80">{t("projects.settings.description")}</label>
                        <textarea
                            value={desc}
                            onChange={(e) => setDesc(e.target.value)}
                            className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-hydro-primary h-24"
                        />
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 bg-hydro-primary hover:bg-blue-600 rounded-lg text-white font-medium transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? t("projects.settings.saving") : t("projects.settings.save")}
                        </button>
                    </div>
                </form>
            </section>
            <section className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold text-white">{t("projects.settings.access")}</h2>
                    <p className="text-white/60">{t("projects.settings.accessDesc")}</p>
                </div>

                <div className="bg-white/5 p-6 rounded-xl border border-white/10 space-y-6">
                    <div className="bg-hydro-primary/10 border border-hydro-primary/30 p-4 rounded-lg text-hydro-primary text-sm flex gap-3 items-start">
                        <div className="mt-1">ℹ️</div>
                        <div>
                            <p className="font-semibold">{t("projects.settings.membershipInfo")}</p>
                            <p className="opacity-80">
                                {t("projects.settings.membershipDesc")}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-white/80 uppercase tracking-wider">{t("projects.settings.authorizedGroups")}</h3>
                        {(project?.authorization_group_ids && project.authorization_group_ids.length > 0) || project?.authorization_provider_group_id ? (
                            <div className="flex flex-wrap gap-2">
                                {project.authorization_group_ids && project.authorization_group_ids.length > 0 ? (
                                    project.authorization_group_ids.map((groupId: string) => (
                                        <span key={groupId} className="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-sm font-medium flex items-center gap-2">
                                            <span>🛡️ {groupId}</span>
                                        </span>
                                    ))
                                ) : (
                                    <span key={project.authorization_provider_group_id} className="px-3 py-1.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-sm font-medium flex items-center gap-2">
                                        <span>🛡️ {project.authorization_provider_group_id}</span>
                                    </span>
                                )}
                            </div>
                        ) : (
                            <p className="text-white/40 italic">{t("projects.settings.legacyProject")}</p>
                        )}
                    </div>

                    <div className="pt-4 border-t border-white/10">
                        <a
                            href="/groups"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-medium transition-colors text-sm"
                        >
                            {t("projects.settings.manageAuth")}
                        </a>
                    </div>
                </div>
            </section>

            {/* Danger Zone */}
            <section className="space-y-6 pt-6 border-t border-red-500/20">
                <div>
                    <h2 className="text-2xl font-bold text-red-500">{t("projects.settings.dangerZone")}</h2>
                    <p className="text-white/60">{t("projects.settings.dangerDesc")}</p>
                </div>

                <div className="bg-red-500/5 p-6 rounded-xl border border-red-500/20 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h3 className="text-white font-medium">{t("projects.settings.deleteProject")}</h3>
                            <p className="text-sm text-white/60">{t("projects.settings.deleteProjectDesc")}</p>
                        </div>
                        <button
                            onClick={handleDelete}
                            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium transition-colors whitespace-nowrap"
                        >
                            <Trash2 className="w-4 h-4" />
                            {t("projects.settings.deleteBtn")}
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}
