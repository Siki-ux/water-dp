
import { auth, parseJwt } from "@/lib/auth";
import { redirect } from "next/navigation";
import NewProjectForm from "./form";

export default async function NewProjectPage() {
    const session = await auth();
    if (!session?.accessToken) {
        redirect("/login");
    }

    let userGroups: any[] = [];
    if (session.accessToken) {
        try {
            const apiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
            const res = await fetch(`${apiUrl}/groups/my-authorization-groups`, {
                headers: {
                    "Authorization": `Bearer ${session.accessToken}`
                },
                cache: 'no-store'
            });

            if (res.ok) {
                const groups = await res.json();
                if (Array.isArray(groups)) {
                    userGroups = groups.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
                }
            } else {
                console.error("Failed to fetch authorization groups", res.status);
            }
        } catch (e) {
            console.error("Error fetching authorization groups", e);
        }
    }

    return (
        <div className="container mx-auto max-w-2xl py-12 px-4">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Create New Project</h1>
                <p className="text-white/60">Initialize a new workspace with Keycloak group and TimeIO integration.</p>
            </div>
            <NewProjectForm token={session.accessToken} groups={userGroups} />
        </div>
    );
}
