import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import GroupDetail from "./group-detail";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.accessToken) {
        redirect("/login");
    }

    const { id } = await params;

    return (
        <div className="container mx-auto max-w-6xl py-12 px-4">
            <GroupDetail groupId={id} token={session.accessToken} />
        </div>
    );
}
