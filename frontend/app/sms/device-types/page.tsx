import { getApiUrl } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { Cpu, Settings, Database } from "lucide-react";
import Link from "next/link";

async function getDeviceTypes() {
    const session = await auth();
    if (!session?.accessToken) return { items: [], total: 0 };

    const apiUrl = getApiUrl();
    try {
        const res = await fetch(`${apiUrl}/sms/attributes/device-types?page=1&page_size=100`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: 'no-store'
        });
        if (!res.ok) return { items: [], total: 0 };
        return await res.json();
    } catch {
        return { items: [], total: 0 };
    }
}

import { DeviceTypeListActions } from "@/components/DeviceTypeListActions";

export default async function DeviceTypesPage() {
    const data = await getDeviceTypes();
    const deviceTypes = data.items || [];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Device Types</h1>
                    <p className="text-white/60 text-sm mt-1">Configure MQTT device templates and property mappings.</p>
                </div>
                <DeviceTypeListActions />
            </div>

            <div className="border border-white/10 rounded-xl overflow-hidden bg-[#0A0A0A]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/5">
                                <th className="p-4 text-xs font-semibold text-white/60 uppercase tracking-wider w-16">ID</th>
                                <th className="p-4 text-xs font-semibold text-white/60 uppercase tracking-wider">Name</th>
                                <th className="p-4 text-xs font-semibold text-white/60 uppercase tracking-wider">Properties</th>
                                <th className="p-4 text-xs font-semibold text-white/60 uppercase tracking-wider w-24">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {deviceTypes.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-white/40">
                                        No device types found.
                                    </td>
                                </tr>
                            ) : (
                                deviceTypes.map((dt: any) => (
                                    <tr
                                        key={dt.id}
                                        className="group hover:bg-white/5 transition-colors"
                                    >
                                        <td className="p-4">
                                            <span className="font-mono text-xs text-white/40">#{dt.id}</span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                                                    <Cpu className="w-4 h-4" />
                                                </div>
                                                <Link href={`/sms/device-types/${dt.id}`} className="font-medium text-white group-hover:text-blue-300 transition-colors hover:underline">
                                                    {dt.name}
                                                </Link>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {dt.properties ? (
                                                <div className="font-mono text-[10px] text-white/60 bg-black/40 rounded border border-white/5 p-2 max-w-md overflow-hidden text-ellipsis whitespace-nowrap">
                                                    {JSON.stringify(dt.properties)}
                                                </div>
                                            ) : (
                                                <span className="text-white/20 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="p-4">
                                            <Link href={`/sms/device-types/${dt.id}`} className="p-2 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors inline-block">
                                                <Settings className="w-4 h-4" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
