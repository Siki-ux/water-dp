export type WidgetType = 'map' | 'chart' | 'text' | 'script';

export interface WidgetBase {
    id: string;
    type: WidgetType;
    title: string;
}

export interface MapWidgetConfig extends WidgetBase {
    type: 'map';
    config: {
        center?: [number, number];
        zoom?: number;
        layers?: string[];
    };
}

export interface ChartWidgetConfig extends WidgetBase {
    type: 'chart';
    config: {
        sensorId?: string;
        timeRange?: string;
        chartType?: 'line' | 'bar';
    };
}

export interface TextWidgetConfig extends WidgetBase {
    type: 'text';
    config: {
        content: string;
    };
}

export type Widget = MapWidgetConfig | ChartWidgetConfig | TextWidgetConfig | WidgetBase;

export interface DashboardLayoutItem {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
}
