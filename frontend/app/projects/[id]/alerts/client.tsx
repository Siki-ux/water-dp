"use client";

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2, Plus, Bell, AlertTriangle, CheckCircle, Trash2, Zap, ArrowUpRight } from 'lucide-react';

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
    token: string;
}

export default function AlertsClient({ token }: AlertsClientProps) {
    const params = useParams();
    const projectId = params.id as string;
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'rules' | 'history'>('rules');
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    return (
        <div className="flex h-full flex-col p-6 gap-6 bg-hydro-dark/50 overflow-hidden">
            {/* Header Section */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            <div className="p-2 bg-hydro-primary/10 rounded-xl border border-hydro-primary/20">
                                <Bell className="text-hydro-secondary w-6 h-6" />
                            </div>
                            Alerts & Monitoring
                        </h1>
                        <p className="text-white/40 text-sm mt-1 ml-12">
                            Manage your project thresholds and view alert history.
                        </p>
                    </div>

                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="px-5 py-2.5 bg-hydro-primary hover:bg-hydro-primary/90 text-white rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg shadow-hydro-primary/20 transition-all active:scale-95"
                    >
                        <Plus size={18} /> New Rule
                    </button>
                </div>

                {/* Tabs Navigation */}
                <div className="flex items-center gap-8 border-b border-white/10 px-2">
                    <button
                        onClick={() => setActiveTab('rules')}
                        className={`pb-4 text-sm font-bold transition-all relative ${activeTab === 'rules'
                            ? 'text-white'
                            : 'text-white/40 hover:text-white/60'
                            }`}
                    >
                        Alert Rules
                        {activeTab === 'rules' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-hydro-primary shadow-[0_0_8px_rgba(0,112,243,0.5)]" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`pb-4 text-sm font-bold transition-all relative ${activeTab === 'history'
                            ? 'text-white'
                            : 'text-white/40 hover:text-white/60'
                            }`}
                    >
                        History
                        {activeTab === 'history' && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-hydro-primary shadow-[0_0_8px_rgba(0,112,243,0.5)]" />
                        )}
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 bg-black/20 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                {activeTab === 'rules' ? (
                    <RulesList projectId={projectId} token={token} queryClient={queryClient} />
                ) : (
                    <HistoryList projectId={projectId} token={token} />
                )}
            </div>

            {isCreateOpen && (
                <RuleModal
                    projectId={projectId}
                    token={token}
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

function RulesList({ projectId, token, queryClient }: { projectId: string, token: string, queryClient: any }) {
    const [editingRule, setEditingRule] = useState<AlertDefinition | null>(null);

    const { data: rules = [], isLoading } = useQuery({
        queryKey: ['alertDefinitions', projectId],
        queryFn: async () => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/alerts/definitions/${projectId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch rules');
            return await res.json() as AlertDefinition[];
        }
    });

    const testTriggerMutation = useMutation({
        mutationFn: async (defId: string) => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/alerts/test-trigger`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ definition_id: defId, message: "Manual test alert trigger" })
            });
            if (!res.ok) throw new Error('Failed to trigger test');
            return await res.json();
        },
        onSuccess: () => {
            alert("Test alert triggered! Check History.");
        }
    });

    const toggleMutation = useMutation({
        mutationFn: async (rule: AlertDefinition) => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/alerts/definitions/${rule.id}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_active: !rule.is_active })
            });
            if (!res.ok) throw new Error('Failed to update rule');
            return await res.json();
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
                <div className="flex flex-col items-center justify-center h-full text-white/30">
                    <Bell size={48} className="mb-4 opacity-50" />
                    <p>No alert rules defined.</p>
                </div>
            ) : (
                <div className="overflow-auto h-full">
                    <table className="w-full text-left text-sm text-white/70">
                        <thead className="bg-white/5 text-white/40 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 font-medium">Name</th>
                                <th className="px-6 py-3 font-medium">Condition</th>
                                <th className="px-6 py-3 font-medium">Threshold</th>
                                <th className="px-6 py-3 font-medium">Status</th>
                                <th className="px-6 py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {rules.map(rule => (
                                <tr key={rule.id} className="hover:bg-white/5">
                                    <td className="px-6 py-4">
                                        <div className="font-semibold text-white">{rule.name}</div>
                                        <div className="text-[10px] text-white/40">
                                            {rule.sensor_id ? `Sensor: ${rule.sensor_id}` : rule.description}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs">{rule.alert_type}</td>
                                    <td className="px-6 py-4 font-mono">
                                        {/* Display logic for complex conditions */}
                                        {rule.alert_type === 'computation_result'
                                            ? `${(rule as any).conditions?.field ?? '?'} ${(rule as any).conditions?.operator} ${(rule as any).conditions?.value}`
                                            : (
                                                <div className="flex flex-col">
                                                    <span>{(rule as any).conditions?.operator} {(rule as any).conditions?.value}</span>
                                                    {rule.datastream_id && <span className="text-[10px] text-white/30">DS ID: {rule.datastream_id}</span>}
                                                </div>
                                            )
                                        }
                                    </td>
                                    <td className="px-6 py-4">
                                        {rule.is_active ? (
                                            <button
                                                onClick={() => toggleMutation.mutate(rule)}
                                                disabled={toggleMutation.isPending}
                                                className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-wider hover:opacity-80 transition-opacity"
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => toggleMutation.mutate(rule)}
                                                disabled={toggleMutation.isPending}
                                                className="text-white/30 text-xs font-bold uppercase tracking-wider hover:text-white/60 transition-colors"
                                            >
                                                Disabled
                                            </button>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
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
                    token={token}
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

// Imports moved to top
function HistoryList({ projectId, token }: { projectId: string, token: string }) {
    const queryClient = useQueryClient();
    const { data: alerts = [], isLoading } = useQuery({
        queryKey: ['alertsHistory', projectId],
        queryFn: async () => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/alerts/history/${projectId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to fetch alerts');
            return await res.json() as TriggeredAlert[];
        },
        refetchInterval: 5000
    });

    const acknowledgeMutation = useMutation({
        mutationFn: async (alertId: string) => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/alerts/history/${alertId}/acknowledge`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Failed to acknowledge alert');
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['alertsHistory', projectId] });
            queryClient.invalidateQueries({ queryKey: ['activeAlertsCount'] }); // Optional but good practice if we cache count
        }
    });

    if (isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-hydro-primary" /></div>;

    if (alerts.length === 0) return (
        <div className="flex flex-col items-center justify-center h-full text-white/30">
            <CheckCircle size={48} className="mb-4 opacity-50" />
            <p>No triggered alerts in history.</p>
        </div>
    );

    return (
        <div className="overflow-auto h-full">
            <table className="w-full text-left text-sm text-white/70">
                <thead className="bg-white/5 text-white/40 sticky top-0 z-10">
                    <tr>
                        <th className="px-6 py-3 font-medium">Time</th>
                        <th className="px-6 py-3 font-medium">Source</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-6 py-3 font-medium">Details</th>
                        <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {alerts.map(alert => (
                        <tr key={alert.id} className="hover:bg-white/5">
                            <td className="px-6 py-4 font-mono text-xs text-white/50">
                                {new Date(alert.timestamp).toLocaleString()}
                            </td>
                            <td className="px-6 py-4">
                                {alert.definition?.target_id ? (
                                    <Link
                                        href={
                                            alert.definition.alert_type === 'computation_result'
                                                ? `/projects/${projectId}/computations?scriptId=${alert.definition.target_id}`
                                                : `/projects/${projectId}/data?sensorId=${alert.definition.target_id}`
                                        }
                                        className="flex items-center gap-1 text-hydro-primary hover:underline font-medium"
                                    >
                                        {alert.definition.name}
                                        <ArrowUpRight size={12} />
                                    </Link>
                                ) : (
                                    <span className="text-white/50">{alert.definition?.name || "Unknown Rule"}</span>
                                )}
                                <div className="text-[10px] text-white/30 truncate max-w-[150px]">
                                    {alert.definition?.id}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className={`flex items-center gap-1.5 font-bold ${alert.status === 'active' ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {alert.status === 'active' ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                                    {alert.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-white/80 font-mono text-xs">
                                {typeof alert.details === 'string' ? alert.details : JSON.stringify(alert.details, null, 2)}
                            </td>
                            <td className="px-6 py-4 text-right">
                                {alert.status === 'active' && (
                                    <button
                                        onClick={() => acknowledgeMutation.mutate(alert.id)}
                                        disabled={acknowledgeMutation.isPending}
                                        className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded transition-colors border border-white/10"
                                    >
                                        Acknowledge
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
    token: string;
    onClose: () => void;
    onSuccess: () => void;
    initialData?: AlertDefinition;
}

function RuleModal({ projectId, token, onClose, onSuccess, initialData }: RuleModalProps) {
    const isEdit = !!initialData;

    // Parse Initial Data
    const initType = (initialData as any)?.alert_type === 'computation_result' ? 'script' : 'sensor';
    const initTargetId = (initialData as any)?.target_id || '';

    // Conditions parsing
    const conditions = (initialData as any)?.conditions || {};
    // For sensor
    const initCondition = conditions.operator === '>' ? 'threshold_gt' : (conditions.operator === '<' ? 'threshold_lt' : 'threshold_gt');
    const initThreshold = conditions.value || '0';
    // For script
    const initManual = conditions.field ? `${conditions.field} ${conditions.operator} ${conditions.value}` : 'risk_score > 50';


    const [name, setName] = useState(initialData?.name || '');
    const [targetType, setTargetType] = useState<'sensor' | 'script'>(initType);

    // For sensor
    const [stationId, setStationId] = useState(initTargetId);
    const [datastreamId, setDatastreamId] = useState((initialData as any)?.datastream_id || '');
    const [condition, setCondition] = useState(initCondition);
    const [threshold, setThreshold] = useState(String(initThreshold));

    // For script
    const [scriptId, setScriptId] = useState(initTargetId);
    const [manualCondition, setManualCondition] = useState(initManual);

    // Fetch Sensors
    const { data: sensors = [] } = useQuery({
        queryKey: ['sensors', projectId],
        queryFn: async () => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/projects/${projectId}/sensors`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return [];
            return await res.json();
        }
    });

    // Fetch Scripts
    const { data: scripts = [] } = useQuery({
        queryKey: ['scripts', projectId],
        queryFn: async () => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/computations/scripts?project_id=${projectId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return [];
            return await res.json();
        }
    });

    // Helper to parse "risk_score > 50"
    const parseCondition = (expr: string) => {
        const match = expr.match(/^(\w+)\s*(>|<|==)\s*([\d\.]+)$/);
        if (!match) return null;
        return {
            field: match[1],
            operator: match[2],
            value: parseFloat(match[3])
        };
    };

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
                body.target_id = scriptId;
                body.alert_type = 'computation_result';

                const parsed = parseCondition(manualCondition);
                if (!parsed) throw new Error("Invalid condition format. Use: field operator value (e.g., risk_score > 50)");

                body.conditions = parsed;
            }

            const url = isEdit
                ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/alerts/definitions/${initialData?.id}`
                : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/alerts/definitions`;

            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Failed to save rule');
            }
            return await res.json();
        },
        onSuccess,
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-xl font-bold text-white mb-6">{isEdit ? 'Edit Rule' : 'New Alert Rule'}</h3>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-white/70 mb-1">Rule Name</label>
                        <input
                            value={name} onChange={e => setName(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none"
                            placeholder="e.g. High Flood Risk"
                        />
                    </div>

                    {/* Target Type Toggle */}
                    <div className="flex bg-black/20 p-1 rounded-lg">
                        <button
                            onClick={() => setTargetType('sensor')}
                            className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${targetType === 'sensor' ? 'bg-hydro-primary text-white' : 'text-white/50 hover:text-white'
                                }`}
                        >
                            SENSOR
                        </button>
                        <button
                            onClick={() => setTargetType('script')}
                            className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${targetType === 'script' ? 'bg-hydro-primary text-white' : 'text-white/50 hover:text-white'
                                }`}
                        >
                            SCRIPT
                        </button>
                    </div>

                    {targetType === 'sensor' && (
                        <>
                            <div>
                                <label className="block text-xs font-semibold text-white/70 mb-1">Select Sensor</label>
                                <select
                                    value={stationId} onChange={e => setStationId(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                >
                                    <option value="">-- Choose Sensor --</option>
                                    {sensors.map((s: any) => (
                                        <option key={s.thing_id} value={s.thing_id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            {stationId && (
                                <div>
                                    <label className="block text-xs font-semibold text-white/70 mb-1">Select Datastream</label>
                                    <select
                                        value={datastreamId} onChange={e => setDatastreamId(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                    >
                                        <option value="">-- Choose Datastream --</option>
                                        {sensors.find((s: any) => s.thing_id === stationId)?.datastreams?.map((ds: any) => (
                                            <option key={ds.datastream_id} value={ds.datastream_id}>{ds.name} ({ds.unit_of_measurement.symbol})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-semibold text-white/70 mb-1">Condition</label>
                                <select
                                    value={condition} onChange={e => setCondition(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                >
                                    <option value="threshold_gt">Value &gt; Threshold</option>
                                    <option value="threshold_lt">Value &lt; Threshold</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-white/70 mb-1">Threshold Value</label>
                                <input
                                    type="number"
                                    value={threshold} onChange={e => setThreshold(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                />
                            </div>
                        </>
                    )}

                    {targetType === 'script' && (
                        <>
                            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400 text-xs">
                                ℹ️ Define a condition on the JSON output of the script.
                                <br />Format: <code>variable operator value</code>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-white/70 mb-1">Select Script</label>
                                <select
                                    value={scriptId} onChange={e => setScriptId(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                >
                                    <option value="">-- Choose Script --</option>
                                    {scripts.map((s: any) => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.filename})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-white/70 mb-1">Condition Expression</label>
                                <input
                                    value={manualCondition} onChange={e => setManualCondition(e.target.value)}
                                    className="w-full bg-black/20 border border-white/10 rounded px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none font-mono"
                                    placeholder="e.g. risk_score > 50"
                                />
                                <p className="text-[10px] text-white/40 mt-1">Supported operators: &gt;, &lt;, ==</p>
                            </div>
                        </>
                    )}

                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-white/60 hover:text-white">Cancel</button>
                    <button
                        onClick={() => mutation.mutate()}
                        disabled={mutation.isPending || (targetType === 'sensor' && (!stationId || !datastreamId)) || (targetType === 'script' && !scriptId)}
                        className="px-4 py-2 bg-hydro-primary hover:bg-hydro-primary/90 text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
                        {isEdit ? 'Update Rule' : 'Create Rule'}
                    </button>
                </div>
            </div>
        </div>
    );
}
