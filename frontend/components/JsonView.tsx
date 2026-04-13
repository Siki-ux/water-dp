"use client";

import { useMemo } from "react";

interface JsonViewProps {
    data: any;
    className?: string;
}

export function JsonView({ data, className }: JsonViewProps) {
    const jsonString = useMemo(() => {
        try {
            return JSON.stringify(data, null, 2);
        } catch (e) {
            return String(data);
        }
    }, [data]);

    return (
        <pre className={`font-mono text-xs overflow-x-auto p-4 rounded-lg bg-black/40 text-white/80 ${className}`}>
            {jsonString}
        </pre>
    );
}
