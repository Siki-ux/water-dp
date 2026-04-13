/**
 * Client-safe JWT payload decoder (uses atob, works in browser and Node 18+).
 * Does NOT verify the signature — only use for reading claims from already-
 * validated tokens (e.g. accessToken obtained from a trusted server session).
 */
export function parseJwt(token: string): Record<string, unknown> | null {
    try {
        const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(atob(base64));
    } catch {
        return null;
    }
}

const SUBGROUP_TO_ROLE: Record<string, string> = {
    viewers: "viewer",
    editors: "editor",
    admins: "admin",
};

const ROLE_ORDER = ["viewer", "editor", "admin"];

/**
 * Parse the JWT `groups` claim into a per-parent-group role map.
 * "/UFZ-TSM:ProjectA/editors" → { "UFZ-TSM:ProjectA": "editor" }
 * Legacy flat "/UFZ-TSM:ProjectA" → { "UFZ-TSM:ProjectA": "viewer" } (default)
 */
export function parseGroupRoles(jwtGroups: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const path of jwtGroups) {
        const clean = path.replace(/^\//, "");
        const parts = clean.split("/");
        if (parts.length >= 2 && SUBGROUP_TO_ROLE[parts[parts.length - 1]]) {
            const parent = parts.slice(0, -1).join("/");
            const role = SUBGROUP_TO_ROLE[parts[parts.length - 1]];
            // Keep highest role if the same parent appears multiple times
            if (!result[parent] || ROLE_ORDER.indexOf(role) > ROLE_ORDER.indexOf(result[parent])) {
                result[parent] = role;
            }
        } else {
            // Flat/legacy group member — default to viewer
            result[clean] = result[clean] ?? "viewer";
        }
    }
    return result;
}

/**
 * Returns the highest role across all group memberships.
 * "admin" > "editor" > "viewer" > null
 */
export function getHighestGroupRole(groupRoles: Record<string, string>): string | null {
    const roles = Object.values(groupRoles);
    if (roles.length === 0) return null;
    return roles.reduce((best, r) =>
        ROLE_ORDER.indexOf(r) > ROLE_ORDER.indexOf(best) ? r : best
    );
}

export function isRealmAdmin(decoded: Record<string, unknown> | null): boolean {
    if (!decoded) return false;
    const realmAccess = decoded.realm_access as { roles?: string[] } | undefined;
    return realmAccess?.roles?.includes("admin") ?? false;
}
