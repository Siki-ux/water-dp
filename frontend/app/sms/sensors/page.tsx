"use client";

import { useSearchParams } from "next/navigation";
import { SensorsClient } from "./SensorsClient";
import { useSMSSensors } from "@/hooks/queries/useSMS";
import { Loader2 } from "lucide-react";

const PAGE_SIZE = 20;

export default function SensorsPage() {
    const searchParams = useSearchParams();
    const page = Number(searchParams.get("page")) || 1;
    const search = searchParams.get("search") || "";
    const ingestType = searchParams.get("ingest_type") || "";

    const { data, isLoading } = useSMSSensors({
        page,
        page_size: PAGE_SIZE,
        search: search || undefined,
        ingest_type: ingestType || undefined,
    });

    const totalPages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20 text-white/40">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading sensors…
            </div>
        );
    }

    return (
        <SensorsClient
            data={data ?? { items: [], total: 0 }}
            page={page}
            pageSize={PAGE_SIZE}
            totalPages={totalPages}
            search={search}
            ingestType={ingestType}
        />
    );
}
