import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import {
    listQAQCSchemas,
    smsListQAQCConfigs,
    smsCreateQAQCConfig,
    smsDeleteQAQCConfig,
    smsAddQAQCTest,
    smsDeleteQAQCTest,
    smsTriggerQAQC,
    getThingQAQC,
    createThingQAQC,
    deleteThingQAQC,
    addThingQAQCTest,
    deleteThingQAQCTest,
    triggerThingQAQC,
    listCustomQAQCFunctions,
    uploadCustomQAQCFunction,
    deleteCustomQAQCFunction,
    listQAQCConfigs,
    QAQCConfig,
    QAQCTest,
    QAQCTriggerRequest,
} from "@/lib/qaqc-api";

// SMS schemas
export function useQAQCSchemas() {
    return useQuery({
        queryKey: queryKeys.qaqc.schemas(),
        queryFn: listQAQCSchemas,
    });
}

// SMS configs per schema
export function useSmsQAQCConfigs(schemaName: string | undefined) {
    return useQuery({
        queryKey: queryKeys.qaqc.configs(schemaName!),
        queryFn: () => smsListQAQCConfigs(schemaName!),
        enabled: !!schemaName,
    });
}

// Per-thing QA/QC override
export function useThingQAQC(uuid: string | undefined) {
    return useQuery<QAQCConfig | null>({
        queryKey: queryKeys.qaqc.thingQAQC(uuid!),
        queryFn: () => getThingQAQC(uuid!),
        enabled: !!uuid,
    });
}

// Custom functions list
export function useCustomQAQCFunctions() {
    return useQuery({
        queryKey: queryKeys.qaqc.functions(),
        queryFn: listCustomQAQCFunctions,
    });
}

// Project-scoped configs
export function useProjectQAQCConfigs(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.qaqc.projectConfigs(projectId!),
        queryFn: () => listQAQCConfigs(projectId!),
        enabled: !!projectId,
    });
}

// --- Mutations ---

export function useSmsCreateQAQCConfig() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            schemaName,
            body,
        }: {
            schemaName: string;
            body: { name: string; context_window: string; is_default?: boolean };
        }) => smsCreateQAQCConfig(schemaName, body),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.qaqc.configs(vars.schemaName),
            });
            qc.invalidateQueries({ queryKey: queryKeys.qaqc.schemas() });
        },
    });
}

export function useSmsDeleteQAQCConfig() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            schemaName,
            qaqcId,
        }: {
            schemaName: string;
            qaqcId: number;
        }) => smsDeleteQAQCConfig(schemaName, qaqcId),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.qaqc.configs(vars.schemaName),
            });
        },
    });
}

export function useSmsAddQAQCTest() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            schemaName,
            qaqcId,
            body,
        }: {
            schemaName: string;
            qaqcId: number;
            body: Omit<QAQCTest, "id" | "qaqc_id">;
        }) => smsAddQAQCTest(schemaName, qaqcId, body),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.qaqc.configs(vars.schemaName),
            });
        },
    });
}

export function useSmsDeleteQAQCTest() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            schemaName,
            qaqcId,
            testId,
        }: {
            schemaName: string;
            qaqcId: number;
            testId: number;
        }) => smsDeleteQAQCTest(schemaName, qaqcId, testId),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.qaqc.configs(vars.schemaName),
            });
        },
    });
}

export function useSmsTriggerQAQC() {
    return useMutation({
        mutationFn: ({
            schemaName,
            body,
        }: {
            schemaName: string;
            body: QAQCTriggerRequest;
        }) => smsTriggerQAQC(schemaName, body),
    });
}

export function useCreateThingQAQC() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            uuid,
            body,
        }: {
            uuid: string;
            body: { name: string; context_window: string };
        }) => createThingQAQC(uuid, body),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.qaqc.thingQAQC(vars.uuid),
            });
        },
    });
}

export function useDeleteThingQAQC() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (uuid: string) => deleteThingQAQC(uuid),
        onSuccess: (_data, uuid) => {
            qc.invalidateQueries({
                queryKey: queryKeys.qaqc.thingQAQC(uuid),
            });
        },
    });
}

export function useAddThingQAQCTest() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            uuid,
            body,
        }: {
            uuid: string;
            body: Omit<QAQCTest, "id" | "qaqc_id">;
        }) => addThingQAQCTest(uuid, body),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.qaqc.thingQAQC(vars.uuid),
            });
        },
    });
}

export function useDeleteThingQAQCTest() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ uuid, testId }: { uuid: string; testId: number }) =>
            deleteThingQAQCTest(uuid, testId),
        onSuccess: (_data, vars) => {
            qc.invalidateQueries({
                queryKey: queryKeys.qaqc.thingQAQC(vars.uuid),
            });
        },
    });
}

export function useTriggerThingQAQC() {
    return useMutation({
        mutationFn: (uuid: string) => triggerThingQAQC(uuid),
    });
}

export function useUploadCustomFunction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (file: File) => uploadCustomQAQCFunction(file),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.qaqc.functions() });
        },
    });
}

export function useDeleteCustomFunction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (name: string) => deleteCustomQAQCFunction(name),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.qaqc.functions() });
        },
    });
}
