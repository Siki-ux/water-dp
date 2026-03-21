"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    FlaskConical,
    ChevronRight,
    ChevronDown,
    Plus,
    Trash2,
    Play,
    Star,
    StarOff,
    Settings2,
    Loader2,
    X,
    ArrowUp,
    ArrowDown,
    Code2,
    Database,
    Upload,
    FileCode,
} from "lucide-react";
import {
    listQAQCSchemas,
    smsListQAQCConfigs,
    smsCreateQAQCConfig,
    smsUpdateQAQCConfig,
    smsDeleteQAQCConfig,
    smsAddQAQCTest,
    smsUpdateQAQCTest,
    smsDeleteQAQCTest,
    smsTriggerQAQC,
    listCustomQAQCFunctions,
    uploadCustomQAQCFunction,
    deleteCustomQAQCFunction,
    QAQCConfig,
    QAQCSchemaInfo,
    QAQCTest,
    CustomQAQCFunction,
} from "@/lib/qaqc-api";
import { SAQC_FUNCTIONS, getSaQCFunction, CUSTOM_FUNCTION_SENTINEL } from "@/lib/saqc-functions";
import { useTranslation } from "@/lib/i18n";

interface Props { token: string; }

// ---------------------------------------------------------------------------
// TriggerDialog
// ---------------------------------------------------------------------------

