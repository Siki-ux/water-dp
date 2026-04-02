"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import ProjectMap from "@/components/ProjectMap";
import { Sensor } from "@/types/sensor";
import { T } from "@/components/T";
import { Loader2 } from "lucide-react";
import { useProject, useProjectSensors, useAlertHistory } from "@/hooks/queries/useProjects";

const ACTIVE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export default function ProjectOverviewPage() {
    const params = useParams();
    const id = params.id as string;

    const { data: project, isLoading: projectLoading } = useProject(id);
    const { data: rawSensors, isLoading: sensorsLoading, error: sensorError } = useProjectSensors(id);
    const { data: alertsRaw } = useAlertHistory(id, { status: "active" });

    const sensors: Sensor[] = useMemo(() => {
        if (!rawSensors) return [];
        const now = Date.now();
        return (rawSensors as any[]).map((t) => {
            const lat = t.location?.coordinates?.latitude || 0;
            const lng = t.location?.coordinates?.longitude || 0;
            const hasRecentData =
                t.last_activity &&
                now - new Date(t.last_activity).getTime() < ACTIVE_THRESHOLD_MS;
            const effectiveStatus =
                t.properties?.status === "active" || hasRecentData
                    ? "active"
                    : t.properties?.status || "inactive";
            return {
                uuid: t.sensor_uuid,
                id: t.thing_id || t.sensor_uuid,
                name: t.name,
                description: t.description,
                latitude: lat,
                longitude: lng,
                status: effectiveStatus,
                last_activity: t.last_activity,
                datastreams: t.datastreams || [],
                properties: t.properties,
            } as Sensor;
        });
    }, [rawSensors]);

    const activeSensors = useMemo(() => {
        const now = Date.now();
        return sensors.filter(
            (s) =>
                s.status === "active" ||
                (s.last_activity &&
                    now - new Date(s.last_activity).getTime() < ACTIVE_THRESHOLD_MS),
        ).length;
    }, [sensors]);

    const activeAlertsCount = Array.isArray(alertsRaw) ? alertsRaw.length : 0;

    if (projectLoading || sensorsLoading) {
        return (
            <div className="flex items-center justify-center py-20 text-white/40">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading project…
            </div>
        );
    }

    if (!project) {
        return (
            <div className="text-red-400">
                <T path="projects.details.notFound" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
            <p className="text-white/60">
                {project.description || <T path="projects.details.noDescProvided" />}
            </p>

            {sensorError && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
                    <strong>Warning:</strong>{" "}
                    <T path="projects.details.sensorLoadWarning" />{" "}
                    {sensorError instanceof Error ? sensorError.message : String(sensorError)}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-4xl font-bold text-hydro-secondary mb-2">
                        {sensors.length}
                    </div>
                    <div className="text-sm text-white/50">
                        <T path="projects.details.totalSensors" />
                    </div>
                </div>
                <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-4xl font-bold text-green-400 mb-2">
                        {activeSensors}
                    </div>
                    <div className="text-sm text-white/50">
                        <T path="projects.details.activeSensors" />
                    </div>
                </div>
                <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                    <div className="text-4xl font-bold text-orange-400 mb-2">
                        {activeAlertsCount}
                    </div>
                    <div className="text-sm text-white/50">
                        <T path="projects.details.activeAlerts" />
                    </div>
                </div>
            </div>

            <div className="mt-8">
                <h2 className="text-xl font-semibold text-white mb-4">
                    <T path="projects.details.sensorMap" />
                </h2>
                <div className="h-[calc(100vh-500px)] min-h-[400px]">
                    <ProjectMap
                        sensors={sensors}
                        projectId={id}
                        className="h-full shadow-2xl"
                    />
                </div>
            </div>
        </div>
    );
}
