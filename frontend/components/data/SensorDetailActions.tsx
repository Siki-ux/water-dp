"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Trash2, Loader2, Upload } from "lucide-react";
import { SensorEditDialog } from "@/components/SensorEditDialog";
import MqttPublishDialog from "./MqttPublishDialog";
import FileUploadDialog from "./FileUploadDialog";
import { getApiUrl } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface SensorDetailActionsProps {
    sensor: any;
    token: string;
}

export default function SensorDetailActions({ sensor, token }: SensorDetailActionsProps) {
    const { t } = useTranslation();
    const [isMqttDialogOpen, setIsMqttDialogOpen] = useState(false);
    const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const router = useRouter();

    const handleDelete = async () => {
        if (!confirm(t("sms.sensors.deleteConfirm"))) {
            return;
        }

        setIsDeleting(true);
        try {
            const apiUrl = getApiUrl();
            const res = await fetch(`${apiUrl}/sms/sensors/${sensor.uuid}?delete_from_source=true`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                router.push("/sms/sensors");
                router.refresh();
            } else {
                const error = await res.json();
                alert(`${t("sms.sensors.deleteFail")}: ${error.detail || t("sms.sensors.unknown")}`);
            }
        } catch (error) {
            console.error("Delete error:", error);
            alert(t("sms.sensors.deleteError"));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex gap-2">
            <button
                onClick={() => setIsUploadDialogOpen(true)}
                className="flex items-center gap-1 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg text-amber-400 text-sm font-medium transition-colors"
            >
                <Upload className="w-4 h-4" />
                {t("sms.sensors.uploadFile")}
            </button>

            <button
                onClick={() => setIsMqttDialogOpen(true)}
                className="flex items-center gap-1 px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-purple-400 text-sm font-medium transition-colors"
            >
                <Activity className="w-4 h-4" />
                {t("sms.sensors.testMqtt")}
            </button>

            <SensorEditDialog sensor={sensor} />

            <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg text-red-400 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Trash2 className="w-4 h-4" />
                )}
                {isDeleting ? t("sms.sensors.deleting") : t("sms.sensors.deleteBtn")}
            </button>

            <MqttPublishDialog
                isOpen={isMqttDialogOpen}
                onClose={() => setIsMqttDialogOpen(false)}
                sensorUuid={sensor.uuid}
                sensorName={sensor.name}
                token={token}
            />

            <FileUploadDialog
                isOpen={isUploadDialogOpen}
                onClose={() => setIsUploadDialogOpen(false)}
                sensorUuid={sensor.uuid}
                sensorName={sensor.name}
                token={token}
            />
        </div>
    );
}

