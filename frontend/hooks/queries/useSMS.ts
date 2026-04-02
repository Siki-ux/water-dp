import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "./keys";

export function useSMSSensors(params: {
    page?: number;
    page_size?: number;
    search?: string;
    ingest_type?: string;
}) {
    return useQuery({
        queryKey: queryKeys.sms.sensors(params),
        queryFn: () => api.get("/sms/sensors", { params }).then((r) => r.data),
    });
}

export function useSMSSensorDetail(uuid: string | undefined) {
    return useQuery({
        queryKey: queryKeys.sms.sensorDetail(uuid!),
        queryFn: () => api.get(`/sms/sensors/${uuid}`).then((r) => r.data),
        enabled: !!uuid,
    });
}

export function useDeviceTypes(params?: Record<string, unknown>) {
    return useQuery({
        queryKey: queryKeys.sms.deviceTypes(params),
        queryFn: () =>
            api.get("/sms/attributes/device-types", { params }).then((r) => r.data),
        staleTime: Infinity,
    });
}

export function useParsers(params?: Record<string, unknown>) {
    return useQuery({
        queryKey: queryKeys.sms.parsers(params),
        queryFn: () =>
            api.get("/sms/attributes/parsers", { params }).then((r) => r.data),
        staleTime: Infinity,
    });
}

export function useIngestTypes() {
    return useQuery({
        queryKey: queryKeys.sms.ingestTypes(),
        queryFn: () =>
            api.get("/sms/attributes/ingest-types").then((r) => r.data),
        staleTime: Infinity,
    });
}

export function useApiTypes() {
    return useQuery({
        queryKey: queryKeys.sms.apiTypes(),
        queryFn: () =>
            api.get("/external-sources/api-types").then((r) => r.data),
        staleTime: Infinity,
    });
}

export function useCreateSensor() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: Record<string, unknown>) =>
            api.post("/things/", body).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["sms-sensors"] });
        },
    });
}

export function useUpdateSensor() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            uuid,
            body,
        }: {
            uuid: string;
            body: Record<string, unknown>;
        }) => api.put(`/sms/sensors/${uuid}`, body).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["sms-sensors"] });
        },
    });
}
