import { DefaultSession } from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth" {
    interface Session {
        accessToken?: string
        refreshToken?: string
        expiresAt?: number
        error?: string
        user: {
            id: string
        } & DefaultSession["user"]
    }

    interface User {
        accessToken?: string
        refreshToken?: string
        expiresIn?: number
        expiresAt?: number
    }
}
