"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    Play,
    Square,
    Plus,
    Activity,
    Trash2,
    RefreshCw,
    Wind
} from "lucide-react";
import { cn } from "@/lib/utils";
import SimulationDetailsModal from "@/components/simulator/SimulationDetailsModal";
import { useTranslation } from "@/lib/i18n";
import api from "@/lib/api";

interface Simulation {
    thing_id: number;
    thing_uuid: string;
    name: string;
    description: string;
    is_running: boolean;
    config: any;
    datastreams?: any[];
}

export default function SimulatorPage() {
    const { id: projectId } = useParams();
    const router = useRouter();
    const { t } = useTranslation();

    const [simulations, setSimulations] = useState<Simulation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    // Modal State
    const [selectedSimulation, setSelectedSimulation] = useState<Simulation | null>(null);

    // New Simulation Form State
    const [newName, setNewName] = useState("");
    const [latVal, setLatVal] = useState<string>("");
    const [lonVal, setLonVal] = useState<string>("");

    // Initial Datastream State
    const [newDatastreams, setNewDatastreams] = useState<any[]>([
        { name: "datastream_1", type: "sine", min: "0", max: "100" }
    ]);

    useEffect(() => {
        if (projectId) {
            fetchSimulations();
        }
    }, [projectId]);



    async function fetchSimulations() {
        try {
            const res = await api.get(`/projects/${projectId}/simulator/simulations`);
            setSimulations(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        setIsCreating(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

            // Construct Datastreams Config
            const datastreamsPayload = newDatastreams.map(ds => ({
                name: ds.name,
                type: ds.type,
                interval: "5s",
                active: true,
                range: {
                    min: parseFloat(ds.min),
                    max: parseFloat(ds.max)
                }
            }));

            // 1. Create Thing with Config (Single Step)
            const thingRes = await api.post(`/projects/${projectId}/simulator/things`, {
                thing: {
                    project_uuid: projectId,
                    sensor_name: newName,
                    description: "Created via Simulator UI",
                    device_type: "simulator",
                    latitude: latVal ? parseFloat(latVal) : undefined,
                    longitude: lonVal ? parseFloat(lonVal) : undefined,
                    properties: []
                },
                simulation: {
                    enabled: true,
                    datastreams: datastreamsPayload
                }
            });

            if (!thingRes.data) throw new Error("Failed to create thing");

            setNewName("");
            setNewDatastreams([{ name: "datastream_1", type: "sine", min: "0", max: "100" }]);
            fetchSimulations();
        } catch (e) {
            console.error(e);
        } finally {
            setIsCreating(false);
        }
    }

    const addDatastreamRow = () => {
        setNewDatastreams([...newDatastreams, { name: `datastream_${newDatastreams.length + 1}`, type: "sine", min: "0", max: "100" }]);
    }

    const removeDatastreamRow = (index: number) => {
        if (newDatastreams.length > 1) {
            setNewDatastreams(newDatastreams.filter((_, i) => i !== index));
        }
    }

    const updateDatastreamRow = (index: number, field: string, value: string) => {
        const updated = [...newDatastreams];
        updated[index] = { ...updated[index], [field]: value };
        setNewDatastreams(updated);
    }

    async function toggleSimulation(sim: Simulation) {
        try {
            const action = sim.is_running ? "stop" : "start";
            await api.post(`/projects/${projectId}/simulator/simulations/${sim.thing_uuid}/${action}`);
            fetchSimulations();
        } catch (e) {
            console.error(e);
        }
    }

    async function handleUpdateSimulation(sim: Simulation, newConfig: any) {
        try {
            await api.post(`/projects/${projectId}/simulator/simulations`, {
                thing_id: sim.thing_uuid,
                config: newConfig
            });
            fetchSimulations();
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    async function handleDeleteSimulation(sim: Simulation) {
        try {
            await api.delete(`/projects/${projectId}/simulator/things/${sim.thing_uuid}`);
            fetchSimulations();
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    return (
        <div className="space-y-8">
            <SimulationDetailsModal
                isOpen={!!selectedSimulation}
                onClose={() => setSelectedSimulation(null)}
                simulation={selectedSimulation}
                onUpdate={handleUpdateSimulation}
                onDelete={handleDeleteSimulation}
            />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">{t("projects.simulator.title")}</h1>
                    <p className="text-[var(--foreground)]/60">{t("projects.simulator.desc")}</p>
                </div>
            </div>

            {/* Create New Simulation Panel */}
            <div className="bg-card/50 border border-border rounded-xl p-6">
                <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-hydro-primary" />
                    {t("projects.simulator.createPanelTitle")}
                </h2>
                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="col-span-1 md:col-span-1">
                            <label className="text-xs text-[var(--foreground)]/50 mb-1 block">{t("projects.simulator.sensorName")}</label>
                            <input
                                required
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="e.g. Test Station A"
                                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                            />
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="text-xs text-[var(--foreground)]/50 mb-1 block">{t("projects.simulator.lat")}</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={latVal}
                                    onChange={e => setLatVal(e.target.value)}
                                    placeholder="51.16"
                                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-[var(--foreground)]/50 mb-1 block">{t("projects.simulator.lon")}</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={lonVal}
                                    onChange={e => setLonVal(e.target.value)}
                                    placeholder="10.45"
                                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-[var(--foreground)]/50 mb-1 block">{t("projects.simulator.datastreams")}</label>
                        {newDatastreams.map((ds, idx) => (
                            <div key={idx} className="flex gap-2 items-end flex-wrap">
                                <input
                                    value={ds.name}
                                    onChange={(e) => updateDatastreamRow(idx, 'name', e.target.value)}
                                    placeholder="Name"
                                    className="flex-grow min-w-[120px] bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                />
                                <select
                                    value={ds.type}
                                    onChange={(e) => updateDatastreamRow(idx, 'type', e.target.value)}
                                    className="w-28 bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                >
                                    <option value="sine">Sine</option>
                                    <option value="random">Random</option>
                                    <option value="sawtooth">Sawtooth</option>
                                    <option value="triangle">Triangle</option>
                                </select>
                                <input
                                    type="number"
                                    value={ds.min}
                                    onChange={(e) => updateDatastreamRow(idx, 'min', e.target.value)}
                                    placeholder="Min"
                                    className="w-20 bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                />
                                <input
                                    type="number"
                                    value={ds.max}
                                    onChange={(e) => updateDatastreamRow(idx, 'max', e.target.value)}
                                    placeholder="Max"
                                    className="w-20 bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                />
                                <input
                                    value={ds.unit}
                                    onChange={(e) => updateDatastreamRow(idx, 'unit', e.target.value)}
                                    placeholder="Unit"
                                    className="w-16 bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                />
                                <input
                                    type="number"
                                    value={ds.interval}
                                    onChange={(e) => updateDatastreamRow(idx, 'interval', e.target.value)}
                                    placeholder="Sec"
                                    title="Interval (seconds)"
                                    className="w-16 bg-muted/50 border border-border rounded-lg px-3 py-2 text-[var(--foreground)] text-sm focus:border-hydro-primary focus:outline-none"
                                />
                                <button type="button" onClick={() => removeDatastreamRow(idx)} className="p-2 text-red-400 hover:text-red-300">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        <button type="button" onClick={addDatastreamRow} className="text-sm text-hydro-primary hover:underline flex items-center gap-1">
                            <Plus className="w-3 h-3" /> {t("projects.simulator.addDatastream")}
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={isCreating}
                        className="bg-hydro-primary hover:bg-blue-600 text-[var(--foreground)] font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mt-4"
                    >
                        {isCreating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        {t("projects.simulator.createSensor")}
                    </button>
                </form>
            </div>

            {/* Simulations List */}
            <div className="grid grid-cols-1 gap-4">
                {isLoading ? (
                    <div className="text-[var(--foreground)]/40 italic">{t("projects.simulator.loading")}</div>
                ) : simulations.length === 0 ? (
                    <div className="text-[var(--foreground)]/40 italic p-8 text-center border border-border rounded-xl border-dashed">
                        {t("projects.simulator.noSimulations")}
                    </div>
                ) : (
                    simulations.map(sim => (
                        <div
                            key={sim.thing_uuid}
                            onClick={() => setSelectedSimulation(sim)}
                            className="bg-card/50 border border-border rounded-xl p-4 flex items-center justify-between group hover:border-border transition-all cursor-pointer"
                        >
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center",
                                    sim.is_running ? "bg-green-500/20 text-green-400" : "bg-muted/50 text-[var(--foreground)]/40"
                                )}>
                                    <Wind className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-[var(--foreground)]">{sim.name}</h3>
                                    <div className="flex flex-col gap-1 text-xs text-[var(--foreground)]/40 mt-1">
                                        <span>UUID: {sim.thing_uuid?.substring(0, 8)}...</span>
                                        {/* Render Datastreams Summary */}
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {sim.datastreams && sim.datastreams.length > 0 ? (
                                                sim.datastreams.map((ds: any, i: number) => (
                                                    <span key={i} className="bg-muted/50 px-2 py-0.5 rounded text-[var(--foreground)]/60 border border-border">
                                                        {ds.name} ({ds.config?.type || 'unknown'})
                                                    </span>
                                                ))
                                            ) : (
                                                <span>{t("projects.simulator.noDatastreams")}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "px-2 py-1 rounded text-xs font-medium uppercase tracking-wider",
                                    sim.is_running ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                )}>
                                    {sim.is_running ? t("projects.simulator.running") : t("projects.simulator.stopped")}
                                </div>

                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSimulation(sim);
                                    }}
                                    className={cn(
                                        "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                                        sim.is_running
                                            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                                            : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                                    )}
                                    title={sim.is_running ? t("projects.simulator.stopSimulation") : t("projects.simulator.startSimulation")}
                                >
                                    {sim.is_running ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
