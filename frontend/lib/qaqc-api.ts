/**
 * QA/QC API client for water_dp-api.
 *
 * Three groups of endpoints:
 *   sms*   → /api/v1/sms/qaqc/{schema_name}/...   (primary — SMS manages QC by TSM schema)
 *   thing* → /api/v1/sms/things/{uuid}/qaqc/...    (per-sensor override)
 *   proj*  → /api/v1/projects/{id}/qaqc/...        (kept for compat, water_dp project context)
 *
 * All calls go through the shared axios instance (lib/api.ts) which
 * automatically attaches the Bearer token — no manual token passing needed.
 */

import api from "./api";

// --- Types ---

export interface QcStream {
    arg_name: string;
    sta_thing_id: number | null;
    sta_stream_id: number | null;
    alias: string;
}

export interface QAQCTest {
    id: number;
    qaqc_id: number;
    function: string;
    name: string | null;
    position: number | null;
    args: Record<string, unknown> | null;
    streams: QcStream[] | null;
}

export interface QAQCConfig {
    id: number;
    name: string;
    context_window: string;
    is_default: boolean;
    tsm_project_id: number | null;
    tests: QAQCTest[];
}

export interface QAQCSchemaInfo {
    id: number;
    uuid: string;
    name: string;
    schema_name: string;
    config_count: number;
}

export interface QAQCTriggerRequest {
    qaqc_name: string;
    start_date: string; // ISO 8601
    end_date: string;   // ISO 8601
}

export interface CustomQAQCFunction {
    name: string;
    filename: string;
    size: number;
    uploaded_at: string | null;
}

// =============================================================================
// SMS-scoped — primary interface (by TSM schema_name)
// =============================================================================

/** List all TSM projects/schemas with QA/QC config counts. */
export async function listQAQCSchemas(): Promise<QAQCSchemaInfo[]> {
    const { data } = await api.get<QAQCSchemaInfo[]>("/sms/qaqc/schemas");
    return data;
}

/** List all QA/QC configurations for a specific TSM schema. */
export async function smsListQAQCConfigs(schemaName: string): Promise<QAQCConfig[]> {
    const { data } = await api.get<QAQCConfig[]>(`/sms/qaqc/${encodeURIComponent(schemaName)}`);
    return data;
}

export async function smsCreateQAQCConfig(
    schemaName: string,
    body: { name: string; context_window: string; is_default?: boolean },
): Promise<QAQCConfig> {
    const { data } = await api.post<QAQCConfig>(`/sms/qaqc/${encodeURIComponent(schemaName)}`, body);
    return data;
}

export async function smsUpdateQAQCConfig(
    schemaName: string,
    qaqcId: number,
    body: Partial<{ name: string; context_window: string; is_default: boolean }>,
): Promise<QAQCConfig> {
    const { data } = await api.put<QAQCConfig>(`/sms/qaqc/${encodeURIComponent(schemaName)}/${qaqcId}`, body);
    return data;
}

export async function smsDeleteQAQCConfig(schemaName: string, qaqcId: number): Promise<void> {
    await api.delete(`/sms/qaqc/${encodeURIComponent(schemaName)}/${qaqcId}`);
}

export async function smsAddQAQCTest(
    schemaName: string,
    qaqcId: number,
    body: Omit<QAQCTest, "id" | "qaqc_id">,
): Promise<QAQCTest> {
    const { data } = await api.post<QAQCTest>(`/sms/qaqc/${encodeURIComponent(schemaName)}/${qaqcId}/tests`, body);
    return data;
}

export async function smsUpdateQAQCTest(
    schemaName: string,
    qaqcId: number,
    testId: number,
    body: Partial<Omit<QAQCTest, "id" | "qaqc_id">>,
): Promise<QAQCTest> {
    const { data } = await api.put<QAQCTest>(`/sms/qaqc/${encodeURIComponent(schemaName)}/${qaqcId}/tests/${testId}`, body);
    return data;
}

export async function smsDeleteQAQCTest(
    schemaName: string,
    qaqcId: number,
    testId: number,
): Promise<void> {
    await api.delete(`/sms/qaqc/${encodeURIComponent(schemaName)}/${qaqcId}/tests/${testId}`);
}

export async function smsTriggerQAQC(
    schemaName: string,
    body: QAQCTriggerRequest,
): Promise<{ status: string }> {
    const { data } = await api.post<{ status: string }>(`/sms/qaqc/${encodeURIComponent(schemaName)}/trigger`, body);
    return data;
}

