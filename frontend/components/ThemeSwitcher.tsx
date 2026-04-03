"use client";

import { useTheme } from "./ThemeContext";
import { Sun, Moon } from "lucide-react";

export function ThemeSwitcher() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-9 h-9 text-white/80 bg-white/5 rounded-full border border-white/10 hover:bg-white/10 transition-colors"
            aria-label="Toggle Theme"
            title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
        >
            {theme === "light" ? (
                <Sun className="w-4 h-4 text-yellow-400" />
            ) : (
                <Moon className="w-4 h-4 text-blue-400" />
            )}
        </button>
    );
}
