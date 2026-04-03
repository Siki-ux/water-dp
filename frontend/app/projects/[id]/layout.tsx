"use client";

import { ProjectSidebar } from "@/components/ProjectSidebar";
import { useProject } from "@/hooks/queries/useProjects";
import { useParams } from "next/navigation";

export default function ProjectContextLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const params = useParams();
    const id = params.id as string;
    const { data: project } = useProject(id);
    const projectName = project?.name ?? "Loading…";

    return (
        <div className="flex min-h-[calc(100vh-64px)]">
            <ProjectSidebar projectId={id} projectName={projectName} />
            <main className="flex-1 md:ml-64 p-8 animate-in fade-in duration-500">
                {children}
            </main>
        </div>
    );
}
