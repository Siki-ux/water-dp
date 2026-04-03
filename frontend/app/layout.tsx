import { Providers } from "@/components/Providers";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Hydro Portal",
    description: "Advanced Hydrological Data Platform",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className="antialiased">
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    );
}
