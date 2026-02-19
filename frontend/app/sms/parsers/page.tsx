import { getApiUrl } from "@/lib/utils";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { Terminal, FileCode, CheckCircle, Database } from "lucide-react";
import { ParserCreateDialog } from "@/components/ParserCreateDialog";

async function getParsers() {
    const session = await auth();
    if (!session?.accessToken) return { items: [], total: 0 };

    const apiUrl = getApiUrl();
    try {
        const res = await fetch(`${apiUrl}/sms/attributes/parsers?page=1&page_size=100`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
            cache: 'no-store'
        });
        if (!res.ok) return { items: [], total: 0 };
        return await res.json();
    } catch {
        return { items: [], total: 0 };
    }
}

export default async function ParsersPage() {
    const data = await getParsers();
    const parsers = data.items || [];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Parsers</h1>
                    <p className="text-white/60 text-sm mt-1">Manage data parsers for incoming sensor payloads.</p>
                </div>
                <ParserCreateDialog />
            </div>

            <div className="bg-[#0A0A0A] border border-white/10 rounded-xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/5">
                                <th className="p-4 text-xs font-semibold text-white/60 uppercase tracking-wider w-12">ID</th>
                                <th className="p-4 text-xs font-semibold text-white/60 uppercase tracking-wider">Name</th>
                                <th className="p-4 text-xs font-semibold text-white/60 uppercase tracking-wider">Type</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {parsers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-white/40">
                                        No parsers found.
                                    </td>
                                </tr>
                            ) : (
                                parsers.map((parser: any) => (
                                    <tr
                                        key={parser.id}
                                        className="group hover:bg-white/[0.02] transition-colors duration-150"
                                    >
                                        <td className="p-4 text-sm text-white/40 font-mono">
                                            #{parser.id}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                                                    <Terminal className="w-4 h-4" />
                                                </div>
                                                <Link href={`/sms/parsers/${parser.uuid}`} className="font-medium text-white group-hover:text-purple-300 transition-colors hover:underline">
                                                    {parser.name}
                                                </Link>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white/5 text-white/60 border border-white/10">
                                                <FileCode className="w-3 h-3" />
                                                {parser.type || "Unknown"}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer / Pagination Placeholder */}
                <div className="p-4 border-t border-white/10 bg-white/5 flex justify-between items-center text-xs text-white/40">
                    <span>Showing {parsers.length} parsers</span>
                    {/* Add pagination controls later if needed */}
                </div>
            </div>
        </div>
    );
}
