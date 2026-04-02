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
    useThing,
    useThingDatastreams,
    useLinkSensor,
    useUnlinkSensor,
} from "@/hooks/queries/useSensors";

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

describe("useSensors hooks", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("useThing", () => {
        it("fetches a thing by uuid", async () => {
            const thing = { uuid: "abc", name: "Sensor 1" };
            vi.mocked(api.get).mockResolvedValueOnce({ data: thing });

            const { result } = renderHook(() => useThing("abc"), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(thing);
            expect(api.get).toHaveBeenCalledWith("/things/abc");
        });

        it("is disabled when uuid is undefined", () => {
            const { result } = renderHook(() => useThing(undefined), {
                wrapper: createWrapper(),
            });
            expect(result.current.fetchStatus).toBe("idle");
            expect(api.get).not.toHaveBeenCalled();
        });
    });

    describe("useThingDatastreams", () => {
        it("fetches datastreams for a thing", async () => {
            const streams = [{ id: "ds1" }, { id: "ds2" }];
            vi.mocked(api.get).mockResolvedValueOnce({ data: streams });

            const { result } = renderHook(() => useThingDatastreams("abc"), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toHaveLength(2);
            expect(api.get).toHaveBeenCalledWith("/things/abc/datastreams");
        });
    });

    describe("useLinkSensor", () => {
        it("posts to link a sensor to a project", async () => {
            vi.mocked(api.post).mockResolvedValueOnce({
                data: { status: "linked" },
            });

            const { result } = renderHook(() => useLinkSensor(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                projectId: "proj-1",
                thingUuid: "thing-abc",
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith(
                "/projects/proj-1/sensors",
                null,
                { params: { thing_uuid: "thing-abc" } },
            );
        });
    });

    describe("useUnlinkSensor", () => {
        it("deletes a sensor link from a project", async () => {
            vi.mocked(api.delete).mockResolvedValueOnce({ data: null });

            const { result } = renderHook(() => useUnlinkSensor(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                projectId: "proj-1",
                sensorId: "s-1",
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith(
                "/projects/proj-1/sensors/s-1",
                { params: undefined },
            );
        });

        it("passes delete_from_source param when requested", async () => {
            vi.mocked(api.delete).mockResolvedValueOnce({ data: null });

            const { result } = renderHook(() => useUnlinkSensor(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                projectId: "proj-1",
                sensorId: "s-1",
                deleteFromSource: true,
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.delete).toHaveBeenCalledWith(
                "/projects/proj-1/sensors/s-1",
                { params: { delete_from_source: true } },
            );
        });
    });
});
