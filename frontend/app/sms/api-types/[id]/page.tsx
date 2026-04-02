import { auth } from "@/lib/auth";
import { getApiUrl } from "@/lib/utils";
import { notFound } from "next/navigation";
import { ApiTypeDetailClient } from "./ApiTypeDetailClient";

async function getApiType(id: string) {
    const session = await auth();
    if (!session?.accessToken) return null;

    const apiUrl = getApiUrl();
    try {
        // Try with code included (requires superuser)
        let res = await fetch(`${apiUrl}/external-sources/api-types/${id}?include_code=true`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: 'no-store'
        });
        if (res.status === 403) {
            // Retry without code for non-superusers
            res = await fetch(`${apiUrl}/external-sources/api-types/${id}`, {
                headers: { Authorization: `Bearer ${session.accessToken}` },
                cache: 'no-store'
            });
        }
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export default async function ApiTypeDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const apiType = await getApiType(id);

    if (!apiType) {
        notFound();
    }

    return <ApiTypeDetailClient apiType={apiType} />;
}
