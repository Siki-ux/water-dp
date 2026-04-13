import React, { useState, useEffect } from "react";
import { X, RefreshCw, Save, Trash2, Plus } from "lucide-react";
import { useEscapeKey } from '@/hooks/useEscapeKey';

interface Simulation {
    thing_id: number;
    thing_uuid: string;
    name: string;
    description: string;
    is_running: boolean;
    config: any;
    location?: { lat: number; lon: number };
    datastreams?: any[];
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    simulation: Simulation | null;
    onUpdate: (simulation: Simulation, newConfig: any, newName?: string, newLocation?: any) => Promise<void>;
    onDelete?: (simulation: Simulation) => Promise<void>;
}

export default function SimulationDetailsModal({ isOpen, onClose, simulation, onUpdate, onDelete }: Props) {
    useEscapeKey(onClose, isOpen);

    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Form State
    const [name, setName] = useState("");
    const [lat, setLat] = useState("");
    const [lon, setLon] = useState("");
    const [isRunning, setIsRunning] = useState(false);

    // Datastreams State
    const [datastreams, setDatastreams] = useState<any[]>([]);

    useEffect(() => {
        if (simulation && isOpen) {
            setName(simulation.name);
            setLat(simulation.location?.lat ? String(simulation.location.lat) : "");
            setLon(simulation.location?.lon ? String(simulation.location.lon) : "");
            setIsRunning(simulation.is_running);

            // Populate Datastreams
            // Try explicit datastreams list first (from SimulatorService), then fallback to config
            if (simulation.datastreams && simulation.datastreams.length > 0) {
                const mapped = simulation.datastreams.map(ds => ({
                    name: ds.name,
                    type: ds.config?.type || "sine",
                    min: ds.config?.range?.min !== undefined ? String(ds.config.range.min) : "0",
                    max: ds.config?.range?.max !== undefined ? String(ds.config.range.max) : "100"
                }));
                // Try to extract unit/interval
                // Note: The previous view showed 'mapped' construction but I missed the start.
                // I'll rewrite the whole block.
                setDatastreams(simulation.datastreams.map(ds => ({
                    name: ds.name,
                    type: ds.config?.type || 'sine',
                    min: String(ds.config?.range?.min ?? 0),
                    max: String(ds.config?.range?.max ?? 100),
                    unit: ds.unit || ds.properties?.unit || "",
                    interval: String(parseInt(ds.config?.interval) || 60)
                })));
            } else if (simulation.config) {
                // Legacy or simple config
                const cfgs = Array.isArray(simulation.config) ? simulation.config : [simulation.config];
                setDatastreams(cfgs.map((c: any) => ({
                    name: c.name || "datastream_1",
                    type: c.type || "sine",
                    min: String(c.range?.min ?? 0),
                    max: String(c.range?.max ?? 100),
                    unit: c.unit || "",
                    interval: String(parseInt(c.interval) || 60)
                })));
            } else {
                setDatastreams([{ name: "datastream_1", type: "sine", min: "0", max: "100", unit: "", interval: "60" }]);
            }
        }
    }, [simulation, isOpen]);

    if (!isOpen || !simulation) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            // Construct Config List
            // Construct Config List
            const newConfigList = datastreams.map(ds => ({
                name: ds.name,
                type: ds.type,
                interval: (Math.max(1, parseInt(ds.interval) || 60)) + "s",
                unit: ds.unit,
                enabled: isRunning, // Global switch for now
                active: isRunning,
                range: {
                    min: parseFloat(ds.min),
                    max: parseFloat(ds.max)
                }
            }));


            let newLocation = undefined;
            if (lat && lon) {
                newLocation = { lat: parseFloat(lat), lon: parseFloat(lon) };
            }

            // Backend expects 'config' to be a LIST now (or we assumed list in calculation)
            // But SimulatorService.update_simulation calls `sim.config = config`.
            // Let's pass the list. The backend might need adjustment if it doesn't handle list updates, 
            // but `_calculate_min_interval` DOES handle list. 
            // `SimulatorService.update_simulation_config` just stores it.
            // If the schema expects Dict, we might need to wrap it? 
            // Looking at `SimulatorService._format_simulation_output`, it expects `sim_config` to be List[Dict].

            await onUpdate(simulation, newConfigList, name, newLocation);
            onClose();
        } catch (error) {
            console.error("Failed to update simulation", error);
        } finally {
            setIsSaving(false);
        }
    };

    const addDatastream = () => {
        setDatastreams([...datastreams, { name: `datastream_${datastreams.length + 1}`, type: "sine", min: "0", max: "100", unit: "", interval: "60" }]);
    }

    const removeDatastream = (index: number) => {
        if (datastreams.length > 1) {
            setDatastreams(datastreams.filter((_, i) => i !== index));
        }
    }

    const updateDatastream = (index: number, field: string, value: string) => {
        const updated = [...datastreams];
        updated[index] = { ...updated[index], [field]: value };
        setDatastreams(updated);
    }

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this simulation?")) return;
        setIsDeleting(true);
        try {
            if (onDelete) await onDelete(simulation);
            onClose();
        } catch (error) {
            console.error("Failed to delete simulation", error);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <h2 className="text-lg font-bold text-white">Simulation Details</h2>
                    <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSave} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-white/50 mb-1 block uppercase tracking-wider">Thing Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none"
                            />
                            <div className="text-white/40 text-xs mt-1 font-mono">{simulation.thing_uuid}</div>
                        </div>

                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="text-xs text-white/50 mb-1 block">Latitude</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={lat}
                                    onChange={e => setLat(e.target.value)}
                                    placeholder="e.g. 50.11"
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-white/50 mb-1 block">Longitude</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={lon}
                                    onChange={e => setLon(e.target.value)}
                                    placeholder="e.g. 8.68"
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-white/10"></div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs text-white/50 uppercase tracking-wider">Datastreams</label>
                            <button type="button" onClick={addDatastream} className="text-xs text-hydro-primary hover:underline flex items-center gap-1">
                                <Plus className="w-3 h-3" /> Add
                            </button>
                        </div>

                        <div className="space-y-3">
                            {datastreams.map((ds, idx) => (
                                <div key={idx} className="bg-white/5 p-3 rounded-lg border border-white/5 flex gap-2 items-end flex-wrap">
                                    <div className="flex-grow min-w-[120px]">
                                        <label className="text-[10px] text-white/40 block mb-1">Name</label>
                                        <input
                                            value={ds.name}
                                            onChange={(e) => updateDatastream(idx, 'name', e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-white/40 block mb-1">Type</label>
                                        <select
                                            value={ds.type}
                                            onChange={(e) => updateDatastream(idx, 'type', e.target.value)}
                                            className="w-28 bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                        >
                                            <option value="sine">Sine</option>
                                            <option value="random">Random</option>
                                            <option value="sawtooth">Sawtooth</option>
                                            <option value="triangle">Triangle</option>
                                        </select>
                                    </div>
                                    <div className="w-16">
                                        <label className="text-[10px] text-white/40 block mb-1">Min</label>
                                        <input
                                            type="number"
                                            value={ds.min}
                                            onChange={(e) => updateDatastream(idx, 'min', e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                        />
                                    </div>
                                    <div className="w-16">
                                        <label className="text-[10px] text-white/40 block mb-1">Max</label>
                                        <input
                                            type="number"
                                            value={ds.max}
                                            onChange={(e) => updateDatastream(idx, 'max', e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                        />
                                    </div>
                                    <div className="w-16">
                                        <label className="text-[10px] text-white/40 block mb-1">Unit</label>
                                        <input
                                            value={ds.unit}
                                            onChange={(e) => updateDatastream(idx, 'unit', e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                        />
                                    </div>
                                    <div className="w-16">
                                        <label className="text-[10px] text-white/40 block mb-1">Sec</label>
                                        <input
                                            type="number"
                                            value={ds.interval}
                                            onChange={(e) => updateDatastream(idx, 'interval', e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-white text-sm focus:border-hydro-primary focus:outline-none"
                                        />
                                    </div>
                                    <button type="button" onClick={() => removeDatastream(idx)} className="p-2 text-red-400 hover:text-red-300 self-center mt-3">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>


                    <div className="border-t border-white/10 my-4 pt-4 flex items-center justify-between">
                        <label className="text-sm text-white">Simulation Running</label>
                        <div
                            onClick={() => setIsRunning(!isRunning)}
                            className={`cursor-pointer w-12 h-6 rounded-full p-1 transition-colors ${isRunning ? 'bg-green-500' : 'bg-white/10'}`}
                        >
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${isRunning ? 'translate-x-6' : 'translate-x-0'}`} />
                        </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                        {onDelete && (
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors text-sm flex items-center justify-center mr-auto"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex-1 px-4 py-2 rounded-lg bg-hydro-primary hover:bg-blue-600 text-white transition-colors text-sm font-medium flex items-center justify-center gap-2"
                        >
                            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
