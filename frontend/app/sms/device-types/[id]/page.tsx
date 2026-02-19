import { auth } from "@/lib/auth";
import { getApiUrl } from "@/lib/utils";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Cpu, Code, Settings } from "lucide-react";

async function getDeviceType(id: string) {
    const session = await auth();
    if (!session?.accessToken) return null;

    const apiUrl = getApiUrl();
    try {
        const res = await fetch(`${apiUrl}/sms/attributes/device-types/${id}`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: 'no-store'
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

import { DeviceTypeDetailActions } from "@/components/DeviceTypeDetailActions";

export default async function DeviceTypeDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const deviceType = await getDeviceType(id);

    if (!deviceType) {
        notFound();
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* Header / Breadcrumb */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/sms/device-types"
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                            {deviceType.name}
                            <span className="px-2.5 py-0.5 rounded-md text-sm font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                ID: #{deviceType.id}
                            </span>
                        </h1>
                    </div>
                </div>
                <DeviceTypeDetailActions deviceType={deviceType} />
            </div>

            <div className="space-y-6">
                {/* Configuration */}
                <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 shadow-xl">
                    <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-blue-400" />
                        Configuration
                    </h2>

                    <div>
                        <label className="block text-xs uppercase text-white/40 font-semibold mb-2 flex items-center gap-2">
                            <Settings className="w-3 h-3" />
                            Properties
                        </label>
                        <div className="bg-black/50 rounded-lg border border-white/5 p-4 font-mono text-sm text-white/70 overflow-x-auto">
                            <pre>{JSON.stringify(deviceType.properties, null, 2)}</pre>
                        </div>
                    </div>
                </div>

                {/* Parser Code */}
                {deviceType.code ? (
                    <div className="bg-[#0A0A0A] border border-white/10 rounded-xl p-6 shadow-xl">
                        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Code className="w-5 h-5 text-green-400" />
                            Parser Code
                        </h2>
                        <div className="bg-black/50 rounded-lg border border-white/5 p-4 font-mono text-xs text-white/80 overflow-x-auto">
                            <pre>{deviceType.code}</pre>
                        </div>
                    </div>
                ) : deviceType.code_error ? (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
                        <h2 className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
                            Error Loading Code
                        </h2>
                        <p className="text-white/60 text-sm">{deviceType.code_error}</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
