import NextAuth, { User } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import axios from "axios"
import { JWT } from "next-auth/jwt"

// Helper to decode JWT payload safely
export function parseJwt(token: string) {
    try {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    } catch (e) {
        return null;
    }
}

import { getApiUrl } from "./utils"

// Helper to refresh access token
async function refreshAccessToken(token: JWT): Promise<JWT> {
    try {
        const apiUrl = getApiUrl()

        // POST /auth/refresh
        const response = await axios.post(`${apiUrl}/auth/refresh`, {
            refresh_token: token.refreshToken
        })

        if (!response.data || !response.data.access_token) {
            throw new Error("Refresh failed");
        }

        const refreshedTokens = response.data

        return {
            ...token,
            accessToken: refreshedTokens.access_token,
            expiresAt: Math.floor(Date.now() / 1000) + refreshedTokens.expires_in,
            // Fall back to old refresh token if new one is not provided (some implementations rotate, some don't)
            refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
        }

    } catch (error) {
        console.error("Error refreshing access token", error)

        return {
            ...token,
            error: "RefreshAccessTokenError",
        }
    }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Credentials({
            credentials: {
                username: { label: "Username", type: "text" },
                password: { label: "Password", type: "password" },
            },
            authorize: async (credentials) => {
                try {
                    if (!credentials?.username || !credentials?.password) {
                        return null
                    }

                    const apiUrl = getApiUrl()

                    // Using URLSearchParams to send data as application/x-www-form-urlencoded
                    const params = new URLSearchParams();
                    params.append('username', credentials.username as string);
                    params.append('password', credentials.password as string);
                    params.append('grant_type', 'password'); // Required by OAuth2PasswordRequestForm

                    console.log(`Authorize called for user: ${credentials.username}`);
                    const response = await axios.post(`${apiUrl}/auth/token`, params, {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    })

                    if (response.data && response.data.access_token) {
                        const data = response.data;
                        const token = data.access_token;
                        const decoded = parseJwt(token);
                        const userId = decoded?.sub || "1";

                        return {
                            id: userId,
                            name: credentials.username as string,
                            email: "",
                            accessToken: token,
                            refreshToken: data.refresh_token,
                            expiresIn: data.expires_in,
                            expiresAt: Math.floor(Date.now() / 1000) + data.expires_in
                        }
                    }

                    return null
                } catch (error: unknown) {
                    let msg = "Auth error";
                    if (axios.isAxiosError(error)) {
                        msg = error.response?.data || error.message;
                    } else if (error instanceof Error) {
                        msg = error.message;
                    }
                    console.error("Auth error:", msg);
                    return null
                }
            }
        }),
    ],
    pages: {
        signIn: '/auth/signin',
    },
    callbacks: {
        async jwt({ token, user, account }) {
            // Initial sign in
            if (user && account) {
                console.log("Initial sign in, expiresAt:", user.expiresAt);
                return {
                    accessToken: user.accessToken,
                    refreshToken: user.refreshToken,
                    expiresAt: user.expiresAt, // Unix timestamp
                    user: user
                }
            }

            // Return previous token if the access token has not expired yet
            // Subtracting 10 seconds for safety margin
            const now = Date.now();
            const expiry = (token.expiresAt as number) * 1000;
            console.log(`Checking token expiry: Now=${now}, Expiry=${expiry}, Diff=${expiry - now}`);

            if (token.expiresAt && now < (expiry - 10000)) {
                return token
            }

            console.log("Token expired, refreshing...");
            // Access token has expired, try to update it
            return refreshAccessToken(token)
        },
        async session({ session, token }) {
            session.accessToken = token.accessToken as string | undefined
            session.refreshToken = token.refreshToken as string | undefined
            session.expiresAt = token.expiresAt as number | undefined
            session.error = token.error as string | undefined
            // Copy user name from JWT token to session
            const tokenUser = token.user as any;
            if (tokenUser?.name && session.user) {
                session.user.name = tokenUser.name;
            }
            return session
        }
    },
    trustHost: true,
    debug: true,
    basePath: "/api/auth",
})
