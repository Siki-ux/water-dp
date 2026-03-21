import { ProjectsClientView } from "@/components/ProjectsClientView";
import { getApiUrl } from "@/lib/utils";
import { auth } from "@/lib/auth";

async function getProjects() {
    const session = await auth();
    if (!session?.accessToken) return [];

    const apiUrl = getApiUrl();

    try {
        const res = await fetch(`${apiUrl}/projects/`, {
            headers: {
                Authorization: `Bearer ${session.accessToken}`,
            },
            cache: 'no-store' // Ensure fresh data
        });

        if (!res.ok) throw new Error("Failed to fetch projects");

        return await res.json();
    } catch (error) {
        console.error("Error fetching projects:", error);
        return [];
    }
}

async function getProjectSensorCount(id: string, session: any) {
    if (!session?.accessToken) return 0;
    const apiUrl = getApiUrl();

    try {
        const res = await fetch(`${apiUrl}/projects/${id}/sensors`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: 'no-store'
        });
        if (!res.ok) return 0;
        const sensors = await res.json();
        return sensors.length;
    } catch {
        return 0;
    }
}

export default async function ProjectsPage() {
    const session = await auth();
    const projects = await getProjects();

    // Fetch sensor counts in parallel
    const projectsWithCounts = await Promise.all(projects.map(async (project: any) => {
        const count = await getProjectSensorCount(project.id, session);
        return { ...project, sensorCount: count };
    }));

    return <ProjectsClientView projectsWithCounts={projectsWithCounts} />;
}
