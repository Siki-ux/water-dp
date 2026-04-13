import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "./keys";

export function useAlertDefinitions(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.projects.alertDefs(projectId!),
        queryFn: () =>
            api.get(`/alerts/definitions/${projectId}`).then((r) => r.data),
        enabled: !!projectId,
    });
}

export function useAlertHistory(
    projectId: string | undefined,
    params?: { status?: string; limit?: number },
) {
    return useQuery({
        queryKey: queryKeys.projects.alertHistory(projectId!),
        queryFn: () =>
            api
                .get(`/alerts/history/${projectId}`, { params })
                .then((r) => r.data),
        enabled: !!projectId,
    });
}

export function useCreateAlert() {
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
                .post(`/alerts/definitions/${projectId}`, body)
                .then((r) => r.data),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.projects.alertDefs(vars.projectId),
            });
        },
    });
}

export function useUpdateAlert() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            alertId,
            body,
        }: {
            alertId: string;
            body: Record<string, unknown>;
        }) =>
            api
                .put(`/alerts/definitions/${alertId}`, body)
                .then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.projects.all });
        },
    });
}

export function useDeleteAlert() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (alertId: string) =>
            api.delete(`/alerts/definitions/${alertId}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.projects.all });
        },
    });
}
