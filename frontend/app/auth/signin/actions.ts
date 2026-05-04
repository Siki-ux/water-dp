"use server"

import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"

export async function credentialsSignIn(
    username: string,
    password: string
): Promise<{ error: string } | undefined> {
    try {
        await signIn("credentials", {
            username,
            password,
            redirectTo: "/portal/projects",
        })
    } catch (error) {
        if (error instanceof AuthError) {
            return { error: "Invalid credentials." }
        }
        // Re-throw NEXT_REDIRECT so Next.js handles navigation
        throw error
    }
}
