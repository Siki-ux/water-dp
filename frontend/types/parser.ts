export interface TimestampColumn {
    column: number;
    format: string;
}

export interface CsvParserSettings {
    delimiter: string;
    exclude_headlines: number;
    exclude_footlines: number;
    timestamp_columns: TimestampColumn[];
    pandas_read_csv?: any;
}

export interface Parser {
    id: number;
    name: string;
    group_id: string;
    type: string;
    settings: CsvParserSettings;
}

export interface ParserCreate {
    name: string;
    project_uuid: string; // Updated to match backend requirement
    type: string;
    settings: CsvParserSettings;
}
