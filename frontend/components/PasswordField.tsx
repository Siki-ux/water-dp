"use client";

import { useState } from "react";
import { Eye, EyeOff, Copy, Check } from "lucide-react";

interface PasswordFieldProps {
    value?: string;
}

export function PasswordField({ value }: PasswordFieldProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    if (!value) return <span className="text-white/40 italic">Not available</span>;

    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    return (
        <div className="flex items-center gap-2">
            <code className="bg-white/5 px-2 py-1 rounded font-mono text-white text-sm break-all">
                {isVisible ? value : "••••••••••••••••"}
            </code>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => setIsVisible(!isVisible)}
                    className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/60 hover:text-white"
                    title={isVisible ? "Hide" : "Show"}
                >
                    {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                    onClick={handleCopy}
                    className="p-1.5 hover:bg-white/10 rounded-md transition-colors text-white/60 hover:text-white"
                    title="Copy"
                >
                    {isCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}
