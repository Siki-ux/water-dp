"use client";

import { useState } from "react";
import { Terminal, FileCode } from "lucide-react";
import { ParserActionPopup } from "@/components/ParserActionPopup";
import { useTranslation } from "@/lib/i18n";

interface Parser {
    id: number;
    uuid: string;
    name: string;
    type_name?: string;
    params?: any;
}

export function ParserTable({ parsers }: { parsers: Parser[] }) {
    const [selectedParser, setSelectedParser] = useState<Parser | null>(null);
    const { t } = useTranslation();

    return (
        <>
            <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                <th className="p-4 text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-wider w-12">{t('sms.parsers.id')}</th>
                                <th className="p-4 text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-wider">{t('sms.parsers.name')}</th>
                                <th className="p-4 text-xs font-semibold text-[var(--foreground)]/60 uppercase tracking-wider">{t('sms.parsers.type')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {parsers.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="p-8 text-center text-[var(--foreground)]/40">
                                        {t('sms.parsers.noParsers')}
                                    </td>
                                </tr>
                            ) : (
                                parsers.map((parser) => (
                                    <tr
                                        key={parser.id}
                                        onClick={() => setSelectedParser(parser)}
                                        className="group hover:bg-muted/50 transition-colors duration-150 cursor-pointer"
                                    >
                                        <td className="p-4 text-sm text-[var(--foreground)]/40 font-mono">
                                            #{parser.id}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                                                    <Terminal className="w-4 h-4" />
                                                </div>
                                                <span className="font-medium text-[var(--foreground)] group-hover:text-purple-300 transition-colors">
                                                    {parser.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted/50 text-[var(--foreground)]/60 border border-border">
                                                <FileCode className="w-3 h-3" />
                                                {parser.type_name || t('sms.parsers.unknown')}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-border bg-muted/50 flex justify-between items-center text-xs text-[var(--foreground)]/40">
                    <span>{t('sms.parsers.showing')} {parsers.length} {t('sms.parsers.parsersCount')}</span>
                </div>
            </div>

            {selectedParser && (
                <ParserActionPopup
                    parser={selectedParser}
                    isOpen={true}
                    onClose={() => setSelectedParser(null)}
                />
            )}
        </>
    );
}
