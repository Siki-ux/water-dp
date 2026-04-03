import { auth } from "@/lib/auth";
import { getApiUrl } from "@/lib/utils";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Terminal, FileCode, Settings } from "lucide-react";
import { ParserEditDialog } from "@/components/ParserEditDialog"; // We will create this

async function getParser(uuid: string) {
    const session = await auth();
    if (!session?.accessToken) return null;

    const apiUrl = getApiUrl();
    try {
        const res = await fetch(`${apiUrl}/sms/parsers/${uuid}`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: 'no-store'
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

export default async function ParserDetailsPage({ params }: { params: Promise<{ uuid: string }> }) {
    const { uuid } = await params;
    const parser = await getParser(uuid);

    if (!parser) {
        notFound();
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
            {/* Header / Breadcrumb */}
            <div className="flex items-center gap-4">
                <Link
                    href="/sms/parsers"
                    className="p-2 rounded-lg bg-muted/50 hover:bg-muted text-[var(--foreground)]/60 hover:text-[var(--foreground)] transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight flex items-center gap-3">
                        {parser.name}
                        <span className="px-2.5 py-0.5 rounded-md text-sm font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            ID: #{parser.id}
                        </span>
                    </h1>
                    <p className="text-[var(--foreground)]/60 text-sm mt-1 font-mono text-xs">{parser.uuid}</p>
                </div>
                <div className="ml-auto">
                    <ParserEditDialog parser={parser} />
                </div>
            </div>

            <div className="space-y-6">
                {/* Main Info */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-xl">
                    <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-purple-400" />
                        Configuration
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs uppercase text-[var(--foreground)]/40 font-semibold mb-1">Type</label>
                            <div className="flex items-center gap-2 text-[var(--foreground)]/80 bg-muted/50 p-3 rounded-lg border border-border">
                                <FileCode className="w-4 h-4 text-blue-400" />
                                {parser.type}
                            </div>
                        </div>

                        {/* Display Settings nicely */}
                        <div className="md:col-span-2">
                            <label className="block text-xs uppercase text-[var(--foreground)]/40 font-semibold mb-2 flex items-center gap-2">
                                <Settings className="w-3 h-3" />
                                Settings
                            </label>
                            <div className="bg-muted/50 rounded-lg border border-border p-4 font-mono text-sm text-[var(--foreground)]/70 overflow-x-auto">
                                <pre>{JSON.stringify(parser.settings, null, 2)}</pre>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
