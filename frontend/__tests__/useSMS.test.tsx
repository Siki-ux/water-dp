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
    useSMSSensors,
    useSMSSensorDetail,
    useDeviceTypes,
    useParsers,
    useIngestTypes,
    useCreateSensor,
    useUpdateSensor,
} from "@/hooks/queries/useSMS";

function createWrapper() {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
}

describe("useSMS hooks", () => {
    beforeEach(() => vi.clearAllMocks());

    describe("useSMSSensors", () => {
        it("fetches paginated sensor list", async () => {
            const data = {
                items: [{ uuid: "s1" }],
                total: 1,
                page: 1,
                page_size: 20,
            };
            vi.mocked(api.get).mockResolvedValueOnce({ data });

            const { result } = renderHook(
                () => useSMSSensors({ page: 1, page_size: 20 }),
                { wrapper: createWrapper() },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(data);
            expect(api.get).toHaveBeenCalledWith("/sms/sensors", {
                params: { page: 1, page_size: 20 },
            });
        });

        it("passes search and ingest_type filters", async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: { items: [], total: 0 },
            });

            const { result } = renderHook(
                () =>
                    useSMSSensors({
                        search: "river",
                        ingest_type: "mqtt",
                    }),
                { wrapper: createWrapper() },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.get).toHaveBeenCalledWith("/sms/sensors", {
                params: { search: "river", ingest_type: "mqtt" },
            });
        });
    });

    describe("useSMSSensorDetail", () => {
        it("fetches sensor detail by uuid", async () => {
            const sensor = { uuid: "abc", name: "Sensor 1" };
            vi.mocked(api.get).mockResolvedValueOnce({ data: sensor });

            const { result } = renderHook(
                () => useSMSSensorDetail("abc"),
                { wrapper: createWrapper() },
            );

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(sensor);
            expect(api.get).toHaveBeenCalledWith("/sms/sensors/abc");
        });

        it("is disabled when uuid undefined", () => {
            const { result } = renderHook(
                () => useSMSSensorDetail(undefined),
                { wrapper: createWrapper() },
            );
            expect(result.current.fetchStatus).toBe("idle");
        });
    });

    describe("useDeviceTypes", () => {
        it("fetches device types", async () => {
            const types = {
                items: [{ id: "dt1", name: "Generic" }],
                total: 1,
            };
            vi.mocked(api.get).mockResolvedValueOnce({ data: types });

            const { result } = renderHook(() => useDeviceTypes(), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.get).toHaveBeenCalledWith(
                "/sms/attributes/device-types",
                { params: undefined },
            );
        });
    });

    describe("useParsers", () => {
        it("fetches parsers", async () => {
            vi.mocked(api.get).mockResolvedValueOnce({
                data: { items: [], total: 0 },
            });

            const { result } = renderHook(() => useParsers(), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.get).toHaveBeenCalledWith(
                "/sms/attributes/parsers",
                { params: undefined },
            );
        });
    });

    describe("useIngestTypes", () => {
        it("fetches ingest types", async () => {
            const types = [{ id: "mqtt" }, { id: "sftp" }];
            vi.mocked(api.get).mockResolvedValueOnce({ data: types });

            const { result } = renderHook(() => useIngestTypes(), {
                wrapper: createWrapper(),
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(result.current.data).toEqual(types);
        });
    });

    describe("useCreateSensor", () => {
        it("posts to create sensor", async () => {
            vi.mocked(api.post).mockResolvedValueOnce({
                data: { uuid: "new-uuid" },
            });

            const { result } = renderHook(() => useCreateSensor(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({ sensor_name: "S1", group_id: "g1" });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.post).toHaveBeenCalledWith("/things/", {
                sensor_name: "S1",
                group_id: "g1",
            });
        });
    });

    describe("useUpdateSensor", () => {
        it("updates sensor details", async () => {
            vi.mocked(api.put).mockResolvedValueOnce({
                data: { uuid: "abc", name: "Updated" },
            });

            const { result } = renderHook(() => useUpdateSensor(), {
                wrapper: createWrapper(),
            });

            result.current.mutate({
                uuid: "abc",
                body: { name: "Updated" },
            });

            await waitFor(() => expect(result.current.isSuccess).toBe(true));
            expect(api.put).toHaveBeenCalledWith("/sms/sensors/abc", {
                name: "Updated",
            });
        });
    });
});
