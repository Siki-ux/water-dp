"use client";

import { useTranslation, SupportedLanguage } from "@/lib/i18n";
import { Globe } from "lucide-react";

export function LanguageSwitcher() {
    const { language, setLanguage } = useTranslation();

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setLanguage(e.target.value as SupportedLanguage);
    };

    return (
        <div className="flex items-center gap-1 text-sm text-[var(--foreground)]/80 bg-[var(--muted)] px-2 py-1.5 rounded-full border border-[var(--border)] hover:brightness-95 transition-colors">
            <Globe className="w-4 h-4 text-[var(--foreground)]/60" />
            <select
                value={language}
                onChange={handleChange}
                className="bg-transparent outline-none cursor-pointer appearance-none px-1 text-center font-medium text-[var(--foreground)]"
                aria-label="Select Language"
            >
                <option value="en">EN</option>
                <option value="cs">CS</option>
                <option value="sk">SK</option>
            </select>
        </div>
    );
}
