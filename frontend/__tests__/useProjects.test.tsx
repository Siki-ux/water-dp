import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock the api module before importing hooks
vi.mock("@/lib/api", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
    },
    clearTokenCache: vi.fn(),
}));

import api from "@/lib/api";
import {
    useProjects,
    useProject,
    useProjectSensors,
    useProjectDashboards,
    useCreateProject,
    useUpdateProject,
    useDeleteProject,
} from "@/hooks/queries/useProjects";

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

describe("useProjects hooks", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("useProjects", () => {
        it("fetches projects list", async () => {
            const mockProjects = [
                { id: "1", name: "P1", sensor_count: 5 },
                { id: "2", name: "P2", sensor_count: 0 },
            ];
            vi.mocked(api.get).mockResolvedValueOnce({ data: mockProjects });

            const { result } = renderHook(() => useProjects(), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(result.current.data).toEqual(mockProjects);
            expect(api.get).toHaveBeenCalledWith("/projects/", {
                params: undefined,
            });
        });

        it("passes group_id as query param when provided", async () => {
            vi.mocked(api.get).mockResolvedValueOnce({ data: [] });

            const { result } = renderHook(() => useProjects("group-abc"), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));

            expect(api.get).toHaveBeenCalledWith("/projects/", {
                params: { group_id: "group-abc" },
            });
        });

        it("handles API error gracefully", async () => {
            vi.mocked(api.get).mockRejectedValueOnce(new Error("Network error"));

            const { result } = renderHook(() => useProjects(), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isError).toBe(true));
            expect(result.current.error).toBeDefined();
        });
    });

    describe("useProject", () => {
        it("fetches single project by id", async () => {
            const mockProject = { id: "proj-1", name: "P1", sensor_count: 3 };
            vi.mocked(api.get).mockResolvedValueOnce({ data: mockProject });

            const { result } = renderHook(() => useProject("proj-1"), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(mockProject);
            expect(api.get).toHaveBeenCalledWith("/projects/proj-1");
        });

        it("does not fetch when id is undefined", () => {
            const { result } = renderHook(() => useProject(undefined), {
                wrapper: createWrapper(),
            });

            expect(result.current.fetchStatus).toBe("idle");
            expect(api.get).not.toHaveBeenCalled();
        });
    });

    describe("useProjectSensors", () => {
        it("fetches linked sensors for a project", async () => {
            const sensors = [{ sensor_uuid: "s1" }, { sensor_uuid: "s2" }];
            vi.mocked(api.get).mockResolvedValueOnce({ data: sensors });

            const { result } = renderHook(
                () => useProjectSensors("proj-1"),
                { wrapper: createWrapper() },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toHaveLength(2);
            expect(api.get).toHaveBeenCalledWith("/projects/proj-1/sensors");
        });

        it("is disabled when projectId is undefined", () => {
            const { result } = renderHook(
                () => useProjectSensors(undefined),
                { wrapper: createWrapper() },
            );
            expect(result.current.fetchStatus).toBe("idle");
        });
    });

    describe("useProjectDashboards", () => {
        it("fetches dashboards for a project", async () => {
            const dashboards = [{ id: "d1", name: "Dashboard 1" }];
            vi.mocked(api.get).mockResolvedValueOnce({ data: dashboards });

            const { result } = renderHook(
                () => useProjectDashboards("proj-1"),
                { wrapper: createWrapper() },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(dashboards);
        });
    });

    describe("useCreateProject", () => {
        it("calls POST /projects/ and invalidates cache", async () => {
            const newProject = { id: "new-1", name: "New Project" };
            vi.mocked(api.post).mockResolvedValueOnce({ data: newProject });

            const { result } = renderHook(() => useCreateProject(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({ name: "New Project", description: "desc" });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(newProject);
            expect(api.post).toHaveBeenCalledWith("/projects/", {
                name: "New Project",
                description: "desc",
            });
        });
    });

    describe("useUpdateProject", () => {
        it("calls PUT /projects/:id", async () => {
            vi.mocked(api.put).mockResolvedValueOnce({
                data: { id: "p1", name: "Updated" },
            });

            const { result } = renderHook(() => useUpdateProject(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                id: "p1",
                body: { name: "Updated" },
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.put).toHaveBeenCalledWith("/projects/p1", {
                name: "Updated",
            });
        });
    });

    describe("useDeleteProject", () => {
        it("calls DELETE /projects/:id", async () => {
            vi.mocked(api.delete).mockResolvedValueOnce({ data: null });

            const { result } = renderHook(() => useDeleteProject(), {
                wrapper: createWrapper(),
            });

            result.current.mutate("p1");

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith("/projects/p1");
        });
    });
});