function TriggerDialog({ config, schemaName, token, onClose }: {
    config: QAQCConfig; schemaName: string; token: string; onClose: () => void;
}) {
    const { t } = useTranslation();
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: () => smsTriggerQAQC(schemaName, {
            qaqc_name: config.name,
            start_date: new Date(start).toISOString(),
            end_date: new Date(end).toISOString(),
        }, token),
        onSuccess: () => setSuccess(true),
        onError: (e: Error) => setError(e.message),
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-[#0f1117] border border-white/10 rounded-xl w-full max-w-md p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Play className="w-5 h-5 text-hydro-secondary" /> {t('sms.qaqc.triggerRun')}
                    </h2>
                    <button onClick={onClose} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
                </div>
                <p className="text-sm text-white/50">
                    Run <span className="text-white font-medium">{config.name}</span> on schema <span className="font-mono text-white/70">{schemaName}</span>.
                </p>
                {success ? (
                    <p className="text-green-400 text-sm p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                        {t('sms.qaqc.triggerSuccess')}
                    </p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-white/40 block mb-1">{t('sms.qaqc.triggerStart')}</label>
                                <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                            </div>
                            <div>
                                <label className="text-xs text-white/40 block mb-1">{t('sms.qaqc.triggerEnd')}</label>
                                <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                            </div>
                        </div>
                        {error && <p className="text-red-400 text-xs">{error}</p>}
                        <div className="flex gap-2 justify-end">
                            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5">{t('sms.qaqc.cancel')}</button>
                            <button onClick={() => mutation.mutate()} disabled={!start || !end || mutation.isPending}
                                className="px-4 py-2 text-sm rounded-lg bg-hydro-primary/20 border border-hydro-primary/30 text-hydro-secondary disabled:opacity-40 flex items-center gap-2">
                                {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {t('sms.qaqc.run')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// TestRow
// ---------------------------------------------------------------------------

function TestRow({ test, schemaName, qaqcId, token, index, total }: {
    test: QAQCTest; schemaName: string; qaqcId: number; token: string; index: number; total: number;
}) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [showRaw, setShowRaw] = useState(false);
    const [funcName, setFuncName] = useState(test.function);
    const [testName, setTestName] = useState(test.name || "");
    const [rawArgs, setRawArgs] = useState(JSON.stringify(test.args || {}, null, 2));
    const [paramValues, setParamValues] = useState<Record<string, string>>(
        Object.fromEntries(Object.entries(test.args || {}).map(([k, v]) => [k, String(v)]))
    );
    const funcDef = getSaQCFunction(funcName);

    const inv = () => qc.invalidateQueries({ queryKey: ["sms-qaqc", schemaName] });

    const saveMutation = useMutation({
        mutationFn: () => {
            let args: Record<string, unknown> | null = null;
            if (showRaw || !funcDef) {
                try { args = JSON.parse(rawArgs); } catch { args = null; }
            } else if (funcDef.params.length > 0) {
                args = {};
                for (const p of funcDef.params) {
                    const v = paramValues[p.name];
                    if (v !== undefined && v !== "") {
                        args[p.name] = p.type === "number" ? parseFloat(v) : p.type === "integer" ? parseInt(v) : v;
                    }
                }
            }
            return smsUpdateQAQCTest(schemaName, qaqcId, test.id, { function: funcName, name: testName || null, args }, token);
        },
        onSuccess: () => { inv(); setEditing(false); },
    });

    const deleteMutation = useMutation({
        mutationFn: () => smsDeleteQAQCTest(schemaName, qaqcId, test.id, token),
        onSuccess: inv,
    });

    const moveMutation = useMutation({
        mutationFn: (pos: number) => smsUpdateQAQCTest(schemaName, qaqcId, test.id, { position: pos }, token),
        onSuccess: inv,
    });

    if (!editing) return (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/5 bg-white/2 hover:bg-white/4 group">
            <span className="text-white/20 text-xs w-4">{index + 1}</span>
            <div className="flex-1 min-w-0">
                <span className="font-mono text-sm text-hydro-secondary">{test.function}</span>
                {test.name && <span className="ml-2 text-xs text-white/35">({test.name})</span>}
                {test.args && Object.keys(test.args).length > 0 && (
                    <p className="text-xs text-white/25 truncate mt-0.5">
                        {Object.entries(test.args).map(([k, v]) => `${k}=${v}`).join(", ")}
                    </p>
                )}
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={() => moveMutation.mutate(index - 1)} disabled={index === 0} className="p-1 text-white/30 hover:text-white disabled:opacity-20"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => moveMutation.mutate(index + 1)} disabled={index === total - 1} className="p-1 text-white/30 hover:text-white disabled:opacity-20"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditing(true)} className="p-1 text-white/30 hover:text-white"><Settings2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteMutation.mutate()} className="p-1 text-white/30 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
        </div>
    );

    return (
        <div className="p-3 rounded-lg border border-hydro-primary/30 bg-hydro-primary/5 space-y-2">
            <div className="flex gap-2">
                <select value={funcDef ? funcName : CUSTOM_FUNCTION_SENTINEL}
                    onChange={e => { const v = e.target.value; if (v === CUSTOM_FUNCTION_SENTINEL) setShowRaw(true); else { setFuncName(v); setParamValues({}); setShowRaw(false); } }}
                    className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm flex-1 focus:outline-none">
                    {SAQC_FUNCTIONS.map(f => <option key={f.name} value={f.name}>{f.label}</option>)}
                    <option value={CUSTOM_FUNCTION_SENTINEL}>Custom…</option>
                </select>
                {(showRaw || !funcDef) && (
                    <input value={funcName} onChange={e => setFuncName(e.target.value)} placeholder="function name"
                        className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm font-mono flex-1 focus:outline-none" />
                )}
            </div>
            <input value={testName} onChange={e => setTestName(e.target.value)} placeholder={t('sms.qaqc.label')}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm focus:outline-none" />
            {!showRaw && funcDef && funcDef.params.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {funcDef.params.map(p => (
                        <div key={p.name}>
                            <label className="text-xs text-white/40 block">{p.name}{p.required && <span className="text-red-400 ml-0.5">*</span>}</label>
                            <input type={p.type === "number" || p.type === "integer" ? "number" : "text"}
                                value={paramValues[p.name] ?? String(p.default ?? "")}
                                onChange={e => setParamValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                                placeholder={p.placeholder || String(p.default ?? "")}
                                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm focus:outline-none" />
                        </div>
                    ))}
                </div>
            )}
            <button onClick={() => setShowRaw(v => !v)} className="text-xs text-white/25 hover:text-white/50 flex items-center gap-1">
                <Code2 className="w-3 h-3" /> {showRaw ? t('sms.qaqc.hideRaw') : t('sms.qaqc.showRaw')}
            </button>
            {showRaw && <textarea value={rawArgs} onChange={e => setRawArgs(e.target.value)} rows={3}
                className="w-full bg-black/30 border border-white/10 rounded p-2 text-xs font-mono focus:outline-none" />}
            <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs rounded border border-white/10 hover:bg-white/5">{t('sms.qaqc.cancel')}</button>
                <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                    className="px-3 py-1.5 text-xs rounded bg-hydro-primary/20 border border-hydro-primary/30 text-hydro-secondary disabled:opacity-40 flex items-center gap-1">
                    {saveMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />} {t('sms.qaqc.save')}
                </button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// AddTestForm
// ---------------------------------------------------------------------------

function AddTestForm({ schemaName, qaqcId, token, onClose }: {
    schemaName: string; qaqcId: number; token: string; onClose: () => void;
}) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [sel, setSel] = useState(SAQC_FUNCTIONS[0].name);
    const [customFunc, setCustomFunc] = useState("");
    const [testName, setTestName] = useState("");
    const [showRaw, setShowRaw] = useState(false);
    const [rawArgs, setRawArgs] = useState("{}");
    const [params, setParams] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const isCustom = sel === CUSTOM_FUNCTION_SENTINEL;
    const funcDef = isCustom ? undefined : getSaQCFunction(sel);
    const finalFunc = isCustom ? customFunc : sel;

    const mutation = useMutation({
        mutationFn: () => {
            let args: Record<string, unknown> | null = null;
            if (showRaw || isCustom) { try { args = JSON.parse(rawArgs); } catch { args = null; } }
            else if (funcDef && funcDef.params.length > 0) {
                args = {};
                for (const p of funcDef.params) {
                    const v = params[p.name];
                    if (v !== undefined && v !== "") args[p.name] = p.type === "number" ? parseFloat(v) : p.type === "integer" ? parseInt(v) : v;
                }
            }
            return smsAddQAQCTest(schemaName, qaqcId, { function: finalFunc, name: testName || null, args, position: null, streams: null }, token);
        },
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["sms-qaqc", schemaName] }); onClose(); },
        onError: (e: Error) => setError(e.message),
    });

    return (
        <div className="p-3 rounded-lg border border-hydro-secondary/30 bg-hydro-secondary/5 space-y-2 mt-1">
            <p className="text-xs font-medium text-white/50 uppercase tracking-wider">{t('sms.qaqc.newTest')}</p>
            <div className="flex gap-2">
                <select value={sel} onChange={e => { setSel(e.target.value); setParams({}); setShowRaw(false); }}
                    className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm flex-1 focus:outline-none">
                    {SAQC_FUNCTIONS.map(f => <option key={f.name} value={f.name}>{f.label} ({f.name})</option>)}
                    <option value={CUSTOM_FUNCTION_SENTINEL}>Custom…</option>
                </select>
                {isCustom && <input value={customFunc} onChange={e => setCustomFunc(e.target.value)} placeholder="saqc function name"
                    className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm font-mono flex-1 focus:outline-none" />}
            </div>
            {funcDef && (
                <div className="rounded-lg bg-hydro-primary/5 border border-hydro-primary/15 px-3 py-2 space-y-1">
                    <p className="text-xs font-medium text-hydro-secondary/70">{funcDef.description}</p>
                    <p className="text-xs text-white/35 leading-relaxed">{funcDef.whenToUse}</p>
                </div>
            )}
            <input value={testName} onChange={e => setTestName(e.target.value)} placeholder={t('sms.qaqc.label')}
                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm focus:outline-none" />
            {!showRaw && funcDef && funcDef.params.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {funcDef.params.map(p => (
                        <div key={p.name}>
                            <label className="text-xs text-white/50 block mb-0.5">
                                {p.name}
                                {p.required && <span className="text-red-400 ml-0.5">*</span>}
                                {p.default !== undefined && <span className="text-white/25 ml-1">(default: {String(p.default)})</span>}
                            </label>
                            <input type={p.type === "number" || p.type === "integer" ? "number" : "text"}
                                value={params[p.name] ?? String(p.default ?? "")}
                                onChange={e => setParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                                placeholder={p.placeholder || String(p.default ?? "")}
                                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-sm focus:outline-none" />
                            <p className="text-xs text-white/35 mt-0.5 leading-snug">{p.description}</p>
                        </div>
                    ))}
                </div>
            )}
            <button onClick={() => setShowRaw(v => !v)} className="text-xs text-white/25 hover:text-white/50 flex items-center gap-1">
                <Code2 className="w-3 h-3" /> {showRaw ? t('sms.qaqc.hideRaw') : t('sms.qaqc.showRaw')}
            </button>
            {showRaw && <textarea value={rawArgs} onChange={e => setRawArgs(e.target.value)} rows={3}
                className="w-full bg-black/30 border border-white/10 rounded p-2 text-xs font-mono focus:outline-none" />}
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2 justify-end">
                <button onClick={onClose} className="px-3 py-1.5 text-xs rounded border border-white/10 hover:bg-white/5">{t('sms.qaqc.cancel')}</button>
                <button onClick={() => mutation.mutate()} disabled={!finalFunc || mutation.isPending}
                    className="px-3 py-1.5 text-xs rounded bg-hydro-secondary/20 border border-hydro-secondary/30 text-hydro-secondary disabled:opacity-40 flex items-center gap-1">
                    {mutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />} {t('sms.qaqc.addTest')}
                </button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// ConfigCard
// ---------------------------------------------------------------------------

function ConfigCard({ config, schemaName, token }: { config: QAQCConfig; schemaName: string; token: string }) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [expanded, setExpanded] = useState(false);
    const [addingTest, setAddingTest] = useState(false);
    const [triggerOpen, setTriggerOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editName, setEditName] = useState(config.name);
    const [editWindow, setEditWindow] = useState(config.context_window);

    const inv = () => qc.invalidateQueries({ queryKey: ["sms-qaqc", schemaName] });

    const setDefaultMut = useMutation({
        mutationFn: () => smsUpdateQAQCConfig(schemaName, config.id, { is_default: !config.is_default }, token),
        onSuccess: inv,
    });
    const deleteMut = useMutation({
        mutationFn: () => smsDeleteQAQCConfig(schemaName, config.id, token),
        onSuccess: inv,
    });
    const saveMut = useMutation({
        mutationFn: () => smsUpdateQAQCConfig(schemaName, config.id, { name: editName, context_window: editWindow }, token),
        onSuccess: () => { inv(); setEditing(false); },
    });

    return (
        <div className="border border-white/10 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-white/2 cursor-pointer hover:bg-white/4" onClick={() => setExpanded(v => !v)}>
                {expanded ? <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                    {editing ? (
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <input value={editName} onChange={e => setEditName(e.target.value)}
                                className="bg-white/5 border border-white/20 rounded px-2 py-1 text-sm focus:outline-none" />
                            <input value={editWindow} onChange={e => setEditWindow(e.target.value)}
                                placeholder="context window" className="bg-white/5 border border-white/20 rounded px-2 py-1 text-sm w-28 focus:outline-none" />
                            <button onClick={() => saveMut.mutate()} className="text-xs px-2 py-1 rounded bg-hydro-primary/20 border border-hydro-primary/30 text-hydro-secondary">{t('sms.qaqc.save')}</button>
                            <button onClick={() => setEditing(false)} className="text-xs px-2 py-1 rounded border border-white/10">{t('sms.qaqc.cancel')}</button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{config.name}</span>
                            {config.is_default && <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-full">{t('sms.qaqc.defaultBadge')}</span>}
                            <span className="text-xs text-white/30">{t('sms.qaqc.window')}: {config.context_window}</span>
                            <span className="text-xs text-white/20">{config.tests.length} {config.tests.length !== 1 ? t('sms.qaqc.tests') : t('sms.qaqc.test')}</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setTriggerOpen(true)} title="Trigger manually" className="p-1.5 rounded text-white/30 hover:text-hydro-secondary hover:bg-hydro-primary/10"><Play className="w-4 h-4" /></button>
                    <button onClick={() => setDefaultMut.mutate()} title="Toggle default" className="p-1.5 rounded text-white/30 hover:text-yellow-400">
                        {config.is_default ? <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" /> : <StarOff className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setEditing(true)} className="p-1.5 rounded text-white/30 hover:text-white"><Settings2 className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm(`Delete "${config.name}"?`)) deleteMut.mutate(); }} className="p-1.5 rounded text-white/30 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
            </div>
            {expanded && (
                <div className="px-4 py-3 space-y-1.5 border-t border-white/5">
                    {config.tests.length === 0 && !addingTest && (
                        <p className="text-sm text-white/25 text-center py-3">{t('sms.qaqc.noTests')}</p>
                    )}
                    {config.tests.map((t, i) => (
                        <TestRow key={t.id} test={t} schemaName={schemaName} qaqcId={config.id} token={token} index={i} total={config.tests.length} />
                    ))}
                    {addingTest ? (
                        <AddTestForm schemaName={schemaName} qaqcId={config.id} token={token} onClose={() => setAddingTest(false)} />
                    ) : (
                        <button onClick={() => setAddingTest(true)}
                            className="w-full mt-1 flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/10 text-sm text-white/25 hover:text-white/50 hover:border-white/20">
                            <Plus className="w-4 h-4" /> {t('sms.qaqc.addTest')}
                        </button>
                    )}
                </div>
            )}
            {triggerOpen && <TriggerDialog config={config} schemaName={schemaName} token={token} onClose={() => setTriggerOpen(false)} />}
        </div>
    );
}

// ---------------------------------------------------------------------------
// SchemaSection
// ---------------------------------------------------------------------------

function SchemaSection({ schema, token }: { schema: QAQCSchemaInfo; token: string }) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [newWindow, setNewWindow] = useState("5d");
    const [isDefault, setIsDefault] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const qc = useQueryClient();

    const { data: configs, isLoading } = useQuery({
        queryKey: ["sms-qaqc", schema.schema_name],
        queryFn: () => smsListQAQCConfigs(schema.schema_name, token),
        enabled: expanded,
    });

    const createMut = useMutation({
        mutationFn: () => smsCreateQAQCConfig(schema.schema_name, { name: newName, context_window: newWindow, is_default: isDefault }, token),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["sms-qaqc", schema.schema_name] });
            qc.invalidateQueries({ queryKey: ["qaqc-schemas"] });
            setCreating(false); setNewName(""); setNewWindow("5d"); setIsDefault(false);
        },
        onError: (e: Error) => setCreateError(e.message),
    });

    return (
        <div className="border border-white/10 rounded-xl overflow-hidden">
            {/* Schema header */}
            <div className="flex items-center gap-3 px-5 py-4 bg-white/3 cursor-pointer hover:bg-white/5" onClick={() => setExpanded(v => !v)}>
                {expanded ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronRight className="w-4 h-4 text-white/40" />}
                <Database className="w-4 h-4 text-hydro-secondary/70" />
                <div className="flex-1 min-w-0">
                    <p className="font-medium">{schema.name}</p>
                    <p className="text-xs text-white/35 font-mono">{schema.schema_name}</p>
                </div>
                <span className="text-xs px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-white/40">
                    {schema.config_count} {schema.config_count !== 1 ? t('sms.qaqc.configs') : t('sms.qaqc.config')}
                </span>
            </div>

            {expanded && (
                <div className="px-5 py-4 space-y-3 border-t border-white/5">
                    {isLoading && <div className="flex items-center gap-2 text-white/30 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> {t('sms.qaqc.loading')}</div>}
                    {configs && configs.map(cfg => (
                        <ConfigCard key={cfg.id} config={cfg} schemaName={schema.schema_name} token={token} />
                    ))}

                    {creating ? (
                        <div className="border border-hydro-secondary/30 rounded-xl p-4 space-y-3 bg-hydro-secondary/5">
                            <p className="text-sm font-medium text-white/60">{t('sms.qaqc.newConfig')}</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-white/40 block mb-1">{t('sms.qaqc.configName')} *</label>
                                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. water_quality_v1"
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                                </div>
                                <div>
                                    <label className="text-xs text-white/40 block mb-1">{t('sms.qaqc.contextWindow')} <span className="text-white/20">{t('sms.qaqc.contextWindowHint')}</span></label>
                                    <input value={newWindow} onChange={e => setNewWindow(e.target.value)} placeholder="5d"
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none" />
                                </div>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="rounded" />
                                <span className="text-sm text-white/50">{t('sms.qaqc.setAsDefault')}</span>
                            </label>
                            {createError && <p className="text-red-400 text-xs">{createError}</p>}
                            <div className="flex gap-2 justify-end">
                                <button onClick={() => setCreating(false)} className="px-4 py-2 text-sm rounded-lg border border-white/10 hover:bg-white/5">{t('sms.qaqc.cancel')}</button>
                                <button onClick={() => createMut.mutate()} disabled={!newName || !newWindow || createMut.isPending}
                                    className="px-4 py-2 text-sm rounded-lg bg-hydro-secondary/20 border border-hydro-secondary/30 text-hydro-secondary disabled:opacity-40 flex items-center gap-2">
                                    {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />} {t('sms.qaqc.create')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button onClick={() => setCreating(true)}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/10 text-sm text-white/25 hover:text-white/50 hover:border-white/20">
                            <Plus className="w-4 h-4" /> {t('sms.qaqc.addConfig')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Custom Functions Section
// ---------------------------------------------------------------------------

function CustomFunctionsSection({ token }: { token: string }) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [expanded, setExpanded] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const { data: functions, isLoading } = useQuery({
        queryKey: ["custom-saqc-functions"],
        queryFn: () => listCustomQAQCFunctions(token),
        enabled: expanded,
    });

    const deleteMut = useMutation({
        mutationFn: (name: string) => deleteCustomQAQCFunction(name, token),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-saqc-functions"] }),
    });

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setUploadError(null);
        try {
            await uploadCustomQAQCFunction(file, token);
            qc.invalidateQueries({ queryKey: ["custom-saqc-functions"] });
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    }

    return (
        <div className="border border-white/10 rounded-xl overflow-hidden">
            <div
                className="flex items-center gap-3 px-5 py-4 bg-white/3 cursor-pointer hover:bg-white/5"
                onClick={() => setExpanded(v => !v)}
            >
                {expanded ? <ChevronDown className="w-4 h-4 text-white/40" /> : <ChevronRight className="w-4 h-4 text-white/40" />}
                <FileCode className="w-4 h-4 text-hydro-secondary/70" />
                <div className="flex-1 min-w-0">
                    <p className="font-medium">{t('sms.qaqc.customFunctions')}</p>
                    <p className="text-xs text-white/35">{t('sms.qaqc.customFunctionsDesc')}</p>
                </div>
            </div>

            {expanded && (
                <div className="px-5 py-4 space-y-3 border-t border-white/5">
                    <div className="p-3 bg-white/3 border border-white/5 rounded-lg text-xs text-white/40 space-y-1">
                        <p className="text-white/55 font-medium">{t('sms.qaqc.customFunctionsHowTitle')}</p>
                        <p>{t('sms.qaqc.customFunctionsHowText')}</p>
                        <pre className="mt-1 p-2 bg-black/30 rounded font-mono text-[10px] leading-relaxed text-white/50">{`from saqc import register

@register()
def flagHighTurbidity(saqc, field, threshold=100, **kwargs):
    saqc[field] = saqc[field].where(saqc[field] < threshold)
    return saqc`}</pre>
                    </div>

                    {isLoading && <div className="flex items-center gap-2 text-white/30 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> {t('sms.qaqc.loading')}</div>}

                    {functions && functions.length === 0 && (
                        <p className="text-sm text-white/25 text-center py-2">{t('sms.qaqc.noCustomFunctions')}</p>
                    )}

                    {functions && functions.map(fn => (
                        <div key={fn.name} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-white/5 bg-white/2">
                            <FileCode className="w-4 h-4 text-white/30 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <span className="font-mono text-sm text-white">{fn.name}</span>
                                <span className="ml-2 text-xs text-white/30">{fn.filename} · {(fn.size / 1024).toFixed(1)} KB</span>
                                {fn.uploaded_at && <span className="ml-2 text-xs text-white/20">{new Date(fn.uploaded_at).toLocaleDateString()}</span>}
                            </div>
                            <button
                                onClick={() => deleteMut.mutate(fn.name)}
                                disabled={deleteMut.isPending}
                                className="p-1.5 text-white/30 hover:text-red-400"
                            >
                                {deleteMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                    ))}

                    {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}

                    <label className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-white/10 text-sm text-white/25 hover:text-white/50 hover:border-white/20 cursor-pointer">
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploading ? t('sms.qaqc.uploading') : t('sms.qaqc.uploadScript')}
                        <input type="file" accept=".py" className="hidden" onChange={handleFileChange} disabled={uploading} />
                    </label>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function SMSQAQCClient({ token }: Props) {
    const { t } = useTranslation();
    const { data: schemas, isLoading, error } = useQuery({
        queryKey: ["qaqc-schemas"],
        queryFn: () => listQAQCSchemas(token),
    });

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <div className="p-2 bg-hydro-primary/10 rounded-xl border border-hydro-primary/20">
                        <FlaskConical className="text-hydro-secondary w-6 h-6" />
                    </div>
                    {t('sms.qaqc.title')}
                </h1>
                <p className="text-white/40 text-sm mt-1 ml-12">
                    {t('sms.qaqc.desc')}
                </p>
            </div>

            {/* How it works */}
            <div className="p-4 bg-white/3 border border-white/5 rounded-xl text-xs text-white/40 space-y-1.5">
                <p className="text-white/60 font-medium text-sm">{t('sms.qaqc.howItWorksTitle')}</p>
                <p>{t('sms.qaqc.howItWorksText1')}</p>
                <p>{t('sms.qaqc.howItWorksText2')}</p>
            </div>

            {isLoading && <div className="flex items-center gap-2 text-white/30 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> {t('sms.qaqc.loading')}</div>}
            {error && <p className="text-red-400 text-sm">{error instanceof Error ? error.message : "Failed to load"}</p>}
            {schemas && schemas.length === 0 && (
                <div className="text-center py-16 text-white/25 space-y-2">
                    <FlaskConical className="w-12 h-12 mx-auto opacity-30" />
                    <p>{t('sms.qaqc.noSchemas')}</p>
                </div>
            )}
            {schemas && (
                <div className="space-y-3">
                    {schemas.map(s => <SchemaSection key={s.id} schema={s} token={token} />)}
                </div>
            )}

            {/* Custom functions */}
            <div className="mt-2">
                <p className="text-xs text-white/25 uppercase tracking-wider mb-2 px-1">{t('sms.qaqc.customFunctions')}</p>
                <CustomFunctionsSection token={token} />
            </div>
        </div>
    );
}
