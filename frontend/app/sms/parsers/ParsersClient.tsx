"use client";

import { useTranslation } from "@/lib/i18n";
import { ParserCreateDialog } from "@/components/ParserCreateDialog";
import { ParserTable } from "@/components/ParserTable";

interface ParsersClientProps {
    parsers: any[];
}

export function ParsersClient({ parsers }: ParsersClientProps) {
    const { t } = useTranslation();

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">{t('sms.parsers.title')}</h1>
                    <p className="text-[var(--foreground)]/60 text-sm mt-1">{t('sms.parsers.manageDesc')}</p>
                </div>
                <ParserCreateDialog />
            </div>

            <ParserTable parsers={parsers} />
        </div>
    );
}
