import axios from "axios";
import { getApiUrl } from "./utils";

// Create Axios instance
const api = axios.create({
    baseURL: getApiUrl(),
    headers: {
        "Content-Type": "application/json",
    },
});

// Add a request interceptor to attach the Token if available
// Note: In Next.js Server Components, we might use headers() or cookies() to get the token.
// In Client Components, we use useSession() from next-auth.
// This generic interceptor is a starting point and may need adjustment for SSR vs CSR.
api.interceptors.request.use(
    async (config) => {
        // Integrate with Session management to inject Authorization header
        if (typeof window !== "undefined") {
            const { getSession } = await import("next-auth/react");
            const session = await getSession();
            if (session?.accessToken) {
                config.headers.Authorization = `Bearer ${session.accessToken}`;
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default api;
