
import { Construction } from "lucide-react";

export default function QaQcPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center animate-in fade-in duration-700">
            <div className="p-4 rounded-full bg-white/5 border border-white/10">
                <Construction className="w-12 h-12 text-blue-400" />
            </div>
            <div className="space-y-2">
                <h1 className="text-3xl font-bold text-white tracking-tight">QA/QC Management</h1>
                <p className="text-white/60 max-w-md mx-auto">
                    This module is currently under development. Detailed Quality Assurance and Quality Control tools will be available here soon.
                </p>
            </div>
        </div>
    );
}
