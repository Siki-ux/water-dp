import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/api", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
    },
    clearTokenCache: vi.fn(),
}));

import api from "@/lib/api";
import {
    useGroups,
    useMyAuthGroups,
    useGroup,
    useGroupMembers,
    useCreateGroup,
    useAddMember,
    useRemoveMember,
} from "@/hooks/queries/useGroups";

function createWrapper() {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
}

describe("useGroups hooks", () => {
    beforeEach(() => vi.clearAllMocks());

    describe("useGroups", () => {
        it("fetches all groups", async () => {
            const groups = [{ id: "g1", name: "Group A" }];
            vi.mocked(api.get).mockResolvedValueOnce({ data: groups });

            const { result } = renderHook(() => useGroups(), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(groups);
            expect(api.get).toHaveBeenCalledWith("/groups/");
        });
    });

    describe("useMyAuthGroups", () => {
        it("fetches user authorization groups", async () => {
            const myGroups = [
                { id: "g1", name: "Team", path: "/Team", role: "editor" },
            ];
            vi.mocked(api.get).mockResolvedValueOnce({ data: myGroups });

            const { result } = renderHook(() => useMyAuthGroups(), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(myGroups);
            expect(api.get).toHaveBeenCalledWith(
                "/groups/my-authorization-groups",
            );
        });
    });

    describe("useGroup", () => {
        it("fetches a single group", async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: { id: "g1", name: "G1" },
            });

            const { result } = renderHook(() => useGroup("g1"), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.get).toHaveBeenCalledWith("/groups/g1");
        });

        it("is disabled when id undefined", () => {
            const { result } = renderHook(() => useGroup(undefined), {
                wrapper: createWrapper(),
            });
            expect(result.current.fetchStatus).toBe("idle");
        });
    });

    describe("useGroupMembers", () => {
        it("fetches group members", async () => {
            const members = [{ id: "m1", username: "alice" }];
            vi.mocked(api.get).mockResolvedValueOnce({ data: members });

            const { result } = renderHook(() => useGroupMembers("g1"), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(members);
        });

        it("is disabled when groupId undefined", () => {
            const { result } = renderHook(() => useGroupMembers(undefined), {
                wrapper: createWrapper(),
            });
            expect(result.current.fetchStatus).toBe("idle");
        });
    });

    describe("useCreateGroup", () => {
        it("creates a group", async () => {
            vi.mocked(api.post).mockResolvedValueOnce({
                data: { id: "g-new" },
            });

            const { result } = renderHook(() => useCreateGroup(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({ name: "New Group" });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith("/groups/", {
                name: "New Group",
            });
        });
    });

    describe("useAddMember", () => {
        it("adds a member to a group", async () => {
            vi.mocked(api.post).mockResolvedValueOnce({ data: { ok: true } });

            const { result } = renderHook(() => useAddMember(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                groupId: "g1",
                body: { user_id: "user-abc", role: "viewer" },
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith("/groups/g1/members", {
                user_id: "user-abc",
                role: "viewer",
            });
        });
    });

    describe("useRemoveMember", () => {
        it("removes a member from a group", async () => {
            vi.mocked(api.delete).mockResolvedValueOnce({ data: null });

            const { result } = renderHook(() => useRemoveMember(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({ groupId: "g1", memberId: "m1" });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith("/groups/g1/members/m1");
        });
    });
});
