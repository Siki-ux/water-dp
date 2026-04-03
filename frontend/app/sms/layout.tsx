
import { AppHeader } from "@/components/AppHeader";
import { SMSSidebar } from "@/components/SMSSidebar";
import { WaterBackground } from "@/components/WaterBackground";
import { auth, parseJwt } from "@/lib/auth";
import { redirect } from "next/navigation";
import { parseGroupRoles, getHighestGroupRole, isRealmAdmin } from "@/lib/jwt";

export default async function SMSLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const session = await auth();

    if (!session) {
        redirect("/auth/signin");
    }

    // Guard: only editors and admins (or realm admins) may access SMS
    const decoded = parseJwt((session as any).accessToken ?? "");
    const jwtGroups: string[] = (decoded?.groups as string[]) ?? [];
    const groupRoles = parseGroupRoles(jwtGroups);
    const highest = getHighestGroupRole(groupRoles);
    const hasAccess = isRealmAdmin(decoded) || highest === "editor" || highest === "admin";
    if (!hasAccess) {
        redirect("/projects");
    }

    return (
        <div className="relative min-h-screen bg-water-depth text-[var(--foreground)] font-[family-name:var(--font-geist-sans)]">
            <div className="fixed inset-0 z-0">
                <WaterBackground />
            </div>

            <AppHeader />

            <div className="flex min-h-[calc(100vh-64px)] pt-16">
                <SMSSidebar />
                <main className="relative z-10 flex-1 md:ml-64 p-8 animate-in fade-in duration-500">
                    {children}
                </main>
            </div>
        </div>
    );
}
