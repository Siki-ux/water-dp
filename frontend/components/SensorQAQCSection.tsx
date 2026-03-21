"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Plus, Trash2, Play, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
    getThingQAQC,
    createThingQAQC,
    deleteThingQAQC,
    addThingQAQCTest,
    deleteThingQAQCTest,
    triggerThingQAQC,
    type QAQCConfig,
    type QAQCTest,
} from "@/lib/qaqc-api";
import { SAQC_FUNCTIONS, getSaQCFunction, CUSTOM_FUNCTION_SENTINEL } from "@/lib/saqc-functions";
import { useTranslation } from "@/lib/i18n";

interface Props {
    sensorUuid: string;
    token: string;
}

function TestRow({ test, sensorUuid, token }: { test: QAQCTest; sensorUuid: string; token: string }) {
    const qc = useQueryClient();
    const del = useMutation({
        mutationFn: () => deleteThingQAQCTest(sensorUuid, test.id, token),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["thing-qaqc", sensorUuid] }),
    });

    const fnDef = getSaQCFunction(test.function);

    return (
        <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-black/20 border border-white/5">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-violet-300">{test.function}</span>
                    {test.name && <span className="text-xs text-white/50">— {test.name}</span>}
                    {test.position != null && (
                        <span className="text-xs text-white/30">#{test.position}</span>
                    )}
                </div>
                {test.args && Object.keys(test.args).length > 0 && (
                    <div className="text-[10px] font-mono text-white/40 mt-0.5 truncate">
                        {Object.entries(test.args).map(([k, v]) => `${k}=${v}`).join(", ")}
                    </div>
                )}
            </div>
            <button
                onClick={() => del.mutate()}
                disabled={del.isPending}
                className="ml-3 p-1 text-white/30 hover:text-red-400 transition-colors"
                title="Delete test"
            >
                {del.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
        </div>
    );
}

