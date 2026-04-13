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
    useAlertDefinitions,
    useAlertHistory,
    useCreateAlert,
    useUpdateAlert,
    useDeleteAlert,
} from "@/hooks/queries/useAlerts";

function createWrapper() {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
}

describe("useAlerts hooks", () => {
    beforeEach(() => vi.clearAllMocks());

    describe("useAlertDefinitions", () => {
        it("fetches alert definitions for a project", async () => {
            const defs = [{ id: "a1", name: "High Temp" }];
            vi.mocked(api.get).mockResolvedValueOnce({ data: defs });

            const { result } = renderHook(
                () => useAlertDefinitions("proj-1"),
                { wrapper: createWrapper() },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(defs);
            expect(api.get).toHaveBeenCalledWith("/alerts/definitions/proj-1");
        });

        it("is disabled when projectId is undefined", () => {
            const { result } = renderHook(
                () => useAlertDefinitions(undefined),
                { wrapper: createWrapper() },
            );
            expect(result.current.fetchStatus).toBe("idle");
        });
    });

    describe("useAlertHistory", () => {
        it("fetches alert history", async () => {
            const history = [{ id: "h1", status: "fired" }];
            vi.mocked(api.get).mockResolvedValueOnce({ data: history });

            const { result } = renderHook(
                () => useAlertHistory("proj-1", { limit: 10 }),
                { wrapper: createWrapper() },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(history);
        });
    });

    describe("useCreateAlert", () => {
        it("posts alert definition", async () => {
            vi.mocked(api.post).mockResolvedValueOnce({ data: { id: "new" } });

            const { result } = renderHook(() => useCreateAlert(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                projectId: "proj-1",
                body: { name: "Alert", threshold: 30 },
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith(
                "/alerts/definitions/proj-1",
                { name: "Alert", threshold: 30 },
            );
        });
    });

    describe("useUpdateAlert", () => {
        it("updates an alert definition", async () => {
            vi.mocked(api.put).mockResolvedValueOnce({
                data: { id: "a1", name: "Updated" },
            });

            const { result } = renderHook(() => useUpdateAlert(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                alertId: "a1",
                body: { name: "Updated" },
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.put).toHaveBeenCalledWith(
                "/alerts/definitions/a1",
                { name: "Updated" },
            );
        });
    });

    describe("useDeleteAlert", () => {
        it("deletes an alert", async () => {
            vi.mocked(api.delete).mockResolvedValueOnce({ data: null });

            const { result } = renderHook(() => useDeleteAlert(), {
                wrapper: createWrapper(),
            });

            result.current.mutate("a1");

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith("/alerts/definitions/a1");
        });
    });
});
