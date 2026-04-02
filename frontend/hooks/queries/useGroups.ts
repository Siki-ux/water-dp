import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "./keys";

export function useGroups() {
    return useQuery({
        queryKey: queryKeys.groups.list(),
        queryFn: () => api.get("/groups/").then((r) => r.data),
    });
}

export function useMyAuthGroups() {
    return useQuery<{ id: string; name: string; path: string; role: string }[]>({
        queryKey: queryKeys.groups.mine(),
        queryFn: () =>
            api.get("/groups/my-authorization-groups").then((r) => r.data),
        staleTime: 5 * 60 * 1000,
    });
}

export function useGroup(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.groups.detail(id!),
        queryFn: () => api.get(`/groups/${id}`).then((r) => r.data),
        enabled: !!id,
    });
}

export function useGroupMembers(groupId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.groups.members(groupId!),
        queryFn: () =>
            api.get(`/groups/${groupId}/members`).then((r) => r.data),
        enabled: !!groupId,
    });
}

export function useCreateGroup() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: Record<string, unknown>) =>
            api.post("/groups/", body).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.groups.all }),
    });
}

export function useAddMember() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            groupId,
            body,
        }: {
            groupId: string;
            body: Record<string, unknown>;
        }) => api.post(`/groups/${groupId}/members`, body).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.groups.all }),
    });
}

export function useRemoveMember() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({
            groupId,
            memberId,
        }: {
            groupId: string;
            memberId: string;
        }) => api.delete(`/groups/${groupId}/members/${memberId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.groups.all }),
    });
}
