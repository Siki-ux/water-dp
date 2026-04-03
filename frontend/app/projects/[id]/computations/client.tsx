"use client";

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload, FileCode, Play, Save, X, Terminal, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';

interface ComputationScript {
    id: string;
    name: string;
    description?: string;
    filename: string;
    project_id: string;
}

interface ComputationJob {
    id: string;
    status: string;
    start_time: string | null;
    end_time: string | null;
    result: string | null;
    error: string | null;
    logs: string | null;
}

interface ComputationsClientProps {
    token: string;
}

export default function ComputationsClient({ token }: ComputationsClientProps) {
    const params = useParams();
    const projectId = params.id as string;
    const queryClient = useQueryClient();
    const [selectedScript, setSelectedScript] = useState<ComputationScript | null>(null);
    const [isUploadOpen, setIsUploadOpen] = useState(false);

    // --- Data Fetching ---
    const { data: scripts = [], isLoading } = useQuery({
        queryKey: ['computations', projectId],
        queryFn: async () => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/computations/list/${projectId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch scripts');
            return await res.json() as ComputationScript[];
        },
        enabled: !!token && !!projectId
    });

    // Handle ID query param
    const searchParams = useSearchParams();
    const scriptIdParam = searchParams.get('scriptId');

    useEffect(() => {
        if (scriptIdParam && scripts.length > 0 && !selectedScript) {
            const found = scripts.find(s => s.id === scriptIdParam);
            if (found) {
                setSelectedScript(found);
            }
        }
    }, [scriptIdParam, scripts, selectedScript]);

    return (
        <div className="flex h-full gap-6 p-6">
            {/* Left Sidebar: List */}
            <div className="w-1/3 min-w-[300px] flex flex-col bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-900/80">
                    <h2 className="font-bold text-lg text-white">Scripts</h2>
                    <button
                        onClick={() => setIsUploadOpen(true)}
                        className="p-2 bg-hydro-primary/10 text-hydro-primary hover:bg-hydro-primary/20 rounded-lg transition-colors"
                        title="Upload Script"
                    >
                        <Upload size={18} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {isLoading ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-white/30" /></div>
                    ) : scripts.length === 0 ? (
                        <div className="text-center text-white/30 p-8 text-sm">No scripts found. Upload one to get started.</div>
                    ) : (
                        scripts.map(script => (
                            <div
                                key={script.id}
                                onClick={() => setSelectedScript(script)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedScript?.id === script.id
                                    ? 'bg-hydro-primary/10 border-hydro-primary/30'
                                    : 'bg-slate-800/50 border-white/5 hover:border-white/20'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-md ${selectedScript?.id === script.id ? 'bg-hydro-primary/20 text-hydro-primary' : 'bg-slate-700/50 text-white/50'}`}>
                                        <FileCode size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`font-semibold text-sm truncate ${selectedScript?.id === script.id ? 'text-white' : 'text-white/80'}`}>
                                            {script.name}
                                        </h3>
                                        {script.description && (
                                            <p className="text-xs text-white/40 truncate">{script.description}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Right Panel: Editor / Details */}
            <div className="flex-1 bg-slate-900/50 border border-white/10 rounded-xl overflow-hidden flex flex-col">
                {selectedScript ? (
                    <ScriptEditor
                        script={selectedScript}
                        token={token}
                        onClose={() => setSelectedScript(null)}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-white/20">
                        <FileCode size={48} className="mb-4 opacity-20" />
                        <p>Select a script to view or edit</p>
                    </div>
                )}
            </div>

            {/* Upload Modal (Simplified) */}
            {isUploadOpen && (
                <UploadModal
                    projectId={projectId}
                    token={token}
                    onClose={() => setIsUploadOpen(false)}
                    onSuccess={() => {
                        queryClient.invalidateQueries({ queryKey: ['computations', projectId] });
                        setIsUploadOpen(false);
                    }}
                />
            )}
        </div>
    );
}

// --- Sub-components ---

function ScriptEditor({ script, token, onClose }: { script: ComputationScript, token: string, onClose: () => void }) {
    const [code, setCode] = useState('');
    const [isDirty, setIsDirty] = useState(false);
    const queryClient = useQueryClient();

    // Fetch Content
    const { isLoading: isLoadingContent } = useQuery({
        queryKey: ['computationContent', script.id],
        queryFn: async () => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/computations/content/${script.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to load content');
            const data = await res.json();
            setCode(data.content);
            return data;
        },
        enabled: !!script.id
    });

    // Fetch Execution History
    const { data: jobs = [] } = useQuery({
        queryKey: ['computationJobs', script.id],
        queryFn: async () => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/computations/jobs/${script.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return [];
            return await res.json() as ComputationJob[];
        },
        enabled: !!script.id,
        refetchInterval: 5000 // Poll for status updates
    });

    // Save Mutation
    const saveMutation = useMutation({
        mutationFn: async (newContent: string) => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/computations/content/${script.id}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: newContent })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to save');
            }
            return await res.json();
        },
        onSuccess: () => {
            setIsDirty(false);
            // Could show toast success here
        }
    });

    // Run Mutation (Trigger Job)
    const runMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/computations/run/${script.id}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ params: {} }) // Empty params for now
            });
            if (!res.ok) throw new Error('Failed to run task');
            return await res.json();
        },
        onSuccess: (data) => {
            // Invalidate jobs to show new one immediately
            queryClient.invalidateQueries({ queryKey: ['computationJobs', script.id] });
        }
    });

    if (isLoadingContent) return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-hydro-primary" /></div>;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="h-14 border-b border-white/10 bg-slate-900/80 px-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <h2 className="font-mono text-sm font-bold text-white">{script.filename}</h2>
                    {isDirty && <span className="text-[10px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded">Unsaved</span>}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => runMutation.mutate()}
                        disabled={runMutation.isPending}
                        className="px-3 py-1.5 flex items-center gap-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded text-xs font-semibold transition-colors"
                    >
                        {runMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                        Run
                    </button>
                    <button
                        onClick={() => saveMutation.mutate(code)}
                        disabled={!isDirty || saveMutation.isPending}
                        className={`px-3 py-1.5 flex items-center gap-2 rounded text-xs font-semibold transition-colors ${isDirty
                            ? 'bg-hydro-primary text-white hover:bg-hydro-primary/90'
                            : 'bg-white/5 text-white/30 cursor-not-allowed'
                            }`}
                    >
                        {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save
                    </button>
                    <button onClick={onClose} className="p-1.5 hover:bg-white/10 text-white/50 hover:text-white rounded">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Split View: Editor (Top) & History (Bottom) */}
            <div className="flex-1 flex flex-col min-h-0">
                {/* Editor */}
                <div className="flex-1 bg-[#0d1117] relative min-h-[300px]">
                    <textarea
                        value={code}
                        onChange={(e) => {
                            setCode(e.target.value);
                            setIsDirty(true);
                        }}
                        className="w-full h-full bg-transparent text-gray-300 font-mono text-sm p-4 resize-none focus:outline-none"
                        spellCheck={false}
                    />
                </div>

                {/* History Panel */}
                <div className="h-64 border-t border-white/10 bg-slate-900/95 flex flex-col">
                    <div className="h-10 border-b border-white/5 px-4 flex items-center justify-between bg-black/20">
                        <div className="flex items-center gap-2 text-white/70 text-xs font-bold uppercase tracking-wider">
                            <Terminal size={14} />
                            Execution History
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-0">
                        {jobs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-white/20 text-xs">
                                <Clock size={24} className="mb-2 opacity-50" />
                                No execution history
                            </div>
                        ) : (
                            <table className="w-full text-left text-xs text-white/70">
                                <thead className="bg-white/5 text-white/40 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 font-medium">Status</th>
                                        <th className="px-4 py-2 font-medium">Time</th>
                                        <th className="px-4 py-2 font-medium">Result / Output</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {jobs.map(job => (
                                        <tr key={job.id} className="hover:bg-white/5 font-mono">
                                            <td className="px-4 py-2 align-top w-32">
                                                <StatusBadge status={job.status} />
                                            </td>
                                            <td className="px-4 py-2 align-top w-40 text-white/40">
                                                {job.start_time ? new Date(job.start_time).toLocaleString() : '-'}
                                            </td>
                                            <td className="px-4 py-2 align-top">
                                                {job.status === 'PENDING' || job.status === 'STARTED' ? (
                                                    <span className="text-blue-400 italic">Running...</span>
                                                ) : job.error ? (
                                                    <div className="text-red-400 whitespace-pre-wrap max-h-20 overflow-y-auto">{job.error}</div>
                                                ) : (
                                                    <div className="text-white/80 whitespace-pre-wrap max-h-20 overflow-y-auto">{job.logs || job.result || 'Success (No Output)'}</div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    switch (status) {
        case 'SUCCESS':
            return <div className="flex items-center gap-1.5 text-emerald-400"><CheckCircle size={12} /> Success</div>;
        case 'FAILURE':
            return <div className="flex items-center gap-1.5 text-red-400"><XCircle size={12} /> Failed</div>;
        case 'PENDING':
        case 'STARTED':
            return <div className="flex items-center gap-1.5 text-blue-400"><Loader2 size={12} className="animate-spin" /> Running</div>;
        default:
            return <div className="text-white/40">{status}</div>;
    }
}


function UploadModal({ projectId, token, onClose, onSuccess }: { projectId: string, token: string, onClose: () => void, onSuccess: () => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');

    const uploadMutation = useMutation({
        mutationFn: async () => {
            if (!file || !name) throw new Error("File and Name required");

            const formData = new FormData();
            formData.append('file', file);
            formData.append('name', name);
            formData.append('description', description);
            formData.append('project_id', projectId);

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/computations/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Upload failed');
            }
            return await res.json();
        },
        onSuccess,
        onError: (err) => setError(err.message)
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-white">Upload Script</h3>
                    <button onClick={onClose} className="text-white/50 hover:text-white"><X size={20} /></button>
                </div>

                {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-sm">{error}</div>}

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-white/70 mb-1">Script Name</label>
                        <input
                            value={name} onChange={e => setName(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none"
                            placeholder="e.g. Anomaly Detection"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-white/70 mb-1">Description (Optional)</label>
                        <input
                            value={description} onChange={e => setDescription(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none"
                            placeholder="Brief description..."
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-white/70 mb-1">Python File (.py)</label>
                        <input
                            type="file" accept=".py"
                            onChange={e => setFile(e.target.files?.[0] || null)}
                            className="w-full text-sm text-white/50 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-hydro-primary/20 file:text-hydro-primary hover:file:bg-hydro-primary/30"
                        />
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-white/60 hover:text-white">Cancel</button>
                    <button
                        onClick={() => uploadMutation.mutate()}
                        disabled={uploadMutation.isPending}
                        className="px-4 py-2 bg-hydro-primary hover:bg-hydro-primary/90 text-white rounded-lg text-sm font-bold flex items-center gap-2"
                    >
                        {uploadMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                        Upload
                    </button>
                </div>
            </div>
        </div>
    )
}
