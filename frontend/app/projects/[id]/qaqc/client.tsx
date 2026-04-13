"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    FlaskConical,
    Plus,
    Trash2,
    Play,
    Star,
    StarOff,
    ChevronDown,
    ChevronRight,
    Settings2,
    Loader2,
    X,
    ArrowUp,
    ArrowDown,
    Code2,
} from "lucide-react";
import {
    listQAQCConfigs,
    createQAQCConfig,
    updateQAQCConfig,
    deleteQAQCConfig,
    addQAQCTest,
    updateQAQCTest,
    deleteQAQCTest,
    triggerQAQC,
    QAQCConfig,
    QAQCTest,
} from "@/lib/qaqc-api";
import {
    SAQC_FUNCTIONS,
    CUSTOM_FUNCTION_SENTINEL,
    getSaQCFunction,
} from "@/lib/saqc-functions";

interface QAQCClientProps {}

// ---------------------------------------------------------------------------
// QAQCTriggerDialog
// ---------------------------------------------------------------------------

function QAQCTriggerDialog({
    config,
    projectId,
    onClose,
}: {
    config: QAQCConfig;
    projectId: string;
    onClose: () => void;
}) {
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const mutation = useMutation({
        mutationFn: () =>
            triggerQAQC(
                projectId,
                {
                    qaqc_name: config.name,
                    start_date: new Date(startDate).toISOString(),
                    end_date: new Date(endDate).toISOString(),
                },
            ),
        onSuccess: () => setSuccess(true),
        onError: (e: Error) => setError(e.message),
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[#0f1117] border border-white/10 rounded-xl w-full max-w-md p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Play className="w-5 h-5 text-hydro-secondary" />
                        Trigger QC Run
                    </h2>
                    <button onClick={onClose} className="text-white/40 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <p className="text-sm text-white/50">
                    Run <span className="text-white font-medium">{config.name}</span> over a time range.
                </p>

                {success ? (
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
                        QC run triggered successfully. Check the TSM logs for progress.
                    </div>
                ) : (
                    <>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-white/50 block mb-1">Start Date</label>
                                <input
                                    type="datetime-local"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-hydro-primary/50"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-white/50 block mb-1">End Date</label>
                                <input
                                    type="datetime-local"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-hydro-primary/50"
                                />
                            </div>
                        </div>
                        {error && (
                            <p className="text-red-400 text-xs">{error}</p>
                        )}
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => mutation.mutate()}
                                disabled={!startDate || !endDate || mutation.isPending}
                                className="px-4 py-2 text-sm rounded-lg bg-hydro-primary/20 border border-hydro-primary/30 text-hydro-secondary hover:bg-hydro-primary/30 disabled:opacity-40 flex items-center gap-2"
                            >
                                {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                                Run QC
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// QAQCTestRow
// ---------------------------------------------------------------------------

function QAQCTestRow({
    test,
    projectId,
    qaqcId,
    index,
    total,
}: {
    test: QAQCTest;
    projectId: string;
    qaqcId: number;
    index: number;
    total: number;
}) {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [showRawArgs, setShowRawArgs] = useState(false);
    const [funcName, setFuncName] = useState(test.function);
    const [testName, setTestName] = useState(test.name || "");
    const [argsJson, setArgsJson] = useState(JSON.stringify(test.args || {}, null, 2));
    const [paramValues, setParamValues] = useState<Record<string, string>>(
        Object.fromEntries(
            Object.entries(test.args || {}).map(([k, v]) => [k, String(v)])
        )
    );

    const funcDef = getSaQCFunction(funcName);
    const isCustom = !funcDef;

    const saveMutation = useMutation({
        mutationFn: () => {
            let args: Record<string, unknown> | null = null;
            if (showRawArgs || isCustom) {
                try {
                    args = argsJson ? JSON.parse(argsJson) : null;
                } catch {
                    args = null;
                }
            } else if (funcDef && funcDef.params.length > 0) {
                args = {};
                for (const p of funcDef.params) {
                    const val = paramValues[p.name];
                    if (val !== undefined && val !== "") {
                        args[p.name] = p.type === "number" ? parseFloat(val) :
                                       p.type === "integer" ? parseInt(val) :
                                       p.type === "boolean" ? val === "true" : val;
                    }
                }
            }
            return updateQAQCTest(projectId, qaqcId, test.id, {
                function: funcName,
                name: testName || null,
                args,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["qaqc", projectId] });
            setEditing(false);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: () => deleteQAQCTest(projectId, qaqcId, test.id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["qaqc", projectId] }),
    });

    const moveMutation = useMutation({
        mutationFn: (newPos: number) =>
            updateQAQCTest(projectId, qaqcId, test.id, { position: newPos }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["qaqc", projectId] }),
    });

    if (!editing) {
        return (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-white/5 bg-white/2 hover:bg-white/5 group">
                <span className="text-white/20 text-xs w-5 text-center">{index + 1}</span>
                <div className="flex-1 min-w-0">
                    <span className="font-mono text-sm text-hydro-secondary">{test.function}</span>
                    {test.name && (
                        <span className="ml-2 text-xs text-white/40">({test.name})</span>
                    )}
                    {test.args && Object.keys(test.args).length > 0 && (
                        <p className="text-xs text-white/30 truncate mt-0.5">
                            {Object.entries(test.args)
                                .map(([k, v]) => `${k}=${v}`)
                                .join(", ")}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => moveMutation.mutate(index - 1)}
                        disabled={index === 0}
                        className="p-1 text-white/40 hover:text-white disabled:opacity-20"
                    >
                        <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => moveMutation.mutate(index + 1)}
                        disabled={index === total - 1}
                        className="p-1 text-white/40 hover:text-white disabled:opacity-20"
                    >
                        <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setEditing(true)}
                        className="p-1 text-white/40 hover:text-white"
                    >
                        <Settings2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => deleteMutation.mutate()}
                        className="p-1 text-white/40 hover:text-red-400"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-3 rounded-lg border border-hydro-primary/30 bg-hydro-primary/5 space-y-3">
            <div className="flex items-center gap-2">
                <select
                    value={funcDef ? funcName : CUSTOM_FUNCTION_SENTINEL}
                    onChange={(e) => {
                        const val = e.target.value;
                        if (val === CUSTOM_FUNCTION_SENTINEL) {
                            setFuncName(funcName);
                            setShowRawArgs(true);
                        } else {
                            setFuncName(val);
                            setParamValues({});
                            setShowRawArgs(false);
                        }
                    }}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm flex-1 focus:outline-none"
                >
                    {SAQC_FUNCTIONS.map((f) => (
                        <option key={f.name} value={f.name}>{f.label} ({f.name})</option>
                    ))}
                    <option value={CUSTOM_FUNCTION_SENTINEL}>Custom function…</option>
                </select>
                {(showRawArgs || isCustom) && (
                    <input
                        value={funcName}
                        onChange={(e) => setFuncName(e.target.value)}
                        placeholder="saqc function name"
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm font-mono flex-1 focus:outline-none"
                    />
                )}
            </div>

            <input
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="Test label (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
            />

            {/* Auto-generated param form */}
            {!showRawArgs && funcDef && funcDef.params.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {funcDef.params.map((p) => (
                        <div key={p.name}>
                            <label className="text-xs text-white/40 block mb-0.5">
                                {p.name}
                                {p.required && <span className="text-red-400 ml-0.5">*</span>}
                            </label>
                            <input
                                type={p.type === "number" || p.type === "integer" ? "number" : "text"}
                                value={paramValues[p.name] ?? (p.default !== undefined ? String(p.default) : "")}
                                onChange={(e) =>
                                    setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))
                                }
                                placeholder={p.placeholder || String(p.default ?? "")}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                            />
                            <p className="text-xs text-white/25 mt-0.5">{p.description}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Raw JSON toggle */}
            <button
                onClick={() => setShowRawArgs((v) => !v)}
                className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1"
            >
                <Code2 className="w-3 h-3" />
                {showRawArgs ? "Hide" : "Show"} raw JSON args
            </button>

            {showRawArgs && (
                <textarea
                    value={argsJson}
                    onChange={(e) => setArgsJson(e.target.value)}
                    rows={4}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs font-mono focus:outline-none"
                />
            )}

            <div className="flex gap-2 justify-end">
                <button
                    onClick={() => setEditing(false)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-white/10 hover:bg-white/5"
                >
                    Cancel
                </button>
                <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="px-3 py-1.5 text-xs rounded-lg bg-hydro-primary/20 border border-hydro-primary/30 text-hydro-secondary hover:bg-hydro-primary/30 disabled:opacity-40 flex items-center gap-1"
                >
                    {saveMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                    Save
                </button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// AddTestForm
// ---------------------------------------------------------------------------

function AddTestForm({
    projectId,
    qaqcId,
    onClose,
}: {
    projectId: string;
    qaqcId: number;
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const [selectedFunc, setSelectedFunc] = useState(SAQC_FUNCTIONS[0].name);
    const [customFunc, setCustomFunc] = useState("");
    const [showRaw, setShowRaw] = useState(false);
    const [testName, setTestName] = useState("");
    const [paramValues, setParamValues] = useState<Record<string, string>>({});
    const [rawArgs, setRawArgs] = useState("{}");
    const [error, setError] = useState<string | null>(null);

    const isCustom = selectedFunc === CUSTOM_FUNCTION_SENTINEL;
    const funcDef = isCustom ? undefined : getSaQCFunction(selectedFunc);
    const finalFuncName = isCustom ? customFunc : selectedFunc;

    const mutation = useMutation({
        mutationFn: () => {
            let args: Record<string, unknown> | null = null;
            if (showRaw || isCustom) {
                try { args = JSON.parse(rawArgs); } catch { args = null; }
            } else if (funcDef && funcDef.params.length > 0) {
                args = {};
                for (const p of funcDef.params) {
                    const val = paramValues[p.name];
                    if (val !== undefined && val !== "") {
                        args[p.name] = p.type === "number" ? parseFloat(val) :
                                       p.type === "integer" ? parseInt(val) :
                                       p.type === "boolean" ? val === "true" : val;
                    }
                }
            }
            return addQAQCTest(projectId, qaqcId, {
                function: finalFuncName,
                name: testName || null,
                args,
                position: null,
                streams: null,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["qaqc", projectId] });
            onClose();
        },
        onError: (e: Error) => setError(e.message),
    });

    return (
        <div className="p-3 rounded-lg border border-hydro-secondary/30 bg-hydro-secondary/5 space-y-3 mt-2">
            <p className="text-xs font-medium text-white/60 uppercase tracking-wider">New Test</p>

            <div className="flex items-center gap-2">
                <select
                    value={selectedFunc}
                    onChange={(e) => {
                        setSelectedFunc(e.target.value);
                        setParamValues({});
                        setShowRaw(false);
                    }}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm flex-1 focus:outline-none"
                >
                    {SAQC_FUNCTIONS.map((f) => (
                        <option key={f.name} value={f.name}>{f.label} ({f.name})</option>
                    ))}
                    <option value={CUSTOM_FUNCTION_SENTINEL}>Custom function…</option>
                </select>
                {isCustom && (
                    <input
                        value={customFunc}
                        onChange={(e) => setCustomFunc(e.target.value)}
                        placeholder="saqc function name"
                        className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm font-mono flex-1 focus:outline-none"
                    />
                )}
            </div>

            {funcDef && (
                <p className="text-xs text-white/30">{funcDef.description}</p>
            )}

            <input
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="Test label (optional)"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
            />

            {!showRaw && funcDef && funcDef.params.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {funcDef.params.map((p) => (
                        <div key={p.name}>
                            <label className="text-xs text-white/40 block mb-0.5">
                                {p.name}
                                {p.required && <span className="text-red-400 ml-0.5">*</span>}
                            </label>
                            <input
                                type={p.type === "number" || p.type === "integer" ? "number" : "text"}
                                value={paramValues[p.name] ?? (p.default !== undefined ? String(p.default) : "")}
                                onChange={(e) =>
                                    setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))
                                }
                                placeholder={p.placeholder || String(p.default ?? "")}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
                            />
                            <p className="text-xs text-white/25 mt-0.5">{p.description}</p>
                        </div>
                    ))}
                </div>
            )}

            <button
                onClick={() => setShowRaw((v) => !v)}
                className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1"
            >
                <Code2 className="w-3 h-3" />
                {showRaw ? "Hide" : "Show"} raw JSON args
            </button>

            {showRaw && (
                <textarea
                    value={rawArgs}
                    onChange={(e) => setRawArgs(e.target.value)}
                    rows={3}
                    className="w-full bg-black/30 border border-white/10 rounded-lg p-2 text-xs font-mono focus:outline-none"
                />
            )}

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-2 justify-end">
                <button
                    onClick={onClose}
                    className="px-3 py-1.5 text-xs rounded-lg border border-white/10 hover:bg-white/5"
                >
                    Cancel
                </button>
                <button
                    onClick={() => mutation.mutate()}
                    disabled={mutation.isPending || (!finalFuncName)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-hydro-secondary/20 border border-hydro-secondary/30 text-hydro-secondary hover:bg-hydro-secondary/30 disabled:opacity-40 flex items-center gap-1"
                >
                    {mutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                    Add Test
                </button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// QAQCConfigCard
// ---------------------------------------------------------------------------

function QAQCConfigCard({
    config,
    projectId,
}: {
    config: QAQCConfig;
    projectId: string;
}) {
    const queryClient = useQueryClient();
    const [expanded, setExpanded] = useState(false);
    const [addingTest, setAddingTest] = useState(false);
    const [triggerOpen, setTriggerOpen] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [newName, setNewName] = useState(config.name);
    const [newWindow, setNewWindow] = useState(config.context_window);

    const setDefaultMutation = useMutation({
        mutationFn: () =>
            updateQAQCConfig(projectId, config.id, { is_default: !config.is_default }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["qaqc", projectId] }),
    });

    const deleteMutation = useMutation({
        mutationFn: () => deleteQAQCConfig(projectId, config.id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["qaqc", projectId] }),
    });

    const saveNameMutation = useMutation({
        mutationFn: () =>
            updateQAQCConfig(projectId, config.id, { name: newName, context_window: newWindow }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["qaqc", projectId] });
            setEditingName(false);
        },
    });

    return (
        <div className="border border-white/10 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 bg-white/2 cursor-pointer hover:bg-white/4 transition-colors"
                onClick={() => setExpanded((v) => !v)}>
                {expanded ? (
                    <ChevronDown className="w-4 h-4 text-white/40 flex-shrink-0" />
                ) : (
                    <ChevronRight className="w-4 h-4 text-white/40 flex-shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                    {editingName ? (
                        <div
                            className="flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="bg-white/5 border border-white/20 rounded px-2 py-1 text-sm focus:outline-none"
                                autoFocus
                            />
                            <input
                                value={newWindow}
                                onChange={(e) => setNewWindow(e.target.value)}
                                placeholder="context window (e.g. 5d)"
                                className="bg-white/5 border border-white/20 rounded px-2 py-1 text-sm focus:outline-none w-36"
                            />
                            <button
                                onClick={() => saveNameMutation.mutate()}
                                disabled={saveNameMutation.isPending}
                                className="text-xs px-2 py-1 rounded bg-hydro-primary/20 border border-hydro-primary/30 text-hydro-secondary"
                            >
                                Save
                            </button>
                            <button
                                onClick={() => setEditingName(false)}
                                className="text-xs px-2 py-1 rounded border border-white/10"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium truncate">{config.name}</span>
                            {config.is_default && (
                                <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-full flex-shrink-0">
                                    default
                                </span>
                            )}
                            <span className="text-xs text-white/30 flex-shrink-0">
                                window: {config.context_window}
                            </span>
                            <span className="text-xs text-white/25 flex-shrink-0">
                                {config.tests.length} test{config.tests.length !== 1 ? "s" : ""}
                            </span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div
                    className="flex items-center gap-1 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={() => setTriggerOpen(true)}
                        title="Run QC manually"
                        className="p-1.5 rounded-lg text-white/40 hover:text-hydro-secondary hover:bg-hydro-primary/10 transition-colors"
                    >
                        <Play className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setDefaultMutation.mutate()}
                        title={config.is_default ? "Unset as default" : "Set as default"}
                        className="p-1.5 rounded-lg text-white/40 hover:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
                    >
                        {config.is_default ? <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" /> : <StarOff className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => setEditingName(true)}
                        className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        <Settings2 className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => {
                            if (confirm(`Delete "${config.name}"?`)) deleteMutation.mutate();
                        }}
                        className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Tests */}
            {expanded && (
                <div className="p-4 space-y-2 border-t border-white/5">
                    {config.tests.length === 0 && !addingTest && (
                        <p className="text-sm text-white/30 text-center py-4">
                            No tests yet. Add a QC check below.
                        </p>
                    )}
                    {config.tests.map((test, i) => (
                        <QAQCTestRow
                            key={test.id}
                            test={test}
                            projectId={projectId}
                            qaqcId={config.id}
                            index={i}
                            total={config.tests.length}
                        />
                    ))}
                    {addingTest ? (
                        <AddTestForm
                            projectId={projectId}
                            qaqcId={config.id}
                            onClose={() => setAddingTest(false)}
                        />
                    ) : (
                        <button
                            onClick={() => setAddingTest(true)}
                            className="w-full mt-2 flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/10 text-sm text-white/30 hover:text-white/60 hover:border-white/20 transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                            Add QC Test
                        </button>
                    )}
                </div>
            )}

            {triggerOpen && (
                <QAQCTriggerDialog
                    config={config}
                    projectId={projectId}
                    onClose={() => setTriggerOpen(false)}
                />
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// CreateConfigForm
// ---------------------------------------------------------------------------

function CreateConfigForm({
    projectId,
    onClose,
}: {
    projectId: string;
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [window, setWindow] = useState("5d");
    const [isDefault, setIsDefault] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: () =>
            createQAQCConfig(projectId, { name, context_window: window, is_default: isDefault }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["qaqc", projectId] });
            onClose();
        },
        onError: (e: Error) => setError(e.message),
    });

    return (
        <div className="border border-hydro-secondary/30 rounded-xl p-4 space-y-3 bg-hydro-secondary/5">
            <p className="text-sm font-medium text-white/70">New QA/QC Configuration</p>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-white/40 block mb-1">Name *</label>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. water_quality_v1"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-hydro-primary/50"
                    />
                </div>
                <div>
                    <label className="text-xs text-white/40 block mb-1">
                        Context Window *
                        <span className="ml-1 text-white/20">(e.g. 5d, 24h, 100)</span>
                    </label>
                    <input
                        value={window}
                        onChange={(e) => setWindow(e.target.value)}
                        placeholder="5d"
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-hydro-primary/50"
                    />
                </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="rounded"
                />
                <span className="text-sm text-white/60">
                    Set as default (runs automatically on every data upload)
                </span>
            </label>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2 justify-end">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5"
                >
                    Cancel
                </button>
                <button
                    onClick={() => mutation.mutate()}
                    disabled={!name || !window || mutation.isPending}
                    className="px-4 py-2 text-sm rounded-lg bg-hydro-secondary/20 border border-hydro-secondary/30 text-hydro-secondary hover:bg-hydro-secondary/30 disabled:opacity-40 flex items-center gap-2"
                >
                    {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Create
                </button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Client Component
// ---------------------------------------------------------------------------

export default function QAQCClient({}: QAQCClientProps) {
    const params = useParams();
    const projectId = params.id as string;
    const [creating, setCreating] = useState(false);

    const { data: configs, isLoading, error } = useQuery({
        queryKey: ["qaqc", projectId],
        queryFn: () => listQAQCConfigs(projectId),
    });

    return (
        <div className="flex h-full flex-col p-6 gap-6 bg-background overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-[var(--foreground)] flex items-center gap-3">
                        <div className="p-2 bg-hydro-primary/10 rounded-xl border border-hydro-primary/20">
                            <FlaskConical className="text-hydro-secondary w-6 h-6" />
                        </div>
                        QA/QC Configurations
                    </h1>
                    <p className="text-[var(--foreground)]/40 text-sm mt-1 ml-12">
                        Configure automated quality control checks powered by SaQC.
                    </p>
                </div>
                {!creating && (
                    <button
                        onClick={() => setCreating(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-hydro-primary/20 border border-hydro-primary/30 text-hydro-secondary hover:bg-hydro-primary/30 transition-colors text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        New Config
                    </button>
                )}
            </div>

            {/* Info Banner */}
            <div className="p-3 bg-white/3 border border-white/5 rounded-xl text-xs text-white/40 flex items-start gap-2">
                <FlaskConical className="w-4 h-4 flex-shrink-0 mt-0.5 text-hydro-secondary/60" />
                <span>
                    The <strong className="text-white/60">default</strong> configuration runs automatically each time new data arrives.
                    Any configuration can also be triggered manually for a specific time range.
                    Quality flags are stored on observations as STAMPLATE annotations.
                </span>
            </div>

            {/* Create Form */}
            {creating && (
                <CreateConfigForm
                    projectId={projectId}
                    onClose={() => setCreating(false)}
                />
            )}

            {/* Config List */}
            {isLoading && (
                <div className="flex items-center gap-2 text-white/40 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading QA/QC configurations…
                </div>
            )}
            {error && (
                <p className="text-red-400 text-sm">
                    {error instanceof Error ? error.message : "Failed to load configurations"}
                </p>
            )}
            {configs && configs.length === 0 && !creating && (
                <div className="flex flex-col items-center justify-center py-16 text-white/30 gap-3">
                    <FlaskConical className="w-12 h-12 opacity-30" />
                    <p className="text-lg font-medium">No QA/QC configurations yet</p>
                    <p className="text-sm">Create a configuration to start applying quality checks to your sensor data.</p>
                    <button
                        onClick={() => setCreating(true)}
                        className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-hydro-primary/20 border border-hydro-primary/30 text-hydro-secondary hover:bg-hydro-primary/30 transition-colors text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Create first configuration
                    </button>
                </div>
            )}
            {configs && configs.length > 0 && (
                <div className="space-y-3">
                    {configs.map((cfg) => (
                        <QAQCConfigCard
                            key={cfg.id}
                            config={cfg}
                            projectId={projectId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
