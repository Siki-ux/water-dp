import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
    const { pathname } = req.nextUrl

    // Allow public routes
    const publicPaths = ["/", "/auth/signin", "/auth/signup"]
    if (publicPaths.includes(pathname) || pathname.startsWith("/api/auth")) {
        return NextResponse.next()
    }

    // Redirect unauthenticated users to sign in
    if (!req.auth) {
        const signInUrl = req.nextUrl.clone()
        signInUrl.pathname = "/auth/signin"
        signInUrl.search = ""
        signInUrl.searchParams.set("callbackUrl", pathname)
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
