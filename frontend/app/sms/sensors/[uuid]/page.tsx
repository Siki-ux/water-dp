
import { getApiUrl } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { ArrowLeft, Terminal, Database, MapPin, Globe, Server } from "lucide-react";
import Link from "next/link";
import { PasswordField } from "@/components/PasswordField"; // Assuming we might need this or valid JSON display
import DatastreamList from "@/components/data/DatastreamList";
import SensorDetailActions from "@/components/data/SensorDetailActions";
import { T } from "@/components/T";
import SensorQAQCSection from "@/components/SensorQAQCSection";

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
                    <T path="sms.sensors.backToSensors" />
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Configuration Card — takes 2/3 width */}
                <div className="lg:col-span-2 bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3 text-lg font-semibold text-white">
                            <Terminal className="w-5 h-5 text-blue-400" />
                            <h2><T path="sms.sensors.configuration" /></h2>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                            sensor.ingest_type === 'sftp'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : sensor.ingest_type === 'extapi'
                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                            : sensor.ingest_type === 'extsftp'
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            }`}>
                            {sensor.ingest_type || 'mqtt'}
                        </span>
                    </div>

                    <dl className="grid grid-cols-1 gap-y-4 text-sm">
                        <div>
                            <dt className="text-white/50 mb-1"><T path="sms.sensors.deviceType" /></dt>
                            <dd className="text-white font-medium">{sensor.device_type}</dd>
                        </div>

                        {/* MQTT fields - show when ingest_type is mqtt or when mqtt data exists */}
                        {(sensor.ingest_type === 'mqtt' || sensor.mqtt_username) && (
                            <>
                                <div>
                                    <dt className="text-white/50 mb-1"><T path="sms.sensors.mqttUsername" /></dt>
                                    <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded inline-block">
                                        {sensor.mqtt_username}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-white/50 mb-1"><T path="sms.sensors.mqttPassword" /></dt>
                                    <dd>
                                        <PasswordField value={sensor.mqtt_password} />
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-white/50 mb-1"><T path="sms.sensors.mqttTopic" /></dt>
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
                                    <T path="sms.sensors.fileIngestion" />
                                </div>
                                {sensor.s3_bucket && (
                                    <div>
                                        <dt className="text-white/50 mb-1"><T path="sms.sensors.s3Bucket" /></dt>
                                        <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded inline-block">
                                            {sensor.s3_bucket}
                                        </dd>
                                    </div>
                                )}
                                {sensor.s3_user && (
                                    <div>
                                        <dt className="text-white/50 mb-1"><T path="sms.sensors.s3User" /></dt>
                                        <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded inline-block">
                                            {sensor.s3_user}
                                        </dd>
                                    </div>
                                )}
                                {sensor.s3_password && (
                                    <div>
                                        <dt className="text-white/50 mb-1"><T path="sms.sensors.s3Password" /></dt>
                                        <dd>
                                            <PasswordField value={sensor.s3_password} />
                                        </dd>
                                    </div>
                                )}
                                {sensor.filename_pattern && (
                                    <div>
                                        <dt className="text-white/50 mb-1"><T path="sms.sensors.filenamePattern" /></dt>
                                        <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded inline-block">
                                            {sensor.filename_pattern}
                                        </dd>
                                    </div>
                                )}
                            </>
                        )}

                        <div>
                            <dt className="text-white/50 mb-1"><T path="sms.sensors.parser" /></dt>
                            <dd className="text-white">{sensor.parser || <span className="text-white/30 italic"><T path="sms.sensors.none" /></span>}</dd>
                        </div>

                        {/* External API Source */}
                        {sensor.external_api && sensor.external_api.type_name && (
                            <>
                                <hr className="border-white/10" />
                                <div className="text-xs font-semibold text-purple-400 uppercase tracking-wider -mb-2 flex items-center gap-2">
                                    <Globe className="w-3.5 h-3.5" />
                                    <T path="sms.sensors.externalApiSource" />
                                </div>
                                <div>
                                    <dt className="text-white/50 mb-1"><T path="sms.sensors.apiType" /></dt>
                                    <dd className="text-white font-medium">{sensor.external_api.type_name}</dd>
                                </div>
                                <div>
                                    <dt className="text-white/50 mb-1"><T path="sms.sensors.syncInterval" /></dt>
                                    <dd className="text-white">{sensor.external_api.sync_interval} <T path="sms.sensors.minutes" /></dd>
                                </div>
                                <div>
                                    <dt className="text-white/50 mb-1">Status</dt>
                                    <dd>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                            sensor.external_api.sync_enabled
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                        }`}>
                                            {sensor.external_api.sync_enabled
                                                ? <T path="sms.sensors.syncEnabled" />
                                                : <T path="sms.sensors.syncDisabled" />}
                                        </span>
                                    </dd>
                                </div>
                                {sensor.external_api.settings && Object.keys(sensor.external_api.settings).length > 0 && (
                                    <div>
                                        <dt className="text-white/50 mb-1"><T path="sms.sensors.settings" /></dt>
                                        <dd className="font-mono text-[10px] text-white/60 bg-white/5 rounded border border-white/10 p-2 max-w-full overflow-x-auto">
                                            {JSON.stringify(sensor.external_api.settings, null, 2)}
                                        </dd>
                                    </div>
                                )}
                            </>
                        )}

                        {/* External SFTP Source */}
                        {sensor.external_sftp && sensor.external_sftp.uri && (
                            <>
                                <hr className="border-white/10" />
                                <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider -mb-2 flex items-center gap-2">
                                    <Server className="w-3.5 h-3.5" />
                                    <T path="sms.sensors.externalSftpSource" />
                                </div>
                                <div>
                                    <dt className="text-white/50 mb-1"><T path="sms.sensors.sftpUri" /></dt>
                                    <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded inline-block break-all">
                                        {sensor.external_sftp.uri}
                                    </dd>
                                </div>
                                {sensor.external_sftp.path && (
                                    <div>
                                        <dt className="text-white/50 mb-1"><T path="sms.sensors.sftpPath" /></dt>
                                        <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded inline-block">
                                            {sensor.external_sftp.path}
                                        </dd>
                                    </div>
                                )}
                                {sensor.external_sftp.username && (
                                    <div>
                                        <dt className="text-white/50 mb-1"><T path="sms.sensors.sftpUser" /></dt>
                                        <dd className="text-white font-mono bg-white/5 px-2 py-1 rounded inline-block">
                                            {sensor.external_sftp.username}
                                        </dd>
                                    </div>
                                )}
                                <div>
                                    <dt className="text-white/50 mb-1"><T path="sms.sensors.syncInterval" /></dt>
                                    <dd className="text-white">{sensor.external_sftp.sync_interval} <T path="sms.sensors.minutes" /></dd>
                                </div>
                                <div>
                                    <dt className="text-white/50 mb-1">Status</dt>
                                    <dd>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                            sensor.external_sftp.sync_enabled
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                        }`}>
                                            {sensor.external_sftp.sync_enabled
                                                ? <T path="sms.sensors.syncEnabled" />
                                                : <T path="sms.sensors.syncDisabled" />}
                                        </span>
                                    </dd>
                                </div>
                            </>
                        )}
                    </dl>
                </div>

                {/* Right column — Context + Properties stacked */}
                <div className="flex flex-col gap-4">
                    {/* Context Card */}
                    <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-white mb-3">
                            <Database className="w-4 h-4 text-green-400" />
                            <h2><T path="sms.sensors.contextLocation" /></h2>
                        </div>
                        <dl className="grid grid-cols-1 gap-y-3 text-sm">
                            <div>
                                <dt className="text-white/50 text-xs mb-0.5"><T path="sms.sensors.ownerProject" /></dt>
                                <dd className="text-white font-medium">{sensor.project_name}</dd>
                            </div>
                            <div>
                                <dt className="text-white/50 text-xs mb-0.5"><T path="sms.sensors.dbSchema" /></dt>
                                <dd className="text-white font-mono text-xs">{sensor.schema_name}</dd>
                            </div>
                            {sensor.latitude && sensor.longitude && (
                                <div>
                                    <dt className="text-white/50 text-xs mb-0.5"><T path="sms.sensors.location" /></dt>
                                    <dd className="flex items-center gap-1 text-white text-xs">
                                        <MapPin className="w-3.5 h-3.5 text-white/60" />
                                        {sensor.latitude}, {sensor.longitude}
                                    </dd>
                                </div>
                            )}
                        </dl>
                    </div>

                    {/* Properties Card */}
                    <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-4 flex-1 min-h-0">
                        <h2 className="text-sm font-semibold text-white mb-3"><T path="sms.sensors.properties" /></h2>
                        <pre className="bg-black/40 p-3 rounded-lg overflow-auto text-xs font-mono text-white/70 max-h-64">
                            {JSON.stringify(sensor.properties, null, 2)}
                        </pre>
                    </div>
                </div>
            </div>




            {/* Datastreams */}
            <div className="bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4"><T path="sms.sensors.datastreams" /></h2>
                <DatastreamList datastreams={sensor.datastreams} sensorUuid={sensor.uuid} token={session?.accessToken || ''} />
            </div>

            {/* QA/QC Override */}
            <SensorQAQCSection sensorUuid={sensor.uuid} token={session?.accessToken || ''} />

        </div >
    );
}
