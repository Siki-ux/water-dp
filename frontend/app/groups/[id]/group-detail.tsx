"use client";

import { useState } from "react";
import { Loader2, UserPlus, Trash2, ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";

interface GroupDetailProps {
    groupId: string;
    token: string;
}

export default function GroupDetail({ groupId, token }: GroupDetailProps) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const [newUsername, setNewUsername] = useState("");
    const [addError, setAddError] = useState<string | null>(null);

    // Fetch Group Details
    const { data: group, isLoading: isGroupLoading } = useQuery({
        queryKey: ['group', groupId],
        queryFn: async () => {
            const res = await fetch(`${apiUrl}/groups/${groupId}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch group details");
            return res.json();
        }
    });

    // Fetch Members
    const { data: members, isLoading: isMembersLoading } = useQuery({
        queryKey: ['group-members', groupId],
        queryFn: async () => {
            const res = await fetch(`${apiUrl}/groups/${groupId}/members`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch members");
            return res.json();
        }
    });

    // Add Member Mutation
    const addMemberMutation = useMutation({
        mutationFn: async (username: string) => {
            const res = await fetch(`${apiUrl}/groups/${groupId}/members`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ username })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Failed to add member");
            }
            return res.json();
        },
        onSuccess: () => {
            setNewUsername("");
            setAddError(null);
            queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
        },
        onError: (err: any) => {
            setAddError(err.message);
        }
    });

    // Remove Member Mutation
    const removeMemberMutation = useMutation({
        mutationFn: async (userId: string) => {
            const res = await fetch(`${apiUrl}/groups/${groupId}/members/${userId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to remove member");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['group-members', groupId] });
        }
    });

    const handleAddMember = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername.trim()) return;
        addMemberMutation.mutate(newUsername);
    };

    if (isGroupLoading) {
        return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-hydro-primary" /></div>;
    }

    return (
        <div>
            <div className="mb-8 flex items-center gap-4">
                <Link href="/groups" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Users className="text-hydro-primary" />
                        {group?.name}
                    </h1>
                    <p className="text-white/40 font-mono text-sm mt-1">ID: {groupId}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Members List */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-xl font-bold text-white mb-4">{t("groups.members")} ({members?.length || 0})</h2>

                    {isMembersLoading ? (
                        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-white/20" /></div>
                    ) : (
                        <div className="bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden">
                            {members?.map((member: any) => (
                                <div key={member.id} className="p-4 border-b border-white/5 flex items-center justify-between last:border-0 hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                            {member.username?.[0]?.toUpperCase() || "?"}
                                        </div>
                                        <div>
                                            <div className="text-white font-medium">{member.username}</div>
                                            <div className="text-white/40 text-xs">{member.email || t("groups.noEmail")}</div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => removeMemberMutation.mutate(member.id)}
                                        disabled={removeMemberMutation.isPending}
                                        className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                                        title={t("groups.removeMember")}
                                    >
                                        {removeMemberMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                    </button>
                                </div>
                            ))}
                            {members?.length === 0 && (
                                <div className="p-8 text-center text-white/40 italic">{t("groups.noMembersFound")}</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Add Member Panel */}
                <div>
                    <div className="bg-slate-900/50 border border-white/10 rounded-xl p-6 sticky top-4">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <UserPlus size={20} className="text-hydro-primary" />
                            {t("groups.addMemberTitle")}
                        </h3>

                        <form onSubmit={handleAddMember} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-white/50 mb-1.5 uppercase tracking-wider">{t("groups.username")}</label>
                                <input
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                    placeholder={t("groups.enterUsername")}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white focus:border-hydro-primary focus:outline-none transition-all text-sm"
                                />
                            </div>

                            {addError && (
                                <div className="text-red-400 text-xs bg-red-500/10 p-2 rounded border border-red-500/20">
                                    {addError}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={addMemberMutation.isPending || !newUsername.trim()}
                                className="w-full py-2 bg-hydro-primary hover:bg-blue-600 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex justify-center items-center gap-2"
                            >
                                {addMemberMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : t("groups.addUserBtn")}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
