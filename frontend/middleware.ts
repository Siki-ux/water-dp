import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

const basePath = "/portal"

export default auth((req) => {
    const rawPathname = req.nextUrl.pathname
    // Strip basePath so route checks work regardless of whether Next.js
    // includes it in req.nextUrl.pathname (behavior varies by deployment).
    const pathname = rawPathname.startsWith(basePath)
        ? rawPathname.slice(basePath.length) || "/"
        : rawPathname

    // Allow public routes
    const publicPaths = ["/", "/auth/signin", "/auth/signup"]
    if (publicPaths.includes(pathname) || pathname.startsWith("/api/auth")) {
        return NextResponse.next()
    }

    // Redirect unauthenticated users to sign in
    if (!req.auth) {
        // Build redirect URL from forwarded headers (proxy sets X-Forwarded-* and Host).
        // req.nextUrl uses the internal container origin (0.0.0.0:3000) which is wrong
        // when behind a reverse proxy.
        const proto = req.headers.get("x-forwarded-proto") || "http"
        const host = req.headers.get("host") || "localhost"
        // callbackUrl keeps the full rawPathname so Auth.js redirects to the correct external path
        const signInUrl = `${proto}://${host}${basePath}/auth/signin?callbackUrl=${encodeURIComponent(rawPathname)}`
        return NextResponse.redirect(signInUrl)
    }

    return NextResponse.next()
})

export const config = {
    matcher: [
        /*
         * Match all paths except:
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon.ico, sitemap.xml, robots.txt (metadata files)
         * - public assets
         */
        "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    ],
}
