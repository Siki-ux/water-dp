"use client";

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2, Plus, Bell, AlertTriangle, CheckCircle, Trash2, Zap, ArrowUpRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useProjectPermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';

interface AlertDefinition {
    id: string;
    name: string;
    description?: string;
    alert_type: string;
    threshold: number;
    station_id?: string;
    script_id?: string;
    is_active: boolean;
    target_id?: string;
    sensor_id?: string;
    datastream_id?: string;
}

interface TriggeredAlert {
    id: string;
    definition_id: string;
    timestamp: string;
    details: any;
    status: string;
    definition: AlertDefinition;
}

interface AlertsClientProps {
}

export default function AlertsClient({}: AlertsClientProps) {
    const params = useParams();
    const projectId = params.id as string;
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'rules' | 'history'>('rules');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const { data: perms } = useProjectPermissions(projectId);
    const canEditAlerts = perms?.can_edit_alerts ?? false;

    return (
        <div className="flex h-full flex-col p-6 gap-6 bg-background overflow-hidden">
            {/* Header Section */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-[var(--foreground)] flex items-center gap-3">
                            <div className="p-2 bg-hydro-primary/10 rounded-xl border border-hydro-primary/20">
                                <Bell className="text-hydro-secondary w-6 h-6" />
                            </div>
                            {t('alerts.title')}
                        </h1>
                        <p className="text-[var(--foreground)]/40 text-sm mt-1 ml-12">
                            {t('alerts.desc')}
                        </p>
                    </div>

                    {canEditAlerts && (
                        <button
                            onClick={() => setIsCreateOpen(true)}
                            className="px-5 py-2.5 bg-hydro-primary hover:bg-hydro-primary/90 text-[var(--foreground)] rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-hydro-primary/20 transition-all active:scale-95"
                        >
                            <Plus size={18} /> {t('alerts.newRule')}
                        </button>
                    )}
                </div>

                {/* Tabs Navigation */}
                <div className="flex items-center gap-8 border-b border-border px-2">
                    <button
                        onClick={() => setActiveTab('rules')}
                        className={`pb-4 text-sm font-bold transition-all relative ${activeTab === 'rules'
                            ? 'text-[var(--foreground)]'
                            : 'text-[var(--foreground)]/40 hover:text-[var(--foreground)]/60'
                            }`}
                    >
                        {t('alerts.tabRules')}
                        {activeTab === 'rules' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-hydro-primary shadow-[0_0_8px_rgba(0,112,243,0.5)]" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`pb-4 text-sm font-bold transition-all relative ${activeTab === 'history'
                            ? 'text-[var(--foreground)]'
                            : 'text-[var(--foreground)]/40 hover:text-[var(--foreground)]/60'
                            }`}
                    >
                        {t('alerts.tabHistory')}
                        {activeTab === 'history' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-hydro-primary shadow-[0_0_8px_rgba(0,112,243,0.5)]" />
                        )}
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 bg-muted/50 backdrop-blur-sm border border-border rounded-2xl overflow-hidden shadow-2xl">
                {activeTab === 'rules' ? (
                    <RulesList projectId={projectId} queryClient={queryClient} canEdit={canEditAlerts} />
                ) : (
                    <HistoryList projectId={projectId} />
                )}
            </div>

            {isCreateOpen && (
                <RuleModal
                    projectId={projectId}
                    onClose={() => setIsCreateOpen(false)}
                    onSuccess={() => {
                        queryClient.invalidateQueries({ queryKey: ['alertDefinitions', projectId] });
                        setIsCreateOpen(false);
                    }}
                />
            )}
        </div>
    );
}

// --- Sub-components ---

// --- Sub-components ---

function RulesList({ projectId, queryClient, canEdit }: { projectId: string, queryClient: any, canEdit: boolean }) {
    const { t } = useTranslation();
    const [editingRule, setEditingRule] = useState<AlertDefinition | null>(null);

    const { data: rules = [], isLoading } = useQuery({
        queryKey: ['alertDefinitions', projectId],
        queryFn: async () => {
            const res = await api.get(`/alerts/definitions/${projectId}`);
            return res.data as AlertDefinition[];
        }
    });

    const testTriggerMutation = useMutation({
        mutationFn: async (defId: string) => {
            const res = await api.post('/alerts/test-trigger', { definition_id: defId, message: "Manual test alert trigger" });
            return res.data;
        },
        onSuccess: () => {
            alert("Test alert triggered! Check History.");
        }
    });

    const toggleMutation = useMutation({
        mutationFn: async (rule: AlertDefinition) => {
            const res = await api.put(`/alerts/definitions/${rule.id}`, { is_active: !rule.is_active });
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alertDefinitions', projectId] });
        }
    });

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: async (ruleId: string) => {
            // Currently backend DELETE endpoint might be missing or strictly authorized. 
            // Logic suggests strictly implementing what we have. 
            // Assuming we might need to add DELETE later, or hide button if not supported.
            // User requested "Update", not explicitly Delete, but "update them" implies management.
            // Let's implement Delete if endpoint exists, or just skip for now to focus on Edit.
            // Actually backend usually has generic delete or we implemented active/passive. 
            // Let's hold on Delete until confirmed.
            // Just Edit for now.
            return;
        }
    });

    if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-hydro-primary" /></div>;

    return (
        <>
            {rules.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-[var(--foreground)]/30">
                    <Bell size={48} className="mb-4 opacity-50" />
                    <p>{t('alerts.noRules')}</p>
                </div>
            ) : (
                <div className="overflow-auto h-full">
                    <table className="w-full text-left text-sm text-[var(--foreground)]/70">
                        <thead className="bg-muted/50 text-[var(--foreground)]/40 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 font-medium">{t('alerts.colName')}</th>
                                <th className="px-6 py-3 font-medium">{t('alerts.colCondition')}</th>
                                <th className="px-6 py-3 font-medium">{t('alerts.colThreshold')}</th>
                                <th className="px-6 py-3 font-medium">{t('alerts.colStatus')}</th>
                                <th className="px-6 py-3 font-medium text-right">{t('alerts.colActions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {rules.map(rule => (
                                <tr key={rule.id} className="hover:bg-muted/50">
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-[var(--foreground)]">{rule.name}</div>
                                        <div className="text-[10px] text-[var(--foreground)]/40">
                                            {rule.description}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs">{rule.alert_type}</td>
                                    <td className="px-6 py-4 font-mono text-xs">
                                        {rule.alert_type === 'qaqc' ? (
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-violet-400 font-semibold">
                                                    &gt;{(rule as any).conditions?.threshold_pct ?? 10}% {(rule as any).conditions?.flag_level ?? 'BAD'}
                                                </span>
                                                <span className="text-[10px] text-[var(--foreground)]/30">{t('alerts.lastHours').replace('{hours}', String((rule as any).conditions?.window_hours ?? 24))}</span>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col">
                                                <span>{(rule as any).conditions?.operator} {(rule as any).conditions?.value}</span>
                                                {rule.datastream_id && <span className="text-[10px] text-[var(--foreground)]/30">DS ID: {rule.datastream_id}</span>}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {rule.is_active ? (
                                            <button
                                                onClick={() => canEdit && toggleMutation.mutate(rule)}
                                                disabled={!canEdit || toggleMutation.isPending}
                                                className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-wider hover:opacity-80 transition-opacity disabled:cursor-default"
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> {t('alerts.statusActive')}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => canEdit && toggleMutation.mutate(rule)}
                                                disabled={!canEdit || toggleMutation.isPending}
                                                className="text-[var(--foreground)]/30 text-xs font-bold uppercase tracking-wider hover:text-[var(--foreground)]/60 transition-colors disabled:cursor-default"
                                            >
                                                {t('alerts.statusDisabled')}
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        {canEdit && (
                                            <>
                                                <button
                                                    onClick={() => testTriggerMutation.mutate(rule.id)}
                                                    disabled={testTriggerMutation.isPending}
                                                    title="Trigger Test Alert"
                                                    className="p-2 hover:bg-white/10 text-yellow-400 rounded-lg transition-colors"
                                                >
                                                    <Zap size={16} />
                                                </button>
                                                <button
                                                    onClick={() => setEditingRule(rule)}
                                                    className="p-2 hover:bg-white/10 text-blue-400 rounded-lg transition-colors"
                                                    title="Edit Rule"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                                </button>
                                                <button className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {editingRule && (
                <RuleModal
                    projectId={projectId}
                    initialData={editingRule}
                    onClose={() => setEditingRule(null)}
                    onSuccess={() => {
                        queryClient.invalidateQueries({ queryKey: ['alertDefinitions', projectId] });
                        setEditingRule(null);
                    }}
                />
            )}
        </>
    );
}

function HistoryList({ projectId }: { projectId: string }) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { data: alerts = [], isLoading } = useQuery({
        queryKey: ['alertsHistory', projectId],
        queryFn: async () => {
            const res = await api.get(`/alerts/history/${projectId}`);
            return res.data as TriggeredAlert[];
        },
        refetchInterval: 5000
    });

    const acknowledgeMutation = useMutation({
        mutationFn: async (alertId: string) => {
            const res = await api.post(`/alerts/history/${alertId}/acknowledge`);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alertsHistory', projectId] });
            queryClient.invalidateQueries({ queryKey: ['activeAlertsCount'] }); // Optional but good practice if we cache count
        }
    });

    if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-hydro-primary" /></div>;

    if (alerts.length === 0) return (
        <div className="flex flex-col items-center justify-center h-full text-[var(--foreground)]/30">
            <CheckCircle size={48} className="mb-4 opacity-50" />
            <p>{t('alerts.noHistory')}</p>
        </div>
    );

    return (
        <div className="overflow-auto h-full">
            <table className="w-full text-left text-sm text-[var(--foreground)]/70">
                <thead className="bg-muted/50 text-[var(--foreground)]/40 sticky top-0 z-10">
                    <tr>
                        <th className="px-6 py-3 font-medium">{t('alerts.colTime')}</th>
                        <th className="px-6 py-3 font-medium">{t('alerts.colSource')}</th>
                        <th className="px-6 py-3 font-medium">{t('alerts.colStatus')}</th>
                        <th className="px-6 py-3 font-medium">{t('alerts.colDetails')}</th>
                        <th className="px-6 py-3 font-medium text-right">{t('alerts.colActions')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {alerts.map(alert => (
                        <tr key={alert.id} className="hover:bg-muted/50">
                            <td className="px-6 py-4 font-mono text-xs text-[var(--foreground)]/50">
                                {new Date(alert.timestamp).toLocaleString()}
                            </td>
                            <td className="px-6 py-4">
                                {alert.definition?.target_id ? (
                                    <Link
                                        href={`/projects/${projectId}/data?sensorId=${alert.definition.target_id}`}
                                        className="flex items-center gap-1 text-hydro-primary hover:underline font-medium"
                                    >
                                        {alert.definition.name}
                                        <ArrowUpRight size={12} />
                                    </Link>
                                ) : (
                                    <span className="text-[var(--foreground)]/50">{alert.definition?.name || t('alerts.unknownRule')}</span>
                                )}
                                <div className="text-[10px] text-[var(--foreground)]/30 truncate max-w-[150px]">
                                    {alert.definition?.id}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className={`flex items-center gap-1.5 font-bold ${alert.status === 'active' ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {alert.status === 'active' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                                    {alert.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-[var(--foreground)]/80 font-mono text-xs">
                                {typeof alert.details === 'string' ? alert.details : JSON.stringify(alert.details, null, 2)}
                            </td>
                            <td className="px-6 py-4 text-right">
                                {alert.status === 'active' && (
                                    <button
                                        onClick={() => acknowledgeMutation.mutate(alert.id)}
                                        disabled={acknowledgeMutation.isPending}
                                        className="text-xs bg-white/10 hover:bg-white/20 text-[var(--foreground)] px-3 py-1.5 rounded transition-colors border border-border"
                                    >
                                        {t('alerts.acknowledge')}
                                    </button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

interface RuleModalProps {
    projectId: string;
    onClose: () => void;
    onSuccess: () => void;
    initialData?: AlertDefinition;
}

function RuleModal({ projectId, onClose, onSuccess, initialData }: RuleModalProps) {
    const { t } = useTranslation();
    const isEdit = !!initialData;

    // Parse Initial Data
    const initType = (initialData as any)?.alert_type === 'qaqc' ? 'qaqc' : 'sensor';
    const initTargetId = (initialData as any)?.target_id || '';

    // Conditions parsing
    const conditions = (initialData as any)?.conditions || {};
    // For sensor
    const initCondition = conditions.operator === '>' ? 'threshold_gt' : (conditions.operator === '<' ? 'threshold_lt' : 'threshold_gt');
    const initThreshold = conditions.value || '0';
    // For qaqc
    const initFlagLevel = conditions.flag_level || 'BAD';
    const initThresholdPct = conditions.threshold_pct || 10;
    const initWindowHours = conditions.window_hours || 24;

    const [name, setName] = useState(initialData?.name || '');
    const [targetType, setTargetType] = useState<'sensor' | 'qaqc'>(initType);

    // For sensor
    const [stationId, setStationId] = useState(initTargetId);
    const [datastreamId, setDatastreamId] = useState((initialData as any)?.datastream_id || '');
    const [condition, setCondition] = useState(initCondition);
    const [threshold, setThreshold] = useState(String(initThreshold));

    // For qaqc
    const [qaqcSensorId, setQaqcSensorId] = useState(initTargetId);
    const [qaqcDatastreamId, setQaqcDatastreamId] = useState((initialData as any)?.datastream_id || '');
    const [flagLevel, setFlagLevel] = useState(initFlagLevel);
    const [thresholdPct, setThresholdPct] = useState(String(initThresholdPct));
    const [windowHours, setWindowHours] = useState(String(initWindowHours));

    // Fetch Sensors
    const { data: sensors = [] } = useQuery({
        queryKey: ['sensors', projectId],
        queryFn: async () => {
            const res = await api.get(`/projects/${projectId}/sensors`);
            return res.data;
        }
    });

    const mutation = useMutation({
        mutationFn: async () => {
            const body: any = {
                name,
                project_id: projectId,
                is_active: true,
                severity: "warning",
                description: `Rule for ${targetType}`
            };

            if (targetType === 'sensor') {
                body.target_id = stationId;
                body.sensor_id = stationId;
                body.datastream_id = datastreamId;
                body.alert_type = condition; // threshold_gt etc
                body.conditions = {
                    operator: condition === 'threshold_gt' ? '>' : '<',
                    value: parseFloat(threshold)
                };
            } else {
                body.target_id = qaqcSensorId;
                body.sensor_id = qaqcSensorId;
                body.datastream_id = qaqcDatastreamId;
                body.alert_type = 'qaqc';
                body.conditions = {
                    flag_level: flagLevel,
                    threshold_pct: parseFloat(thresholdPct),
                    window_hours: parseInt(windowHours),
                };
            }

            const url = isEdit
                ? `/alerts/definitions/${initialData?.id}`
                : `/alerts/definitions`;

            const res = isEdit
                ? await api.put(url, body)
                : await api.post(url, body);
            return res.data;
        },
        onSuccess,
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-xl font-bold text-[var(--foreground)] mb-6">{isEdit ? t('alerts.editRule') : t('alerts.newAlertRule')}</h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-[var(--foreground)]/70 mb-1">{t('alerts.ruleName')}</label>
                        <input
                            value={name} onChange={e => setName(e.target.value)}
                            className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                            placeholder={t('alerts.ruleNamePlaceholder')}
                        />
                    </div>

                    {/* Target Type Toggle */}
                    <div className="flex bg-muted/50 p-1 rounded-lg">
                        <button
                            onClick={() => setTargetType('sensor')}
                            className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${targetType === 'sensor' ? 'bg-hydro-primary text-[var(--foreground)]' : 'text-[var(--foreground)]/50 hover:text-[var(--foreground)]'
                                }`}
                        >
                            SENSOR
                        </button>
                        <button
                            onClick={() => setTargetType('qaqc')}
                            className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${targetType === 'qaqc' ? 'bg-hydro-primary text-[var(--foreground)]' : 'text-[var(--foreground)]/50 hover:text-[var(--foreground)]'
                                }`}
                        >
                            QA/QC
                        </button>
                    </div>

                    {targetType === 'sensor' && (
                        <>
                            <div>
                                <label className="block text-xs font-semibold text-[var(--foreground)]/70 mb-1">{t('alerts.selectSensor')}</label>
                                <select
                                    value={stationId} onChange={e => setStationId(e.target.value)}
                                    className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                >
                                    <option value="">{t('alerts.chooseSensor')}</option>
                                    {sensors.map((s: any) => (
                                        <option key={s.thing_id} value={s.thing_id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            {stationId && (
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--foreground)]/70 mb-1">{t('alerts.selectDatastream')}</label>
                                    <select
                                        value={datastreamId} onChange={e => setDatastreamId(e.target.value)}
                                        className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                    >
                                        <option value="">{t('alerts.chooseDatastream')}</option>
                                        {sensors.find((s: any) => s.thing_id === stationId)?.datastreams?.map((ds: any) => (
                                            <option key={ds.datastream_id} value={ds.datastream_id}>{ds.name} ({ds.unit_of_measurement.symbol})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-semibold text-[var(--foreground)]/70 mb-1">{t('alerts.condition')}</label>
                                <select
                                    value={condition} onChange={e => setCondition(e.target.value)}
                                    className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                >
                                    <option value="threshold_gt">{t('alerts.conditionGt')}</option>
                                    <option value="threshold_lt">{t('alerts.conditionLt')}</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[var(--foreground)]/70 mb-1">{t('alerts.thresholdValue')}</label>
                                <input
                                    type="number"
                                    value={threshold} onChange={e => setThreshold(e.target.value)}
                                    className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                />
                            </div>
                        </>
                    )}

                    {targetType === 'qaqc' && (
                        <>
                            <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded text-violet-400 text-xs">
                                {t('alerts.qaqcDesc')}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[var(--foreground)]/70 mb-1">{t('alerts.selectSensor')}</label>
                                <select
                                    value={qaqcSensorId} onChange={e => { setQaqcSensorId(e.target.value); setQaqcDatastreamId(''); }}
                                    className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                >
                                    <option value="">{t('alerts.chooseSensor')}</option>
                                    {sensors.map((s: any) => (
                                        <option key={s.thing_id} value={s.thing_id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            {qaqcSensorId && (
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--foreground)]/70 mb-1">{t('alerts.selectDatastream')}</label>
                                    <select
                                        value={qaqcDatastreamId} onChange={e => setQaqcDatastreamId(e.target.value)}
                                        className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                    >
                                        <option value="">{t('alerts.chooseDatastream')}</option>
                                        {sensors.find((s: any) => s.thing_id === qaqcSensorId)?.datastreams?.map((ds: any) => (
                                            <option key={ds.datastream_id} value={ds.datastream_id}>{ds.name} ({ds.unit_of_measurement.symbol})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-semibold text-[var(--foreground)]/70 mb-1">{t('alerts.flagLevel')}</label>
                                <select
                                    value={flagLevel} onChange={e => setFlagLevel(e.target.value)}
                                    className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                >
                                    <option value="BAD">{t('alerts.flagBad')}</option>
                                    <option value="QUESTIONABLE">{t('alerts.flagQuestionable')}</option>
                                    <option value="ANY">{t('alerts.flagAny')}</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--foreground)]/70 mb-1">{t('alerts.thresholdPct')}</label>
                                    <input
                                        type="number" min="0" max="100"
                                        value={thresholdPct} onChange={e => setThresholdPct(e.target.value)}
                                        className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                    />
                                    <p className="text-[10px] text-[var(--foreground)]/40 mt-1">{t('alerts.thresholdPctHint')}</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--foreground)]/70 mb-1">{t('alerts.windowHours')}</label>
                                    <input
                                        type="number" min="1"
                                        value={windowHours} onChange={e => setWindowHours(e.target.value)}
                                        className="w-full bg-muted/50 border border-border rounded px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                    />
                                    <p className="text-[10px] text-[var(--foreground)]/40 mt-1">{t('alerts.windowHoursHint')}</p>
                                </div>
                            </div>
                        </>
                    )}

                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-[var(--foreground)]/60 hover:text-[var(--foreground)]">{t('alerts.cancel')}</button>
                    <button
                        onClick={() => mutation.mutate()}
                        disabled={mutation.isPending || (targetType === 'sensor' && (!stationId || !datastreamId)) || (targetType === 'qaqc' && (!qaqcSensorId || !qaqcDatastreamId))}
                        className="px-4 py-2 bg-hydro-primary hover:bg-hydro-primary/90 text-[var(--foreground)] rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
                        {isEdit ? t('alerts.updateRule') : t('alerts.createRule')}
                    </button>
                </div>
            </div>
        </div>
    );
}
