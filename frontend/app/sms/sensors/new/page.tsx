import { SensorForm } from "@/components/SensorForm";
import { T } from "@/components/T";

export default function NewSensorPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div>
                <h1 className="text-3xl font-bold text-[var(--foreground)]"><T path="sms.sensors.addTitle" /></h1>
                <p className="text-[var(--foreground)]/60 mt-1">
                    <T path="sms.sensors.addDesc" />
                </p>
            </div>

            <SensorForm />
        </div>
    );
}
