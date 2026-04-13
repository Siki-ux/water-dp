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
    useSimulations,
    useCreateSimulation,
    useToggleSimulation,
    useDeleteSimulation,
} from "@/hooks/queries/useSimulator";

function createWrapper() {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
}

describe("useSimulator hooks", () => {
    beforeEach(() => vi.clearAllMocks());

    describe("useSimulations", () => {
        it("fetches simulations for a project", async () => {
            const sims = [{ uuid: "s1", name: "Sim 1" }];
            vi.mocked(api.get).mockResolvedValueOnce({ data: sims });

            const { result } = renderHook(
                () => useSimulations("proj-1"),
                { wrapper: createWrapper() },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(sims);
            expect(api.get).toHaveBeenCalledWith(
                "/projects/proj-1/simulator/simulations",
            );
        });

        it("is disabled when projectId undefined", () => {
            const { result } = renderHook(
                () => useSimulations(undefined),
                { wrapper: createWrapper() },
            );
            expect(result.current.fetchStatus).toBe("idle");
        });
    });

    describe("useCreateSimulation", () => {
        it("creates a simulated thing", async () => {
            vi.mocked(api.post).mockResolvedValueOnce({
                data: { uuid: "new-sim" },
            });

            const { result } = renderHook(() => useCreateSimulation(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                projectId: "proj-1",
                body: { thing: { sensor_name: "S1" } },
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith(
                "/projects/proj-1/simulator/things",
                { thing: { sensor_name: "S1" } },
            );
        });
    });

    describe("useToggleSimulation", () => {
        it("starts a simulation", async () => {
            vi.mocked(api.post).mockResolvedValueOnce({
                data: { status: "started" },
            });

            const { result } = renderHook(() => useToggleSimulation(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                projectId: "proj-1",
                uuid: "sim-1",
                action: "start",
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith(
                "/projects/proj-1/simulator/simulations/sim-1/start",
            );
        });

        it("stops a simulation", async () => {
            vi.mocked(api.post).mockResolvedValueOnce({
                data: { status: "stopped" },
            });

            const { result } = renderHook(() => useToggleSimulation(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                projectId: "proj-1",
                uuid: "sim-1",
                action: "stop",
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith(
                "/projects/proj-1/simulator/simulations/sim-1/stop",
            );
        });
    });

    describe("useDeleteSimulation", () => {
        it("deletes a simulated thing", async () => {
            vi.mocked(api.delete).mockResolvedValueOnce({ data: null });

            const { result } = renderHook(() => useDeleteSimulation(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({ projectId: "proj-1", uuid: "sim-1" });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith(
                "/projects/proj-1/simulator/things/sim-1",
            );
        });
    });
});
