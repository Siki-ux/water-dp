import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "./keys";

export function useDashboard(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.dashboards.detail(id!),
        queryFn: () => api.get(`/dashboards/${id}`).then((r) => r.data),
        enabled: !!id,
    });
}

export function useCreateDashboard() {
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
                .post(`/projects/${projectId}/dashboards`, body)
                .then((r) => r.data),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.projects.dashboards(vars.projectId),
            });
        },
    });
}

export function useUpdateDashboard() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            body,
        }: {
            id: string;
            body: Record<string, unknown>;
        }) => api.put(`/dashboards/${id}`, body).then((r) => r.data),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.dashboards.detail(vars.id),
            });
        },
    });
}

export function useDeleteDashboard() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete(`/dashboards/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.projects.all });
        },
    });
}
