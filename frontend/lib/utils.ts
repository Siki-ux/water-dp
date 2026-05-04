import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function getApiUrl(): string {
    const isServer = typeof window === 'undefined';
    const publicUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

    if (isServer && process.env.INTERNAL_API_URL) {
        return process.env.INTERNAL_API_URL;
    }

    // new URL() requires an absolute URL — prepend origin when path is relative
    if (!isServer && publicUrl.startsWith('/')) {
        return window.location.origin + publicUrl;
    }

    return publicUrl;
}
