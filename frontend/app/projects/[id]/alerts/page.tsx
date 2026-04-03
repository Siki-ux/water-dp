
import { auth } from "@/lib/auth";
import AlertsClient from "./client";

export default async function AlertsPage() {
    const session = await auth();

    if (!session?.accessToken) {
        return <div className="text-white/50 p-8">Please log in to manage alerts.</div>;
    }

    return <AlertsClient token={session.accessToken} />;
}
