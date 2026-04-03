import { getApiUrl } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { DeviceTypesClient } from "./DeviceTypesClient";

async function getDeviceTypes() {
    const session = await auth();
    if (!session?.accessToken) return { items: [], total: 0 };

    const apiUrl = getApiUrl();
    try {
        const res = await fetch(`${apiUrl}/sms/attributes/device-types?page=1&page_size=100`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: 'no-store'
        });
        if (!res.ok) return { items: [], total: 0 };
        return await res.json();
    } catch {
        return { items: [], total: 0 };
    }
}

export default async function DeviceTypesPage() {
    const data = await getDeviceTypes();
    const deviceTypes = data.items || [];

    return <DeviceTypesClient deviceTypes={deviceTypes} />;
}
