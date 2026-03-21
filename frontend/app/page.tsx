import { WaterBackground } from "@/components/WaterBackground";
import Link from "next/link";

export default function Home() {
    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-water-depth text-[var(--foreground)]">
            {/* Background Effects */}
            <WaterBackground />

            <main className="relative z-10 flex flex-col items-center text-center px-4 md:px-0 max-w-4xl mx-auto space-y-8">
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-5 duration-1000">
                    <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-[var(--foreground)]">
                        Hydro Portal
                    </h1>
                    <p className="text-xl md:text-2xl text-[var(--foreground)]/60 font-light max-w-2xl mx-auto">
                        Dive deep into hydrological data. Visualize, analyze, and compute with precision.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mt-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                    <Link
                        href="/auth/signin"
                        className="group relative px-8 py-3 rounded-full bg-[var(--foreground)] text-[var(--background)] font-semibold text-lg transition-transform hover:scale-105 shadow-xl hover:shadow-[0_0_20px_rgba(var(--foreground),0.3)]"
                    >
                        <span className="relative z-10">Get Started</span>
                    </Link>
                </div>
            </main>

            <footer className="absolute bottom-8 text-[var(--foreground)]/30 text-sm">
                &copy; {new Date().getFullYear()} Hydro Portal. All flows reserved.
            </footer>
        </div>
    );
}
