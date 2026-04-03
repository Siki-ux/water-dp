export interface Dashboard {
    id: string;
    name: string;
    project_id: string;
    layout_config?: any;
    widgets?: any[];
    is_public: boolean;
    created_at: string;
    updated_at: string;
}
