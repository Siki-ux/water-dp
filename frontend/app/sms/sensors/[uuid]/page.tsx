
import { getApiUrl } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { ArrowLeft, Terminal, Database, MapPin } from "lucide-react";
import Link from "next/link";
import { PasswordField } from "@/components/PasswordField"; // Assuming we might need this or valid JSON display
import DatastreamList from "@/components/data/DatastreamList";
import SensorDetailActions from "@/components/data/SensorDetailActions";

async function getSensor(uuid: string) {
    const session = await auth();
    if (!session?.accessToken) return null;

    const apiUrl = getApiUrl();
    try {
        const res = await fetch(`${apiUrl}/sms/sensors/${uuid}`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: 'no-store'
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export default async function SensorDetailPage({ params }: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await params;
    const session = await auth();
    const sensor = await getSensor(uuid);

    if (!sensor) {
        notFound();
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* Header */}
            <div>
                <Link
                    href="/sms/sensors"
                    className="inline-flex items-center gap-2 text-white/50 hover:text-white transition-colors mb-4 text-sm"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Sensors
                </Link>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-white">{sensor.name}</h1>
                        <p className="text-white/60 font-mono text-sm mt-1">{sensor.uuid}</p>
                    </div>



                    {/* Actions */}
                    <SensorDetailActions sensor={sensor} token={session?.accessToken || ''} />
                </div>
                {sensor.description && (
                    <p className="mt-4 text-white/80 max-w-3xl">{sensor.description}</p>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Configuration Card */}
                <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3 text-lg font-semibold text-white">
                            <Terminal className="w-5 h-5 text-blue-400" />
                            <h2>Configuration</h2>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${sensor.ingest_type === 'sftp'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            }`}>
                            {sensor.ingest_type || 'mqtt'}
                        </span>
                    </div>

                    <dl className="grid grid-cols-1 gap-y-4 text-sm">
                        <div>
                            <dt className="text-white/50 mb-1">Device Type</dt>
                            <dd className="text-white font-medium">{sensor.device_type}</dd>
                        </div>

                        {/* MQTT fields - show when ingest_type is mqtt or when mqtt data exists */}
                        {(sensor.ingest_type === 'mqtt' || sensor.mqtt_username) && (
                            <>
                                <div>
                                    <dt className="text-white/50 mb-1">MQTT Username</dt>
                                    <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded inline-block">
                                        {sensor.mqtt_username}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-white/50 mb-1">MQTT Password</dt>
                                    <dd>
                                        <PasswordField value={sensor.mqtt_password} />
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-white/50 mb-1">MQTT Topic</dt>
                                    <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded break-all">
                                        {sensor.mqtt_topic}
                                    </dd>
                                </div>
                            </>
                        )}

                        {/* S3 / File Ingestion fields - show when parser or s3 data exists */}
                        {(sensor.parser || sensor.s3_bucket) && (
                            <>
                                <hr className="border-white/10" />
                                <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider -mb-2">
                                    File Ingestion (MinIO / S3)
                                </div>
                                {sensor.s3_bucket && (
                                    <div>
                                        <dt className="text-white/50 mb-1">S3 Bucket</dt>
                                        <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded inline-block">
                                            {sensor.s3_bucket}
                                        </dd>
                                    </div>
                                )}
                                {sensor.s3_user && (
                                    <div>
                                        <dt className="text-white/50 mb-1">S3 User</dt>
                                        <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded inline-block">
                                            {sensor.s3_user}
                                        </dd>
                                    </div>
                                )}
                                {sensor.s3_password && (
                                    <div>
                                        <dt className="text-white/50 mb-1">S3 Password</dt>
                                        <dd>
                                            <PasswordField value={sensor.s3_password} />
                                        </dd>
                                    </div>
                                )}
                                {sensor.filename_pattern && (
                                    <div>
                                        <dt className="text-white/50 mb-1">Filename Pattern</dt>
                                        <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded inline-block">
                                            {sensor.filename_pattern}
                                        </dd>
                                    </div>
                                )}
                            </>
                        )}

                        <div>
                            <dt className="text-white/50 mb-1">Parser</dt>
                            <dd className="text-white">{sensor.parser || <span className="text-white/30 italic">None</span>}</dd>
                        </div>
                    </dl>
                </div>

                {/* Context Card */}
                <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-6 space-y-4">
                    <div className="flex items-center gap-3 text-lg font-semibold text-white mb-2">
                        <Database className="w-5 h-5 text-green-400" />
                        <h2>Context & Location</h2>
                    </div>
                    <dl className="grid grid-cols-1 gap-y-4 text-sm">
                        <div>
                            <dt className="text-white/50 mb-1">Owner Project</dt>
                            <dd className="text-white font-medium">{sensor.project_name}</dd>
                        </div>
                        <div>
                            <dt className="text-white/50 mb-1">Database Schema</dt>
                            <dd className="text-white font-mono text-xs">{sensor.schema_name}</dd>
                        </div>
                        {sensor.latitude && sensor.longitude && (
                            <div>
                                <dt className="text-white/50 mb-1">Location</dt>
                                <dd className="flex items-center gap-1 text-white">
                                    <MapPin className="w-4 h-4 text-white/60" />
                                    {sensor.latitude}, {sensor.longitude}
                                </dd>
                            </div>
                        )}
                    </dl>
                </div>
            </div>




            {/* Datastreams */}
            <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Datastreams</h2>
                <DatastreamList datastreams={sensor.datastreams} sensorUuid={sensor.uuid} token={session?.accessToken || ''} />
            </div>

            {/* Properties (JSON) */}
            <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Properties</h2>
                <pre className="bg-black/40 p-4 rounded-lg overflow-x-auto text-xs font-mono text-white/80">
                    {JSON.stringify(sensor.properties, null, 2)}
                </pre>
            </div>
        </div >
    );
}
