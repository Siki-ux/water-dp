/**
 * QA/QC API client for water_dp-api.
 *
 * Three groups of endpoints:
 *   sms*   → /api/v1/sms/qaqc/{schema_name}/...   (primary — SMS manages QC by TSM schema)
 *   thing* → /api/v1/sms/things/{uuid}/qaqc/...    (per-sensor override)
 *   proj*  → /api/v1/projects/{id}/qaqc/...        (kept for compat, water_dp project context)
 */

const getBase = () =>
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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

// --- Helpers ---

function authHeaders(token: string) {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || `HTTP ${res.status}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
}

// =============================================================================
// SMS-scoped — primary interface (by TSM schema_name)
// =============================================================================

/** List all TSM projects/schemas with QA/QC config counts. */
export async function listQAQCSchemas(token: string): Promise<QAQCSchemaInfo[]> {
    const res = await fetch(`${getBase()}/sms/qaqc/schemas`, {
        headers: authHeaders(token),
        cache: "no-store",
    });
    return handleResponse<QAQCSchemaInfo[]>(res);
}

/** List all QA/QC configurations for a specific TSM schema. */
export async function smsListQAQCConfigs(schemaName: string, token: string): Promise<QAQCConfig[]> {
    const res = await fetch(`${getBase()}/sms/qaqc/${encodeURIComponent(schemaName)}`, {
        headers: authHeaders(token),
        cache: "no-store",
    });
    return handleResponse<QAQCConfig[]>(res);
}

export async function smsCreateQAQCConfig(
    schemaName: string,
    body: { name: string; context_window: string; is_default?: boolean },
    token: string
): Promise<QAQCConfig> {
    const res = await fetch(`${getBase()}/sms/qaqc/${encodeURIComponent(schemaName)}`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<QAQCConfig>(res);
}

export async function smsUpdateQAQCConfig(
    schemaName: string,
    qaqcId: number,
    body: Partial<{ name: string; context_window: string; is_default: boolean }>,
    token: string
): Promise<QAQCConfig> {
    const res = await fetch(`${getBase()}/sms/qaqc/${encodeURIComponent(schemaName)}/${qaqcId}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<QAQCConfig>(res);
}

export async function smsDeleteQAQCConfig(schemaName: string, qaqcId: number, token: string): Promise<void> {
    const res = await fetch(`${getBase()}/sms/qaqc/${encodeURIComponent(schemaName)}/${qaqcId}`, {
        method: "DELETE",
        headers: authHeaders(token),
    });
    return handleResponse<void>(res);
}

export async function smsAddQAQCTest(
    schemaName: string,
    qaqcId: number,
    body: Omit<QAQCTest, "id" | "qaqc_id">,
    token: string
): Promise<QAQCTest> {
    const res = await fetch(`${getBase()}/sms/qaqc/${encodeURIComponent(schemaName)}/${qaqcId}/tests`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<QAQCTest>(res);
}

export async function smsUpdateQAQCTest(
    schemaName: string,
    qaqcId: number,
    testId: number,
    body: Partial<Omit<QAQCTest, "id" | "qaqc_id">>,
    token: string
): Promise<QAQCTest> {
    const res = await fetch(`${getBase()}/sms/qaqc/${encodeURIComponent(schemaName)}/${qaqcId}/tests/${testId}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<QAQCTest>(res);
}

export async function smsDeleteQAQCTest(
    schemaName: string,
    qaqcId: number,
    testId: number,
    token: string
): Promise<void> {
    const res = await fetch(`${getBase()}/sms/qaqc/${encodeURIComponent(schemaName)}/${qaqcId}/tests/${testId}`, {
        method: "DELETE",
        headers: authHeaders(token),
    });
    return handleResponse<void>(res);
}

export async function smsTriggerQAQC(
    schemaName: string,
    body: QAQCTriggerRequest,
    token: string
): Promise<{ status: string }> {
    const res = await fetch(`${getBase()}/sms/qaqc/${encodeURIComponent(schemaName)}/trigger`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<{ status: string }>(res);
}

// =============================================================================
// Per-sensor (Thing-level override)
// =============================================================================

export async function getThingQAQC(thingUuid: string, token: string): Promise<QAQCConfig | null> {
    const res = await fetch(`${getBase()}/sms/things/${thingUuid}/qaqc`, {
        headers: authHeaders(token),
        cache: "no-store",
    });
    if (res.status === 404) return null;
    return handleResponse<QAQCConfig>(res);
}

export async function createThingQAQC(
    thingUuid: string,
    body: { name: string; context_window: string },
    token: string
): Promise<QAQCConfig> {
    const res = await fetch(`${getBase()}/sms/things/${thingUuid}/qaqc`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<QAQCConfig>(res);
}

export async function deleteThingQAQC(thingUuid: string, token: string): Promise<void> {
    const res = await fetch(`${getBase()}/sms/things/${thingUuid}/qaqc`, {
        method: "DELETE",
        headers: authHeaders(token),
    });
    return handleResponse<void>(res);
}

export async function addThingQAQCTest(
    thingUuid: string,
    body: Omit<QAQCTest, "id" | "qaqc_id">,
    token: string
): Promise<QAQCTest> {
    const res = await fetch(`${getBase()}/sms/things/${thingUuid}/qaqc/tests`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<QAQCTest>(res);
}

export async function deleteThingQAQCTest(
    thingUuid: string,
    testId: number,
    token: string
): Promise<void> {
    const res = await fetch(`${getBase()}/sms/things/${thingUuid}/qaqc/tests/${testId}`, {
        method: "DELETE",
        headers: authHeaders(token),
    });
    return handleResponse<void>(res);
}

export async function triggerThingQAQC(thingUuid: string, token: string): Promise<{ status: string }> {
    const res = await fetch(`${getBase()}/sms/things/${thingUuid}/qaqc/trigger`, {
        method: "POST",
        headers: authHeaders(token),
    });
    return handleResponse<{ status: string }>(res);
}

// =============================================================================
// Custom SaQC functions (MinIO-backed)
// =============================================================================

export interface CustomQAQCFunction {
    name: string;
    filename: string;
    size: number;
    uploaded_at: string | null;
}

export async function listCustomQAQCFunctions(token: string): Promise<CustomQAQCFunction[]> {
    const res = await fetch(`${getBase()}/sms/qaqc/functions`, {
        headers: authHeaders(token),
        cache: "no-store",
    });
    return handleResponse<CustomQAQCFunction[]>(res);
}

export async function uploadCustomQAQCFunction(file: File, token: string): Promise<CustomQAQCFunction> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${getBase()}/sms/qaqc/functions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    return handleResponse<CustomQAQCFunction>(res);
}

export async function deleteCustomQAQCFunction(name: string, token: string): Promise<void> {
    const res = await fetch(`${getBase()}/sms/qaqc/functions/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: authHeaders(token),
    });
    return handleResponse<void>(res);
}

