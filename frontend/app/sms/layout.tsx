
import { AppHeader } from "@/components/AppHeader";
import { SMSSidebar } from "@/components/SMSSidebar";
import { WaterBackground } from "@/components/WaterBackground";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SMSLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const session = await auth();

    if (!session) {
        redirect("/auth/signin");
    }

    return (
        <div className="relative min-h-screen bg-water-depth text-white font-[family-name:var(--font-geist-sans)]">
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
