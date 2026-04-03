
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewProjectForm({ token, groups = [] }: { token: string, groups: { id: string, name: string }[] }) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

    function toggleGroup(groupId: string) {
        if (selectedGroups.includes(groupId)) {
            setSelectedGroups(selectedGroups.filter(id => id !== groupId));
        } else {
            setSelectedGroups([...selectedGroups, groupId]);
        }
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const name = formData.get("name") as string;
        const description = formData.get("description") as string;

        if (selectedGroups.length === 0) {
            setError("You must select at least one Authorization Group.");
            setIsLoading(false);
            return;
        }

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

            const payload: any = {
                name,
                description,
                authorization_group_ids: selectedGroups
            };

            const res = await fetch(`${apiUrl}/projects/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Failed to create project");
            }

            const project = await res.json();
            router.push(`/projects/${project.id}`);
            router.refresh();
        } catch (err: any) {
            setError(err.message || "Something went wrong");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-8 shadow-2xl">
            {error && (
                <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-semibold text-white/70 mb-2">
                        Project Name <span className="text-red-400">*</span>
                    </label>
                    <input
                        name="name"
                        required
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-hydro-primary focus:outline-none focus:ring-1 focus:ring-hydro-primary transition-all"
                        placeholder="e.g. Danube Water Quality"
                    />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-white/70 mb-2">
                        Description
                    </label>
                    <textarea
                        name="description"
                        rows={4}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-hydro-primary focus:outline-none focus:ring-1 focus:ring-hydro-primary transition-all resize-none"
                        placeholder="Describe the purpose of this project..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-white/70 mb-2">
                        Authorization Groups
                    </label>
                    <p className="text-xs text-white/40 mb-3">
                        Select the **Authorization Groups** that should have access to this project.
                        <br />
                        <span className="text-red-400/80">You must select at least one group.</span>
                    </p>

                    <div className="flex flex-wrap gap-2">
                        {groups.length === 0 && (
                            <p className="text-sm text-white/30 italic">No groups found available for assignment.</p>
                        )}
                        {groups.map((group) => {
                            const isSelected = selectedGroups.includes(group.id);
                            return (
                                <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => toggleGroup(group.id)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${isSelected
                                        ? "bg-hydro-primary/20 border-hydro-primary text-hydro-primary shadow-[0_0_10px_rgba(0,183,255,0.3)]"
                                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                                        }`}
                                >
                                    {group.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="pt-4 flex items-center justify-between">
                    <Link
                        href="/projects"
                        className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm font-medium"
                    >
                        <ArrowLeft size={16} />
                        Back to Projects
                    </Link>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="px-6 py-2.5 bg-hydro-primary hover:bg-blue-600 text-white rounded-lg font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Creating...
                            </>
                        ) : (
                            "Create Project"
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
