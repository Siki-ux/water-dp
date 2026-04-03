import { auth } from "@/lib/auth";
import { getApiUrl } from "@/lib/utils";
import { notFound } from "next/navigation";
import { DeviceTypeDetailClient } from "./DeviceTypeDetailClient";

async function getDeviceType(id: string) {
    const session = await auth();
    if (!session?.accessToken) return null;

    const apiUrl = getApiUrl();
    try {
        const res = await fetch(`${apiUrl}/sms/attributes/device-types/${id}`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: 'no-store'
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export default async function DeviceTypeDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const deviceType = await getDeviceType(id);

    if (!deviceType) {
        notFound();
    }

    return <DeviceTypeDetailClient deviceType={deviceType} />;
}
