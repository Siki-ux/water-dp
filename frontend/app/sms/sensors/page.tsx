
import Link from "next/link";
import { Plus, Search, Filter } from "lucide-react";
import { SensorCreateDialog } from "@/components/SensorCreateDialog";
import { getApiUrl } from "@/lib/utils";
import { auth } from "@/lib/auth";

async function getSensors(page = 1, pageSize = 20) {
    const session = await auth();
    if (!session?.accessToken) return { items: [], total: 0 };

    const apiUrl = getApiUrl();

    try {
        const res = await fetch(`${apiUrl}/sms/sensors?page=${page}&page_size=${pageSize}`, {
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
            },
            cache: 'no-store'
        });

        if (!res.ok) throw new Error("Failed to fetch sensors");

        return await res.json();
    } catch (error) {
        console.error("Error fetching sensors:", error);
        return { items: [], total: 0 };
    }
}

export default async function SensorsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>;
}) {
    const params = await searchParams;
    const page = Number(params.page) || 1;
    const pageSize = 20;
    const data = await getSensors(page, pageSize);
    const totalPages = Math.ceil(data.total / pageSize);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white">Global Sensor Management</h1>
                    <p className="text-white/60 mt-1">Manage sensors across all projects</p>
                </div>

                <SensorCreateDialog />
            </div>

            {/* Filters Toolbar (Placeholder) */}
            <div className="flex gap-2 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                        type="text"
                        placeholder="Search sensors..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                </div>
                <button className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/80 hover:bg-white/10 transition-colors">
                    <Filter className="w-4 h-4" />
                    Filter
                </button>
            </div>

            <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-white/5 text-white/60 font-medium border-b border-white/5">
                            <tr>
                                <th className="px-6 py-3">Name</th>
                                <th className="px-6 py-3">Project</th>
                                <th className="px-6 py-3">Device Type</th>
                                <th className="px-6 py-3">Data Parser</th>
                                <th className="px-6 py-3">MQTT Topic</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {data.items.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-white/40">
                                        No sensors found.
                                    </td>
                                </tr>
                            ) : (
                                data.items.map((sensor: any) => (
                                    <tr key={sensor.uuid} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-6 py-3 text-white font-medium">
                                            {sensor.name}
                                            <div className="text-xs text-white/40 truncate max-w-[200px]">{sensor.uuid}</div>
                                        </td>
                                        <td className="px-6 py-3 text-white/80">
                                            {sensor.project_name || "Unknown"}
                                            <div className="text-xs text-white/40">{sensor.schema_name}</div>
                                        </td>
                                        <td className="px-6 py-3 text-white/80">
                                            <span className="inline-flex items-center px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">
                                                {sensor.device_type || "Generic"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-white/80">
                                            {sensor.parser || "-"}
                                        </td>
                                        <td className="px-6 py-3 text-white/50 font-mono text-xs">
                                            {sensor.mqtt_topic || "-"}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <Link
                                                href={`/sms/sensors/${sensor.uuid}`}
                                                className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium rounded-md transition-colors"
                                            >
                                                Details
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between text-xs text-white/40">
                    <div>
                        Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, data.total)} of {data.total} entries
                    </div>
                    <div className="flex gap-2">
                        <Link
                            href={`/sms/sensors?page=${page - 1}`}
                            className={`px-3 py-1 rounded border border-white/10 ${page <= 1 ? 'pointer-events-none opacity-50' : 'hover:bg-white/5'}`}
                        >
                            Previous
                        </Link>
                        <Link
                            href={`/sms/sensors?page=${page + 1}`}
                            className={`px-3 py-1 rounded border border-white/10 ${page >= totalPages ? 'pointer-events-none opacity-50' : 'hover:bg-white/5'}`}
                        >
                            Next
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
