import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "./keys";

export function useSimulations(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.projects.simulations(projectId!),
        queryFn: () =>
            api
                .get(`/projects/${projectId}/simulator/simulations`)
                .then((r) => r.data),
        enabled: !!projectId,
    });
}

export function useCreateSimulation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            projectId,
            body,
        }: {
            projectId: string;
            body: Record<string, unknown>;
        }) =>
            api
                .post(`/projects/${projectId}/simulator/things`, body)
                .then((r) => r.data),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.projects.simulations(vars.projectId),
            });
        },
    });
}

export function useToggleSimulation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            projectId,
            uuid,
            action,
        }: {
            projectId: string;
            uuid: string;
            action: "start" | "stop";
        }) =>
            api
                .post(
                    `/projects/${projectId}/simulator/simulations/${uuid}/${action}`,
                )
                .then((r) => r.data),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.projects.simulations(vars.projectId),
            });
        },
    });
}

export function useDeleteSimulation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            projectId,
            uuid,
        }: {
            projectId: string;
            uuid: string;
        }) =>
            api.delete(
                `/projects/${projectId}/simulator/things/${uuid}`,
            ),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.projects.simulations(vars.projectId),
            });
        },
    });
}
