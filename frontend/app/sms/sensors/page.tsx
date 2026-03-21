import { getApiUrl } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { SensorsClient } from "./SensorsClient";

async function getSensors(page = 1, pageSize = 20, search?: string, ingestType?: string) {
    const session = await auth();
    if (!session?.accessToken) return { items: [], total: 0 };

    const apiUrl = getApiUrl();
    const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
    });
    if (search) params.set("search", search);
    if (ingestType) params.set("ingest_type", ingestType);

    try {
        const res = await fetch(`${apiUrl}/sms/sensors?${params}`, {
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
            },
            cache: 'no-store'
        });

        if (!res.ok) throw new Error("Failed to fetch sensors");

        return await res.json();
    } catch (error) {
        console.error("Error fetching sensors:", error);
        return { items: [], total: 0 };
    }
}

export default async function SensorsPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; search?: string; ingest_type?: string }>;
}) {
    const params = await searchParams;
    const page = Number(params.page) || 1;
    const pageSize = 20;
    const search = params.search || "";
    const ingestType = params.ingest_type || "";
    const data = await getSensors(page, pageSize, search, ingestType);
    const totalPages = Math.ceil(data.total / pageSize);

    return (
        <SensorsClient
            data={data}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            search={search}
            ingestType={ingestType}
        />
    );
}
