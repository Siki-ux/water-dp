"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { DeviceTypeCreateDialog } from "@/components/DeviceTypeCreateDialog";
import { useTranslation } from "@/lib/i18n";

export function DeviceTypeListActions() {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const { t } = useTranslation();

    return (
        <>
            <button
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-blue-500/20"
            >
                <Plus className="w-4 h-4" />
                {t('sms.deviceTypes.createBtn')}
            </button>

            <DeviceTypeCreateDialog
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
            />
        </>
    );
}
