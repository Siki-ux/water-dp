"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
    parseJwt,
    parseGroupRoles,
    getHighestGroupRole,
    isRealmAdmin,
} from "@/lib/jwt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroupMembership {
    groupPath: string;
    role: string;
}

export interface GlobalPermissions {
    isRealmAdmin: boolean;
    groupMemberships: GroupMembership[];
    groupRoles: Record<string, string>;
    highestGroupRole: string | null;
    canAccessSMS: boolean;
    canAccessLayers: boolean;
}

export interface ProjectPermissions {
    project_id: string;
    effective_role: string;
    group_role: string | null;
    is_realm_admin: boolean;
    can_view: boolean;
    can_edit_settings: boolean;
    can_edit_alerts: boolean;
    can_link_sensors: boolean;
    can_add_data_sources: boolean;
    can_view_simulator: boolean;
    can_manage_members: boolean;
    can_delete: boolean;
    global_sms_access: boolean;
    global_layers_access: boolean;
}

// ---------------------------------------------------------------------------
// Global permissions (decoded from JWT — zero network calls)
// ---------------------------------------------------------------------------

export function useGlobalPermissions(): GlobalPermissions {
    const { data: session } = useSession();
    const accessToken = (session as any)?.accessToken as string | undefined;

    return useMemo((): GlobalPermissions => {
        if (!accessToken) {
            return {
                isRealmAdmin: false,
                groupMemberships: [],
                groupRoles: {},
                highestGroupRole: null,
                canAccessSMS: false,
                canAccessLayers: false,
            };
        }

        const decoded = parseJwt(accessToken);
        const jwtGroups: string[] = (decoded?.groups as string[]) ?? [];
        const groupRoles = parseGroupRoles(jwtGroups);
        const highest = getHighestGroupRole(groupRoles);
        const realmAdmin = isRealmAdmin(decoded);
        const canAccessFeatures = realmAdmin || highest === "editor" || highest === "admin";

        return {
            isRealmAdmin: realmAdmin,
            groupRoles,
            groupMemberships: Object.entries(groupRoles).map(([groupPath, role]) => ({
                groupPath,
                role,
            })),
            highestGroupRole: highest,
            canAccessSMS: canAccessFeatures,
            canAccessLayers: canAccessFeatures,
        };
    }, [accessToken]);
}

// ---------------------------------------------------------------------------
// Project-level permissions (API call, cached 5 min via react-query)
// ---------------------------------------------------------------------------

export function useProjectPermissions(projectId: string | undefined) {
    return useQuery<ProjectPermissions>({
        queryKey: ["project-permissions", projectId],
        queryFn: () =>
            api
                .get(`/projects/${projectId}/permissions`)
                .then((r) => r.data),
        enabled: !!projectId,
        staleTime: 5 * 60 * 1000,
    });
}
