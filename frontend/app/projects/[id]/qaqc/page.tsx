import { auth } from "@/lib/auth";
import QAQCClient from "./client";

export default async function QAQCPage() {
    const session = await auth();

    if (!session?.accessToken) {
        return <div className="text-white/50 p-8">Please log in to manage QA/QC configurations.</div>;
    }

    return <QAQCClient token={session.accessToken} />;
}
