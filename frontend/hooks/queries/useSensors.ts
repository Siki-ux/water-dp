import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "./keys";

export function useThing(uuid: string | undefined) {
    return useQuery({
        queryKey: queryKeys.things.detail(uuid!),
        queryFn: () => api.get(`/things/${uuid}`).then((r) => r.data),
        enabled: !!uuid,
    });
}

export function useThingDatastreams(uuid: string | undefined) {
    return useQuery({
        queryKey: queryKeys.things.datastreams(uuid!),
        queryFn: () =>
            api.get(`/things/${uuid}/datastreams`).then((r) => r.data),
        enabled: !!uuid,
    });
}

export function useLinkSensor() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            projectId,
            thingUuid,
        }: {
            projectId: string;
            thingUuid: string;
        }) =>
            api
                .post(`/projects/${projectId}/sensors`, null, {
                    params: { thing_uuid: thingUuid },
                })
                .then((r) => r.data),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.projects.sensors(vars.projectId),
            });
        },
    });
}

export function useUnlinkSensor() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            projectId,
            sensorId,
            deleteFromSource,
        }: {
            projectId: string;
            sensorId: string;
            deleteFromSource?: boolean;
        }) =>
            api.delete(`/projects/${projectId}/sensors/${sensorId}`, {
                params: deleteFromSource
                    ? { delete_from_source: true }
                    : undefined,
            }),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.projects.sensors(vars.projectId),
            });
        },
    });
}
