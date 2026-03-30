"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Save, Trash2, UserPlus, X } from "lucide-react";
import axios from "axios";
import { useTranslation } from "@/lib/i18n";
import { use } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useProjectPermissions } from "@/hooks/usePermissions";

export default function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
    // Use React.use() to unwrap the promise in client component
    const { id } = use(params);
    const { data: session } = useSession();
    const router = useRouter();
    const { t } = useTranslation();
    const { data: perms } = useProjectPermissions(id);

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
            // Session missing accessToken — handled by auth flow
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
                            disabled={!perms?.can_edit_settings}
                            className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-hydro-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/80">{t("projects.settings.description")}</label>
                        <textarea
                            value={desc}
                            onChange={(e) => setDesc(e.target.value)}
                            disabled={!perms?.can_edit_settings}
                            className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-hydro-primary h-24 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>
                    {perms?.can_edit_settings && (
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
                    )}
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

            {/* Members */}
            <ProjectMembersManager projectId={id} canManage={perms?.can_manage_members ?? false} />

            {/* Danger Zone — only shown to users who can delete */}
            {perms?.can_delete && (
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
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Project Members Manager
// ---------------------------------------------------------------------------

const ROLE_BADGE: Record<string, string> = {
    owner: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    editor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    viewer: "bg-white/10 text-white/60 border-white/20",
};

function ProjectMembersManager({ projectId, canManage }: { projectId: string; canManage: boolean }) {
    const queryClient = useQueryClient();
    const [addUsername, setAddUsername] = useState("");
    const [addRole, setAddRole] = useState<"editor" | "viewer">("viewer");
    const [addError, setAddError] = useState<string | null>(null);

    const { data: members = [], isLoading } = useQuery<any[]>({
        queryKey: ["project-members", projectId],
        queryFn: () => api.get(`/projects/${projectId}/members`).then((r) => r.data),
    });

    const addMutation = useMutation({
        mutationFn: (data: { username: string; role: string }) =>
            api.post(`/projects/${projectId}/members`, data).then((r) => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
            setAddUsername("");
            setAddError(null);
        },
        onError: (err: any) => {
            setAddError(err.response?.data?.detail || "Failed to add member");
        },
    });

    const removeMutation = useMutation({
        mutationFn: (userId: string) =>
            api.delete(`/projects/${projectId}/members/${userId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
        },
    });

    const updateRoleMutation = useMutation({
        mutationFn: ({ userId, role }: { userId: string; role: string }) =>
            api.put(`/projects/${projectId}/members/${userId}`, { role }).then((r) => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
        },
    });

    return (
        <section className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-white">Members</h2>
                <p className="text-white/60">Users with explicit access to this project.</p>
            </div>

            <div className="bg-white/5 p-6 rounded-xl border border-white/10 space-y-4">
                {isLoading ? (
                    <p className="text-white/40">Loading members…</p>
                ) : members.length === 0 ? (
                    <p className="text-white/40 italic">No explicit members yet.</p>
                ) : (
                    <div className="divide-y divide-white/5">
                        {members.map((m: any) => (
                            <div key={m.user_id} className="flex items-center justify-between py-3">
                                <div>
                                    <span className="text-white font-medium">{m.username || m.user_id}</span>
                                    {m.email && <span className="ml-2 text-white/40 text-sm">{m.email}</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                    {canManage && m.role !== "owner" ? (
                                        <select
                                            value={m.role}
                                            onChange={(e) =>
                                                updateRoleMutation.mutate({ userId: m.user_id, role: e.target.value })
                                            }
                                            className="bg-black/30 border border-white/10 rounded px-2 py-1 text-sm text-white"
                                        >
                                            <option value="viewer">viewer</option>
                                            <option value="editor">editor</option>
                                        </select>
                                    ) : (
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_BADGE[m.role] || ROLE_BADGE.viewer}`}>
                                            {m.role}
                                        </span>
                                    )}
                                    {canManage && m.role !== "owner" && (
                                        <button
                                            onClick={() => removeMutation.mutate(m.user_id)}
                                            disabled={removeMutation.isPending}
                                            className="p-1 text-red-400 hover:text-red-300 transition-colors"
                                            title="Remove member"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {canManage && (
                    <div className="pt-4 border-t border-white/10">
                        <h3 className="text-sm font-medium text-white/60 mb-3">Add Member</h3>
                        <div className="flex gap-2">
                            <input
                                value={addUsername}
                                onChange={(e) => setAddUsername(e.target.value)}
                                placeholder="Username"
                                className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-hydro-primary"
                            />
                            <select
                                value={addRole}
                                onChange={(e) => setAddRole(e.target.value as "editor" | "viewer")}
                                className="bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                            >
                                <option value="viewer">viewer</option>
                                <option value="editor">editor</option>
                            </select>
                            <button
                                onClick={() => addMutation.mutate({ username: addUsername, role: addRole })}
                                disabled={!addUsername.trim() || addMutation.isPending}
                                className="flex items-center gap-1 px-4 py-2 bg-hydro-primary hover:bg-blue-600 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                <UserPlus className="w-4 h-4" />
                                Add
                            </button>
                        </div>
                        {addError && <p className="mt-2 text-red-400 text-sm">{addError}</p>}
                    </div>
                )}
            </div>
        </section>
    );
}
