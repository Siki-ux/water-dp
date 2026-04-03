import { ProjectSidebar } from "@/components/ProjectSidebar";
import { getApiUrl } from "@/lib/utils";
import { auth } from "@/lib/auth";

async function getProjectName(id: string) {
    const session = await auth();
    if (!session?.accessToken) return "Unknown Project";

    const apiUrl = getApiUrl();

    try {
        const res = await fetch(`${apiUrl}/projects/${id}`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: 'no-store' // Keep it fresh
        });
        if (!res.ok) return "Unknown Project";
        const data = await res.json();
        return data.name;
    } catch {
        return "Unknown Project";
    }
}

export default async function ProjectContextLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ id: string }>;
}) {
    // In Next.js 15, params are async. Need to await.

    const { id } = await params;
    const projectName = await getProjectName(id);

    return (
        <div className="flex min-h-[calc(100vh-64px)]">
            <ProjectSidebar projectId={id} projectName={projectName} />
            <main className="flex-1 md:ml-64 p-8 animate-in fade-in duration-500">
                {children}
            </main>
        </div>
    );
}
