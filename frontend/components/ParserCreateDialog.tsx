"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Plus, X, Save } from "lucide-react";

export function ParserCreateDialog() {
    const { data: session } = useSession();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        parserType: "csv",
        delimiter: ",",
        headerLine: "0",
        timestampColumn: "0",
        timestampFormat: "%Y-%m-%d %H:%M:%S"
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

            // Only CSV is supported for creation right now
            if (formData.parserType === 'csv') {
                const payload = {
                    name: formData.name,
                    delimiter: formData.delimiter,
                    header_line: parseInt(formData.headerLine),
                    timestamp_column: parseInt(formData.timestampColumn),
                    timestamp_format: formData.timestampFormat
                };

                const res = await fetch(`${apiUrl}/sms/parsers/csv`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${session?.accessToken}`,
                    },
                    body: JSON.stringify(payload),
                });

                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.detail || "Failed to create parser");
                }
            } else {
                throw new Error("Only CSV parser creation is currently supported.");
            }

            setIsOpen(false);
            router.refresh();
            setFormData({
                name: "",
                parserType: "csv",
                delimiter: ",",
                headerLine: "0",
                timestampColumn: "0",
                timestampFormat: "%Y-%m-%d %H:%M:%S"
            });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
                <Plus className="w-4 h-4" />
                Create Parser
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#0A0A0A] border border-white/10 rounded-xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-white/10">
                            <div>
                                <h2 className="text-xl font-bold text-white">Create New Parser</h2>
                                <p className="text-white/60 text-sm mt-1">Configure a new data parser.</p>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-white/40 hover:text-white transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="name" className="block text-sm font-medium text-white/80">
                                        Parser Name
                                    </label>
                                    <input
                                        id="name"
                                        name="name"
                                        placeholder="e.g. Campbell CR6 CSV"
                                        value={formData.name}
                                        onChange={handleChange}
                                        required
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="parserType" className="block text-sm font-medium text-white/80">
                                        Parser Type
                                    </label>
                                    <select
                                        name="parserType"
                                        value={formData.parserType}
                                        onChange={handleChange}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none"
                                    >
                                        <option value="csv" className="bg-[#1A1A1A]">CSV (Delimited)</option>
                                        <option value="json" disabled className="bg-[#1A1A1A]">JSON (Coming Soon)</option>
                                        <option value="custom" disabled className="bg-[#1A1A1A]">Custom Python (See Admin)</option>
                                    </select>
                                </div>

                                {formData.parserType === 'csv' && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label htmlFor="delimiter" className="block text-sm font-medium text-white/80">Delimiter</label>
                                                <input
                                                    id="delimiter"
                                                    name="delimiter"
                                                    value={formData.delimiter}
                                                    onChange={handleChange}
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label htmlFor="headerLine" className="block text-sm font-medium text-white/80">Header Line Index</label>
                                                <input
                                                    id="headerLine"
                                                    name="headerLine"
                                                    type="number"
                                                    value={formData.headerLine}
                                                    onChange={handleChange}
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label htmlFor="timestampColumn" className="block text-sm font-medium text-white/80">Time Column Index</label>
                                                <input
                                                    id="timestampColumn"
                                                    name="timestampColumn"
                                                    type="number"
                                                    value={formData.timestampColumn}
                                                    onChange={handleChange}
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label htmlFor="timestampFormat" className="block text-sm font-medium text-white/80">Time Format</label>
                                                <input
                                                    id="timestampFormat"
                                                    name="timestampFormat"
                                                    placeholder="%Y-%m-%d %H:%M:%S"
                                                    value={formData.timestampFormat}
                                                    onChange={handleChange}
                                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                                />
                                                <p className="text-[10px] text-white/40">Python strftime format</p>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Create Parser
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
