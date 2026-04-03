import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import GroupsList from "./groups-list";
import CreateGroupButton from "./create-group-button";
import { T } from "@/components/T";

export default async function GroupsPage() {
    const session = await auth();
    if (!session?.accessToken) {
        redirect("/login");
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white"><T path="groups.title" /></h1>
                    <p className="text-white/60 mt-1"><T path="groups.desc" /></p>
                </div>
                <CreateGroupButton />
            </div>

            <GroupsList token={session.accessToken} />
        </div>
    );
}
