
import { auth } from "@/lib/auth";
import ComputationsClient from "./client";

export default async function ComputationsPage() {
    const session = await auth();

    // If not authenticated, the Layout or Middleware usually handles this, 
    // but we can ensure we have a token here.
    if (!session?.accessToken) {
        return <div className="text-white/50 p-8">Please log in to view computations.</div>;
    }

    return <ComputationsClient token={session.accessToken} />;
}