// =============================================================================
// Project-scoped (legacy — water_dp project context)
// =============================================================================

export async function listQAQCConfigs(projectId: string, token: string): Promise<QAQCConfig[]> {
    const res = await fetch(`${getBase()}/projects/${projectId}/qaqc`, {
        headers: authHeaders(token),
        cache: "no-store",
    });
    return handleResponse<QAQCConfig[]>(res);
}

export async function createQAQCConfig(
    projectId: string,
    body: { name: string; context_window: string; is_default?: boolean },
    token: string
): Promise<QAQCConfig> {
    const res = await fetch(`${getBase()}/projects/${projectId}/qaqc`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<QAQCConfig>(res);
}

export async function updateQAQCConfig(
    projectId: string,
    qaqcId: number,
    body: Partial<{ name: string; context_window: string; is_default: boolean }>,
    token: string
): Promise<QAQCConfig> {
    const res = await fetch(`${getBase()}/projects/${projectId}/qaqc/${qaqcId}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<QAQCConfig>(res);
}

export async function deleteQAQCConfig(projectId: string, qaqcId: number, token: string): Promise<void> {
    const res = await fetch(`${getBase()}/projects/${projectId}/qaqc/${qaqcId}`, {
        method: "DELETE",
        headers: authHeaders(token),
    });
    return handleResponse<void>(res);
}

export async function addQAQCTest(
    projectId: string,
    qaqcId: number,
    body: Omit<QAQCTest, "id" | "qaqc_id">,
    token: string
): Promise<QAQCTest> {
    const res = await fetch(`${getBase()}/projects/${projectId}/qaqc/${qaqcId}/tests`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<QAQCTest>(res);
}

export async function updateQAQCTest(
    projectId: string,
    qaqcId: number,
    testId: number,
    body: Partial<Omit<QAQCTest, "id" | "qaqc_id">>,
    token: string
): Promise<QAQCTest> {
    const res = await fetch(`${getBase()}/projects/${projectId}/qaqc/${qaqcId}/tests/${testId}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<QAQCTest>(res);
}

export async function deleteQAQCTest(
    projectId: string,
    qaqcId: number,
    testId: number,
    token: string
): Promise<void> {
    const res = await fetch(`${getBase()}/projects/${projectId}/qaqc/${qaqcId}/tests/${testId}`, {
        method: "DELETE",
        headers: authHeaders(token),
    });
    return handleResponse<void>(res);
}

export async function triggerQAQC(
    projectId: string,
    body: QAQCTriggerRequest,
    token: string
): Promise<{ status: string }> {
    const res = await fetch(`${getBase()}/projects/${projectId}/qaqc/trigger`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(body),
    });
    return handleResponse<{ status: string }>(res);
}
