"use client";

import { ProjectsClientView } from "@/components/ProjectsClientView";
import { useSearchParams } from "next/navigation";

export default function ProjectsPage() {
    const searchParams = useSearchParams();
    const groupId = searchParams.get("group_id") || undefined;

    return <ProjectsClientView selectedGroupId={groupId} />;
}