function AddTestForm({ sensorUuid, token, onDone }: { sensorUuid: string; token: string; onDone: () => void }) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [selectedFunc, setSelectedFunc] = useState(SAQC_FUNCTIONS[0].name);
    const [customFunc, setCustomFunc] = useState("");
    const [testName, setTestName] = useState("");
    const [position, setPosition] = useState("");
    const [paramValues, setParamValues] = useState<Record<string, string>>({});
    const [rawArgs, setRawArgs] = useState("");
    const [useRaw, setUseRaw] = useState(false);

    const isCustom = selectedFunc === CUSTOM_FUNCTION_SENTINEL;
    const fnDef = getSaQCFunction(selectedFunc);

    const add = useMutation({
        mutationFn: () => {
            const funcName = isCustom ? customFunc : selectedFunc;
            let args: Record<string, unknown> | null = null;
            if (useRaw && rawArgs.trim()) {
                try { args = JSON.parse(rawArgs); } catch { throw new Error("Invalid JSON in args"); }
            } else if (fnDef) {
                const built: Record<string, unknown> = {};
                for (const p of fnDef.params) {
                    const v = paramValues[p.name];
                    if (v !== undefined && v !== "") {
                        built[p.name] = p.type === "number" ? Number(v) : p.type === "boolean" ? v === "true" : v;
                    }
                }
                if (Object.keys(built).length > 0) args = built;
            }
            return addThingQAQCTest(sensorUuid, {
                function: funcName,
                name: testName || null,
                position: position ? Number(position) : null,
                args,
                streams: null,
            }, token);
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["thing-qaqc", sensorUuid] });
            onDone();
        },
    });

    return (
        <div className="border border-white/10 rounded-lg p-4 space-y-3 bg-black/20">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs text-white/50 mb-1">{t('sms.qaqc.functionLabel')}</label>
                    <select
                        value={selectedFunc}
                        onChange={e => { setSelectedFunc(e.target.value); setParamValues({}); }}
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                    >
                        {SAQC_FUNCTIONS.map(f => (
                            <option key={f.name} value={f.name}>{f.label}</option>
                        ))}
                        <option value={CUSTOM_FUNCTION_SENTINEL}>Custom…</option>
                    </select>
                </div>
                {isCustom && (
                    <div>
                        <label className="block text-xs text-white/50 mb-1">{t('sms.qaqc.customFuncName')}</label>
                        <input
                            value={customFunc}
                            onChange={e => setCustomFunc(e.target.value)}
                            placeholder="e.g. flagRange"
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/20"
                        />
                    </div>
                )}
                <div>
                    <label className="block text-xs text-white/50 mb-1">{t('sms.qaqc.label')}</label>
                    <input
                        value={testName}
                        onChange={e => setTestName(e.target.value)}
                        placeholder="My range check"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/20"
                    />
                </div>
                <div>
                    <label className="block text-xs text-white/50 mb-1">{t('sms.qaqc.positionLabel')}</label>
                    <input
                        type="number"
                        value={position}
                        onChange={e => setPosition(e.target.value)}
                        placeholder="1"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/20"
                    />
                </div>
            </div>

            {/* Function description */}
            {!isCustom && fnDef && (
                <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 px-3 py-2 space-y-1">
                    <p className="text-xs font-medium text-violet-300/70">{fnDef.description}</p>
                    <p className="text-xs text-white/35 leading-relaxed">{fnDef.whenToUse}</p>
                </div>
            )}

            {/* Parameter form */}
            {!isCustom && fnDef && fnDef.params.length > 0 && !useRaw && (
                <div className="grid grid-cols-2 gap-2">
                    {fnDef.params.map(p => (
                        <div key={p.name}>
                            <label className="block text-xs text-white/50 mb-1">
                                {p.name}
                                {p.required && <span className="text-red-400 ml-0.5">*</span>}
                                {p.default !== undefined && <span className="text-white/30 ml-1">(default: {String(p.default)})</span>}
                            </label>
                            {p.type === "boolean" ? (
                                <select
                                    value={paramValues[p.name] ?? ""}
                                    onChange={e => setParamValues(v => ({ ...v, [p.name]: e.target.value }))}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
                                >
                                    <option value="">— use default —</option>
                                    <option value="true">true</option>
                                    <option value="false">false</option>
                                </select>
                            ) : (
                                <input
                                    type={p.type === "number" ? "number" : "text"}
                                    value={paramValues[p.name] ?? ""}
                                    onChange={e => setParamValues(v => ({ ...v, [p.name]: e.target.value }))}
                                    placeholder={p.placeholder ?? String(p.default ?? "")}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/20"
                                />
                            )}
                            <p className="text-[10px] text-white/30 mt-0.5 leading-snug">{p.description}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Raw JSON toggle */}
            <div>
                <button
                    type="button"
                    onClick={() => setUseRaw(r => !r)}
                    className="text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                    {useRaw ? t('sms.qaqc.useFormToggle') : t('sms.qaqc.advancedJson')}
                </button>
                {useRaw && (
                    <textarea
                        value={rawArgs}
                        onChange={e => setRawArgs(e.target.value)}
                        placeholder='{"min": 0, "max": 100}'
                        rows={3}
                        className="mt-2 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white placeholder-white/20"
                    />
                )}
            </div>

            {add.error && (
                <p className="text-xs text-red-400">{String(add.error)}</p>
            )}

            <div className="flex gap-2">
                <button
                    onClick={() => add.mutate()}
                    disabled={add.isPending || (isCustom && !customFunc.trim())}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                    {add.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    {t('sms.qaqc.addTest')}
                </button>
                <button
                    onClick={onDone}
                    className="px-4 py-1.5 text-white/50 hover:text-white text-sm rounded-lg transition-colors"
                >
                    {t('sms.qaqc.cancel')}
                </button>
            </div>
        </div>
    );
}

function ConfigView({ config, sensorUuid, token }: { config: QAQCConfig; sensorUuid: string; token: string }) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [showTests, setShowTests] = useState(true);
    const [addingTest, setAddingTest] = useState(false);
    const [triggerSuccess, setTriggerSuccess] = useState(false);

    const unassign = useMutation({
        mutationFn: () => deleteThingQAQC(sensorUuid, token),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["thing-qaqc", sensorUuid] }),
    });

    const trigger = useMutation({
        mutationFn: () => triggerThingQAQC(sensorUuid, token),
        onSuccess: () => {
            setTriggerSuccess(true);
            setTimeout(() => setTriggerSuccess(false), 3000);
        },
    });

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <span className="text-sm font-medium text-white">{config.name}</span>
                    <span className="ml-2 text-xs text-white/40">{t('sms.qaqc.window')}: {config.context_window}</span>
                </div>
                <div className="flex items-center gap-2">
                    {triggerSuccess && (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {t('sms.qaqc.triggered')}
                        </span>
                    )}
                    <button
                        onClick={() => trigger.mutate()}
                        disabled={trigger.isPending}
                        className="flex items-center gap-1.5 px-3 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 text-xs rounded-lg border border-green-500/20 transition-colors"
                        title="Run QA/QC now for this sensor"
                    >
                        {trigger.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        {t('sms.qaqc.runNow')}
                    </button>
                    <button
                        onClick={() => unassign.mutate()}
                        disabled={unassign.isPending}
                        className="flex items-center gap-1.5 px-3 py-1 bg-red-600/10 hover:bg-red-600/30 text-red-400 text-xs rounded-lg border border-red-500/20 transition-colors"
                        title={t('sms.qaqc.removeOverride')}
                    >
                        {unassign.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        {t('sms.qaqc.removeOverride')}
                    </button>
                </div>
            </div>

            <div>
                <button
                    onClick={() => setShowTests(s => !s)}
                    className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors mb-2"
                >
                    {showTests ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    {config.tests.length} test{config.tests.length !== 1 ? "s" : ""}
                </button>

                {showTests && (
                    <div className="space-y-1.5 ml-1">
                        {config.tests.map(t => (
                            <TestRow key={t.id} test={t} sensorUuid={sensorUuid} token={token} />
                        ))}
                        {addingTest ? (
                            <AddTestForm sensorUuid={sensorUuid} token={token} onDone={() => setAddingTest(false)} />
                        ) : (
                            <button
                                onClick={() => setAddingTest(true)}
                                className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors mt-2"
                            >
                                <Plus className="w-3 h-3" /> {t('sms.qaqc.addTestBtn')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function CreateForm({ sensorUuid, token }: { sensorUuid: string; token: string }) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [name, setName] = useState("");
    const [window, setWindow] = useState("5d");

    const create = useMutation({
        mutationFn: () => createThingQAQC(sensorUuid, { name, context_window: window }, token),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["thing-qaqc", sensorUuid] }),
    });

    return (
        <div className="space-y-3">
            <p className="text-sm text-white/60">{t('sms.qaqc.noOverride')}</p>
            <div className="flex gap-3 items-end">
                <div className="flex-1">
                    <label className="block text-xs text-white/50 mb-1">{t('sms.qaqc.configNameLabel')}</label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. river-gauge-override"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20"
                    />
                </div>
                <div>
                    <label className="block text-xs text-white/50 mb-1">{t('sms.qaqc.contextWindowLabel')}</label>
                    <input
                        value={window}
                        onChange={e => setWindow(e.target.value)}
                        placeholder="5d"
                        className="w-32 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20"
                    />
                </div>
                <button
                    onClick={() => create.mutate()}
                    disabled={create.isPending || !name.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                    {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {t('sms.qaqc.createOverride')}
                </button>
            </div>
            {create.error && <p className="text-xs text-red-400">{String(create.error)}</p>}
        </div>
    );
}

export default function SensorQAQCSection({ sensorUuid, token }: Props) {
    const { t } = useTranslation();
    const { data, isLoading, isError } = useQuery<QAQCConfig | null>({
        queryKey: ["thing-qaqc", sensorUuid],
        queryFn: () => getThingQAQC(sensorUuid, token),
    });

    return (
        <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5">
                <FlaskConical className="w-5 h-5 text-violet-400" />
                <h2 className="text-lg font-semibold text-white">{t('sms.qaqc.sensorOverrideTitle')}</h2>
                <span className="text-xs text-white/30 ml-auto">{t('sms.qaqc.sensorOverrideSubtitle')}</span>
            </div>

            {isLoading && (
                <div className="flex items-center gap-2 text-white/40 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
            )}

            {isError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" /> {t('sms.qaqc.loadFailed')}
                </div>
            )}

            {!isLoading && !isError && data === null && (
                <CreateForm sensorUuid={sensorUuid} token={token} />
            )}

            {!isLoading && !isError && data && (
                <ConfigView config={data} sensorUuid={sensorUuid} token={token} />
            )}
        </div>
    );
}
