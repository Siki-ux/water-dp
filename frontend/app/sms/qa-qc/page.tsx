import { auth } from "@/lib/auth";
import SMSQAQCClient from "./client";

export default async function QaQcPage() {
    const session = await auth();

    if (!session?.accessToken) {
        return <div className="text-white/50 p-8">Please log in to manage QA/QC configurations.</div>;
    }

    return <SMSQAQCClient token={session.accessToken} />;
}
