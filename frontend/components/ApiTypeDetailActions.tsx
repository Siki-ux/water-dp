"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Edit, Trash2, Loader2 } from "lucide-react";
import { ApiTypeCreateDialog } from "@/components/ApiTypeCreateDialog";
import { getApiUrl } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface ApiTypeDetailActionsProps {
    apiType: {
        id: string;
        name: string;
        properties?: any;
        code?: string;
    };
}

export function ApiTypeDetailActions({ apiType }: ApiTypeDetailActionsProps) {
    const { data: session } = useSession();
    const router = useRouter();
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const { t } = useTranslation();

    // Check if dynamic (has script_bucket)
    const isDynamic = apiType.properties && apiType.properties.script_bucket;

    if (!isDynamic) {
        return (
            <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/40 font-medium">
                    {t('sms.apiTypes.builtInType')}
                </span>
            </div>
        );
    }

    const handleDelete = async () => {
        if (!confirm(t('sms.apiTypes.deleteConfirm'))) {
            return;
        }

        setDeleting(true);
        try {
            const apiUrl = getApiUrl();
            const res = await fetch(`${apiUrl}/external-sources/api-types/${apiType.name}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${session?.accessToken}`,
                },
            });

            if (!res.ok) {
                const err = await res.json();
                alert(err.detail || t('sms.apiTypes.deleteFail'));
                setDeleting(false);
                return;
            }

            router.push("/sms/api-types");
            router.refresh();
        } catch (error) {
            console.error(error);
            alert(t('sms.apiTypes.deleteFail'));
            setDeleting(false);
        }
    };

    return (
        <>
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setIsEditOpen(true)}
                    className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg font-medium transition-colors border border-white/10"
                >
                    <Edit className="w-4 h-4 text-blue-400" />
                    {t('sms.apiTypes.edit')}
                </button>
                <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-lg font-medium transition-colors border border-red-500/20 disabled:opacity-50"
                >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    {t('sms.apiTypes.delete')}
                </button>
            </div>

            <ApiTypeCreateDialog
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                editMode={true}
                initialData={{
                    id: apiType.id,
                    name: apiType.name,
                    code: apiType.code
                }}
            />
        </>
    );
}
