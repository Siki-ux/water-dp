import { getApiUrl } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { ApiTypesClient } from "./ApiTypesClient";

async function getApiTypes() {
    const session = await auth();
    if (!session?.accessToken) return { items: [], total: 0 };

    const apiUrl = getApiUrl();
    try {
        const res = await fetch(`${apiUrl}/external-sources/api-types`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: 'no-store'
        });
        if (!res.ok) return { items: [], total: 0 };
        return await res.json();
    } catch {
        return { items: [], total: 0 };
    }
}

export default async function ApiTypesPage() {
    const data = await getApiTypes();
    const apiTypes = data.items || [];

    return <ApiTypesClient apiTypes={apiTypes} />;
}
