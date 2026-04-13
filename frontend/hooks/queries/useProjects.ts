import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "./keys";

export function useProjects(groupId?: string) {
    return useQuery({
        queryKey: queryKeys.projects.list(groupId),
        queryFn: async () => {
            const params = groupId ? { group_id: groupId } : undefined;
            const { data } = await api.get("/projects/", { params });
            return data as any[];
        },
    });
}

export function useProject(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.projects.detail(id!),
        queryFn: () => api.get(`/projects/${id}`).then((r) => r.data),
        enabled: !!id,
    });
}

export function useProjectSensors(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.projects.sensors(projectId!),
        queryFn: () =>
            api.get(`/projects/${projectId}/sensors`).then((r) => r.data),
        enabled: !!projectId,
    });
}

export function useProjectDashboards(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.projects.dashboards(projectId!),
        queryFn: () =>
            api.get(`/projects/${projectId}/dashboards`).then((r) => r.data),
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

export function useGrafanaFolder(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.projects.grafanaFolder(projectId!),
        queryFn: () =>
            api.get(`/projects/${projectId}/grafana-folder`).then((r) => r.data),
        enabled: !!projectId,
    });
}

export function useCreateProject() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: Record<string, unknown>) =>
            api.post("/projects/", body).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects.all }),
    });
}

export function useUpdateProject() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            id,
            body,
        }: {
            id: string;
            body: Record<string, unknown>;
        }) => api.put(`/projects/${id}`, body).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects.all }),
    });
}

export function useDeleteProject() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete(`/projects/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects.all }),
    });
}
