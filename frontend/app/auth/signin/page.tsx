"use client";

import { WaterBackground } from "@/components/WaterBackground";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function SignIn() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const result = await signIn("credentials", {
                username,
                password,
                redirect: false,
            });

            if (result?.error) {
                setError("Invalid credentials");
                setLoading(false);
            } else {
                router.push("/projects");
                router.refresh();
            }
        } catch (err) {
            setError("Something went wrong");
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen flex items-center justify-center bg-water-depth overflow-hidden text-white font-[family-name:var(--font-geist-sans)]">
            <WaterBackground />

            <div className="relative z-10 w-full max-w-md p-8 bg-black/30 backdrop-blur-md rounded-2xl border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in duration-500">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
                        Welcome Back
                    </h1>
                    <p className="text-blue-100/60 mt-2 text-sm">Sign in to access your hydrological dashboard</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="p-3 text-sm text-red-200 bg-red-900/30 border border-red-500/30 rounded-lg text-center">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-blue-100/80">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors text-white placeholder-white/20"
                            placeholder="Enter your username"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-blue-100/80">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:border-hydro-primary/50 focus:ring-1 focus:ring-hydro-primary/50 transition-colors text-white placeholder-white/20"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 bg-gradient-to-r from-hydro-primary to-hydro-secondary rounded-lg font-semibold text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:scale-[1.02] transition-all disabled:opacity-70 disabled:hover:scale-100"
                    >
                        {loading ? "Signing in..." : "Sign In"}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-blue-100/60">
                    Don't have an account?{" "}
                    <Link href="/register" className="text-hydro-secondary hover:text-white transition-colors font-medium">
                        Register
                    </Link>
                </div>
            </div>
        </div>
    );
}
