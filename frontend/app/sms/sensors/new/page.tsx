
import { SensorForm } from "@/components/SensorForm";

export default function NewSensorPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <div>
                <h1 className="text-3xl font-bold text-white">Add New Sensor</h1>
                <p className="text-white/60 mt-1">
                    Register a new sensor device in the system.
                </p>
            </div>

            <SensorForm />
        </div>
    );
}
