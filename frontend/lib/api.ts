import axios from "axios";
import { getApiUrl } from "./utils";

// Create Axios instance
const api = axios.create({
    baseURL: getApiUrl(),
    headers: {
        "Content-Type": "application/json",
    },
});

// In-memory token cache to avoid calling getSession() on every request
let cachedToken: string | null = null;
let cachedExpiresAt: number | null = null; // Unix timestamp in seconds

/**
 * Get a valid access token, using the cache when possible.
 * Only refreshes from the session when the cached token is missing
 * or within 60 seconds of expiring.
 */
async function getAccessToken(): Promise<string | null> {
    const now = Math.floor(Date.now() / 1000);

    // Return cached token if it exists and is not about to expire (60s buffer)
    if (cachedToken && cachedExpiresAt && now < cachedExpiresAt - 60) {
        return cachedToken;
    }

    // Fetch a fresh session
    const { getSession } = await import("next-auth/react");
    const session = await getSession();

    if (session?.accessToken) {
        cachedToken = session.accessToken;
        cachedExpiresAt = session.expiresAt ?? null;
        return cachedToken;
    }

    // No valid session — clear cache
    cachedToken = null;
    cachedExpiresAt = null;
    return null;
}

/** Clear the cached token (call on sign-out or 401 responses). */
export function clearTokenCache() {
    cachedToken = null;
    cachedExpiresAt = null;
}

// Add a request interceptor to attach the token if available (client-side only)
api.interceptors.request.use(
    async (config) => {
        if (typeof window !== "undefined") {
            const token = await getAccessToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Clear the token cache on 401 responses so the next request fetches a fresh session
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
            clearTokenCache();
        }
        return Promise.reject(error);
    }
);

export default api;
