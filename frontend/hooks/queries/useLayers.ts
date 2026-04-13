import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "./keys";

export function useLayers() {
    return useQuery({
        queryKey: queryKeys.layers.list(),
        queryFn: () =>
            api.get("/geospatial/layers", { params: { limit: 100 } }).then((r) => r.data),
    });
}

export function useLayer(name: string | undefined) {
    return useQuery({
        queryKey: queryKeys.layers.detail(name!),
        queryFn: () =>
            api.get(`/geospatial/layers/${name}`).then((r) => r.data),
        enabled: !!name,
    });
}

export function useCreateLayer() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: FormData) =>
            api
                .post("/geospatial/layers", body, {
                    headers: { "Content-Type": "multipart/form-data" },
                })
                .then((r) => r.data),
        onSuccess: () =>
            qc.invalidateQueries({ queryKey: queryKeys.layers.all }),
    });
}

export function useDeleteLayer() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (name: string) =>
            api.delete(`/geospatial/layers/${encodeURIComponent(name)}`),
        onSuccess: () =>
            qc.invalidateQueries({ queryKey: queryKeys.layers.all }),
    });
}
