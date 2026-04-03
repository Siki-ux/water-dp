"use client";

import { useTranslation } from "@/lib/i18n";

interface TProps {
    path: any;
}

export function T({ path }: TProps) {
    const { t } = useTranslation();
    return <>{t(path)}</>;
}
