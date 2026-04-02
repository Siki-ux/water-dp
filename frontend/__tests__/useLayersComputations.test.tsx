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
    useLayers,
    useLayer,
    useCreateLayer,
    useDeleteLayer,
} from "@/hooks/queries/useLayers";
import {
    useComputations,
    useDeleteComputation,
} from "@/hooks/queries/useComputations";

function createWrapper() {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
}

describe("useLayers hooks", () => {
    beforeEach(() => vi.clearAllMocks());

    describe("useLayers", () => {
        it("fetches layer list", async () => {
            const layers = [{ name: "rivers" }, { name: "stations" }];
            vi.mocked(api.get).mockResolvedValueOnce({ data: layers });

            const { result } = renderHook(() => useLayers(), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(layers);
            expect(api.get).toHaveBeenCalledWith("/geospatial/layers", {
                params: { limit: 100 },
            });
        });
    });

    describe("useLayer", () => {
        it("fetches a layer by name", async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: { name: "rivers", type: "vector" },
            });

            const { result } = renderHook(() => useLayer("rivers"), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.get).toHaveBeenCalledWith("/geospatial/layers/rivers");
        });

        it("is disabled when name undefined", () => {
            const { result } = renderHook(() => useLayer(undefined), {
                wrapper: createWrapper(),
            });
            expect(result.current.fetchStatus).toBe("idle");
        });
    });

    describe("useDeleteLayer", () => {
        it("deletes a layer by name", async () => {
            vi.mocked(api.delete).mockResolvedValueOnce({ data: null });

            const { result } = renderHook(() => useDeleteLayer(), {
                wrapper: createWrapper(),
            });

            result.current.mutate("rivers");

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith(
                "/geospatial/layers/rivers",
            );
        });
    });
});

describe("useComputations hooks", () => {
    beforeEach(() => vi.clearAllMocks());

    describe("useComputations", () => {
        it("fetches computations for a project", async () => {
            const scripts = [{ id: "c1", name: "Script A" }];
            vi.mocked(api.get).mockResolvedValueOnce({ data: scripts });

            const { result } = renderHook(
                () => useComputations("proj-1"),
                { wrapper: createWrapper() },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(scripts);
            expect(api.get).toHaveBeenCalledWith(
                "/computations/list/proj-1",
            );
        });

        it("is disabled when projectId undefined", () => {
            const { result } = renderHook(
                () => useComputations(undefined),
                { wrapper: createWrapper() },
            );
            expect(result.current.fetchStatus).toBe("idle");
        });
    });

    describe("useDeleteComputation", () => {
        it("deletes a computation script", async () => {
            vi.mocked(api.delete).mockResolvedValueOnce({ data: null });

            const { result } = renderHook(() => useDeleteComputation(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                projectId: "proj-1",
                scriptId: "c1",
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith("/computations/c1", {
                params: { project_id: "proj-1" },
            });
        });
    });
});
