export interface SensorDataPoint {
    parameter?: string; // Legacy
    datastream?: string; // New
    value: number | string | null;
    unit: string;
    timestamp: string;
}

export interface DatastreamMetadata {
    name: string;
    unit: string;
    label: string;
    properties?: any;
}

export interface Sensor {
    uuid: string;
    id: string; // Legacy Int ID or FROST ID
    name: string;
    description?: string;
    latitude: number;
    longitude: number;
    status: string;
    last_activity?: string;
    updated_at?: string;
    latest_data?: SensorDataPoint[];
    station_type?: string;
    datastreams?: DatastreamMetadata[];
    properties?: any;
    ingest_type?: string;
    device_type?: string;
    mqtt_username?: string;
    mqtt_password?: string;
    mqtt_topic?: string;
    parser?: string;
    s3_bucket?: string;
    s3_user?: string;
    s3_password?: string;
    filename_pattern?: string;
    project_name?: string;
    schema_name?: string;
    external_api?: {
        type_name?: string;
        sync_interval?: number;
        sync_enabled?: boolean;
        settings?: Record<string, any>;
    };
    external_sftp?: {
        uri?: string;
        path?: string;
        username?: string;
        sync_interval?: number;
        sync_enabled?: boolean;
    };
}

export interface ExternalApiType {
    id: number;
    name: string;
    properties?: Record<string, any>;
    code?: string;
    code_error?: string;
}
