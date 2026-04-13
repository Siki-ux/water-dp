import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

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
    useDashboard,
    useCreateDashboard,
    useUpdateDashboard,
    useDeleteDashboard,
} from "@/hooks/queries/useDashboards";

function createWrapper() {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
}

describe("useDashboards hooks", () => {
    beforeEach(() => vi.clearAllMocks());

    describe("useDashboard", () => {
        it("fetches dashboard by id", async () => {
            const dash = { id: "d1", name: "Main", widgets: [] };
            vi.mocked(api.get).mockResolvedValueOnce({ data: dash });

            const { result } = renderHook(() => useDashboard("d1"), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(dash);
            expect(api.get).toHaveBeenCalledWith("/dashboards/d1");
        });

        it("is disabled when id is undefined", () => {
            const { result } = renderHook(() => useDashboard(undefined), {
                wrapper: createWrapper(),
            });
            expect(result.current.fetchStatus).toBe("idle");
        });
    });

    describe("useCreateDashboard", () => {
        it("creates a dashboard for a project", async () => {
            vi.mocked(api.post).mockResolvedValueOnce({
                data: { id: "d-new", name: "New" },
            });

            const { result } = renderHook(() => useCreateDashboard(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                projectId: "proj-1",
                body: { name: "New", is_public: false },
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith(
                "/projects/proj-1/dashboards",
                { name: "New", is_public: false },
            );
        });
    });

    describe("useUpdateDashboard", () => {
        it("updates a dashboard", async () => {
            vi.mocked(api.put).mockResolvedValueOnce({
                data: { id: "d1", name: "Updated" },
            });

            const { result } = renderHook(() => useUpdateDashboard(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                id: "d1",
                body: { name: "Updated" },
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.put).toHaveBeenCalledWith("/dashboards/d1", {
                name: "Updated",
            });
        });
    });

    describe("useDeleteDashboard", () => {
        it("deletes a dashboard", async () => {
            vi.mocked(api.delete).mockResolvedValueOnce({ data: null });

            const { result } = renderHook(() => useDeleteDashboard(), {
                wrapper: createWrapper(),
            });

            result.current.mutate("d1");

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith("/dashboards/d1");
        });
    });
});