// =============================================================================
// Per-sensor (Thing-level override)
// =============================================================================

export async function getThingQAQC(thingUuid: string): Promise<QAQCConfig | null> {
    try {
        const { data } = await api.get<QAQCConfig>(`/sms/things/${thingUuid}/qaqc`);
        return data;
    } catch (err: unknown) {
        if (typeof err === "object" && err !== null && "response" in err) {
            const axiosErr = err as { response?: { status?: number } };
            if (axiosErr.response?.status === 404) return null;
        }
        throw err;
    }
}

export async function createThingQAQC(
    thingUuid: string,
    body: { name: string; context_window: string },
): Promise<QAQCConfig> {
    const { data } = await api.post<QAQCConfig>(`/sms/things/${thingUuid}/qaqc`, body);
    return data;
}

export async function deleteThingQAQC(thingUuid: string): Promise<void> {
    await api.delete(`/sms/things/${thingUuid}/qaqc`);
}

export async function addThingQAQCTest(
    thingUuid: string,
    body: Omit<QAQCTest, "id" | "qaqc_id">,
): Promise<QAQCTest> {
    const { data } = await api.post<QAQCTest>(`/sms/things/${thingUuid}/qaqc/tests`, body);
    return data;
}

export async function deleteThingQAQCTest(
    thingUuid: string,
    testId: number,
): Promise<void> {
    await api.delete(`/sms/things/${thingUuid}/qaqc/tests/${testId}`);
}

export async function triggerThingQAQC(thingUuid: string): Promise<{ status: string }> {
    const { data } = await api.post<{ status: string }>(`/sms/things/${thingUuid}/qaqc/trigger`);
    return data;
}

// =============================================================================
// Custom SaQC functions (MinIO-backed)
// =============================================================================

export async function listCustomQAQCFunctions(): Promise<CustomQAQCFunction[]> {
    const { data } = await api.get<CustomQAQCFunction[]>("/sms/qaqc/functions");
    return data;
}

export async function uploadCustomQAQCFunction(file: File): Promise<CustomQAQCFunction> {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post<CustomQAQCFunction>("/sms/qaqc/functions", form, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
}

export async function deleteCustomQAQCFunction(name: string): Promise<void> {
    await api.delete(`/sms/qaqc/functions/${encodeURIComponent(name)}`);
}

// =============================================================================
// Project-scoped (legacy — water_dp project context)
// =============================================================================

export async function listQAQCConfigs(projectId: string): Promise<QAQCConfig[]> {
    const { data } = await api.get<QAQCConfig[]>(`/projects/${projectId}/qaqc`);
    return data;
}

export async function createQAQCConfig(
    projectId: string,
    body: { name: string; context_window: string; is_default?: boolean },
): Promise<QAQCConfig> {
    const { data } = await api.post<QAQCConfig>(`/projects/${projectId}/qaqc`, body);
    return data;
}

export async function updateQAQCConfig(
    projectId: string,
    qaqcId: number,
    body: Partial<{ name: string; context_window: string; is_default: boolean }>,
): Promise<QAQCConfig> {
    const { data } = await api.put<QAQCConfig>(`/projects/${projectId}/qaqc/${qaqcId}`, body);
    return data;
}

export async function deleteQAQCConfig(projectId: string, qaqcId: number): Promise<void> {
    await api.delete(`/projects/${projectId}/qaqc/${qaqcId}`);
}

export async function addQAQCTest(
    projectId: string,
    qaqcId: number,
    body: Omit<QAQCTest, "id" | "qaqc_id">,
): Promise<QAQCTest> {
    const { data } = await api.post<QAQCTest>(`/projects/${projectId}/qaqc/${qaqcId}/tests`, body);
    return data;
}

export async function updateQAQCTest(
    projectId: string,
    qaqcId: number,
    testId: number,
    body: Partial<Omit<QAQCTest, "id" | "qaqc_id">>,
): Promise<QAQCTest> {
    const { data } = await api.put<QAQCTest>(`/projects/${projectId}/qaqc/${qaqcId}/tests/${testId}`, body);
    return data;
}

export async function deleteQAQCTest(
    projectId: string,
    qaqcId: number,
    testId: number,
): Promise<void> {
    await api.delete(`/projects/${projectId}/qaqc/${qaqcId}/tests/${testId}`);
}

export async function triggerQAQC(
    projectId: string,
    body: QAQCTriggerRequest,
): Promise<{ status: string }> {
    const { data } = await api.post<{ status: string }>(`/projects/${projectId}/qaqc/trigger`, body);
    return data;
}
