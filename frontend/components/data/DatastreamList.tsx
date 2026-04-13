"use client";

import { useState } from "react";
import { Edit2, Plus } from "lucide-react";
import DatastreamEditDialog from "./DatastreamEditDialog";
import DatastreamAddDialog from "./DatastreamAddDialog";
import { useRouter } from "next/navigation";

interface DatastreamListProps {
    datastreams: any[];
    sensorUuid: string;
    token: string;
}

export default function DatastreamList({ datastreams, sensorUuid, token }: DatastreamListProps) {
    const [editingDs, setEditingDs] = useState<any>(null);
    const [showAdd, setShowAdd] = useState(false);
    const router = useRouter();

    const handleUpdate = () => {
        router.refresh();
    };

    return (
        <div className="overflow-x-auto">
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-white/50">
                    {datastreams?.length || 0} datastream{(datastreams?.length || 0) !== 1 ? 's' : ''}
                </span>
                <button
                    onClick={() => setShowAdd(true)}
                    className="p-1.5 hover:bg-white/10 rounded-md text-white/50 hover:text-hydro-primary transition-colors border border-white/10 hover:border-hydro-primary/30"
                    title="Add Datastream"
                >
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {(!datastreams || datastreams.length === 0) ? (
                <p className="text-white/40 italic">No datastreams found for this sensor.</p>
            ) : (
                <table className="w-full text-sm text-left">
                    <thead className="bg-white/5 text-white/60 font-medium border-b border-white/5">
                        <tr>
                            <th className="px-4 py-2">Name</th>
                            <th className="px-4 py-2">Unit Name</th>
                            <th className="px-4 py-2">Unit Symbol</th>
                            <th className="px-4 py-2">Unit Definition</th>
                            <th className="px-4 py-2 w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {datastreams.map((ds: any) => (
                            <tr key={ds.datastream_id || ds.id || ds.name} className="hover:bg-white/5 group">
                                <td className="px-4 py-2 text-white font-medium">{ds.name}</td>
                                <td className="px-4 py-2 text-white/80">{ds.unit_of_measurement?.label || ds.unit_of_measurement?.name || "-"}</td>
                                <td className="px-4 py-2 text-white/60 font-mono">
                                    {ds.unit_of_measurement?.symbol || "-"}
                                </td>
                                <td className="px-4 py-2 text-white/60">{ds.unit_of_measurement?.definition || "-"}</td>
                                <td className="px-4 py-2 text-right">
                                    <button
                                        onClick={() => setEditingDs(ds)}
                                        className="p-1.5 hover:bg-white/10 rounded-md text-white/40 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                        title="Edit Datastream"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <DatastreamEditDialog
                isOpen={!!editingDs}
                onClose={() => setEditingDs(null)}
                datastream={editingDs}
                sensorUuid={sensorUuid}
                token={token}
                onUpdate={handleUpdate}
            />

            <DatastreamAddDialog
                isOpen={showAdd}
                onClose={() => setShowAdd(false)}
                sensorUuid={sensorUuid}
                token={token}
                onUpdate={handleUpdate}
            />
        </div>
    );
}

