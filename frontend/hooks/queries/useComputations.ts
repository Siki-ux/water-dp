import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "./keys";

export function useComputations(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.projects.computations(projectId!),
        queryFn: () =>
            api
                .get(`/computations/list/${projectId}`)
                .then((r) => r.data),
        enabled: !!projectId,
    });
}

export function useCreateComputation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            projectId,
            formData,
        }: {
            projectId: string;
            formData: FormData;
        }) => {
            formData.set("project_id", projectId);
            return api
                .post("/computations/upload", formData, {
                    headers: { "Content-Type": "multipart/form-data" },
                })
                .then((r) => r.data);
        },
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.projects.computations(vars.projectId),
            });
        },
    });
}

export function useDeleteComputation() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            projectId,
            scriptId,
        }: {
            projectId: string;
            scriptId: string;
        }) =>
            api.delete(
                `/computations/${scriptId}`,
                { params: { project_id: projectId } },
            ),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.projects.computations(vars.projectId),
            });
        },
    });
}
