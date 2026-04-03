"use client";

import React, { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Sensor } from '@/types/sensor';
import SensorDetailModal from '@/components/data/SensorDetailModal';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from './ThemeContext';

// Helper to check if a sensor is a dataset (should not show on map)
const isDataset = (s: any) =>
    s.station_type === 'dataset' ||
    s.properties?.station_type === 'dataset' ||
    s.properties?.type === 'static_dataset';

// Fetcher for latest sensor data (Single Station)
const fetchSensorData = async (sensorUuid: string, token: string, datastreams: any[] = []) => {
    if (!datastreams || datastreams.length === 0) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/things/${sensorUuid}/data?limit=1`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch data');
        const data = await res.json();
        return data;
    }

    const promises = datastreams.map(async (ds) => {
        try {
            const dsName = ds.name;
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/things/${sensorUuid}/datastream/${encodeURIComponent(dsName)}/observations?limit=1`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const observations = await res.json();
                if (observations && observations.length > 0) {
                    const obs = observations[0];
                    return {
                        datastream: dsName,
                        value: obs.result,
                        timestamp: obs.phenomenon_time,
                        unit: ds.unit
                    };
                }
            }
            return null;
        } catch (e) {
            console.error(`Error fetching data for ${ds.name}`, e);
            return null;
        }
    });

    const results = await Promise.all(promises);
    return results.filter(r => r !== null);
};

interface ProjectMapProps {
    sensors: Sensor[];
    projectId: string;
    token: string;
    className?: string;
}

interface GeoLayer {
    layer_name: string;
    title: string;
    is_public: boolean;
}

export default function ProjectMap({ sensors: initialSensors, projectId, token, className }: ProjectMapProps) {
    const { theme } = useTheme();
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const [selectedSensor, setSelectedSensor] = useState<Sensor | null>(null);
    const [popupSensorId, setPopupSensorId] = useState<string | null>(null);

    const popupDataRef = useRef<any[]>([]);
    const popupSensorIdRef = useRef<string | null>(null);
    const activePopupRef = useRef<maplibregl.Popup | null>(null);

    useEffect(() => {
        popupSensorIdRef.current = popupSensorId;
    }, [popupSensorId]);

    const [activeLayer, setActiveLayer] = useState<string | null>(null);
    const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);

    const { data: layers = [] } = useQuery({
        queryKey: ['geoLayers', projectId],
        queryFn: async () => {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/geospatial/projects/${projectId}/layers`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                return data.layers as GeoLayer[];
            }
            return [];
        },
        staleTime: 5 * 60 * 1000,
    });

    const { data: layerSensors, isFetching: isLayerLoading } = useQuery({
        queryKey: ['layerSensors', activeLayer],
        queryFn: async () => {
            if (!activeLayer) return null;
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/geospatial/layers/${activeLayer}/sensors?tenant=${projectId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) return await res.json() as Sensor[];
            return [];
        },
        enabled: !!activeLayer,
        staleTime: 60 * 1000,
    });

    const projectSensorMap = useMemo(() => {
        return new Map(initialSensors.filter(s => s.uuid).map(s => [s.uuid, s]));
    }, [initialSensors]);

    const displayedSensors = useMemo(() => {
        if (!activeLayer) return initialSensors.filter(s => !isDataset(s));
        if (!layerSensors) return [];

        return (layerSensors || [])
            .map(s => {
                if (!s.uuid) return null;
                const projectSensor = projectSensorMap.get(s.uuid);
                if (projectSensor) {
                    return {
                        ...s,
                        id: projectSensor.id,
                        uuid: projectSensor.uuid,
                        status: projectSensor.status,
                        latest_data: projectSensor.latest_data,
                        station_type: projectSensor.station_type,
                        datastreams: projectSensor.datastreams,
                    } as Sensor;
                }
                return null;
            })
            .filter((s): s is Sensor => s !== null && !isDataset(s));
    }, [activeLayer, layerSensors, initialSensors, projectSensorMap]);

    const popupSensor = useMemo(() => {
        return displayedSensors.find(s => s.uuid === popupSensorId);
    }, [popupSensorId, displayedSensors]);

    const { data: popupData } = useQuery({
        queryKey: ['sensorLatestData', popupSensorId],
        queryFn: () => {
            const ds = popupSensor?.datastreams || [];
            return fetchSensorData(popupSensorId!, token, ds);
        },
        enabled: !!popupSensorId && !!popupSensor,
        refetchInterval: 30000,
    });

    const getGeoJson = () => {
        return {
            type: 'FeatureCollection',
            features: displayedSensors.map(sensor => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [sensor.longitude, sensor.latitude]
                },
                properties: {
                    id: sensor.id,
                    uuid: sensor.uuid,
                    name: sensor.name,
                    status: sensor.status,
                    latestData: JSON.stringify(sensor.latest_data || []),
                    sensorProperties: JSON.stringify(sensor.properties || {}),
                    datastreams: JSON.stringify(sensor.datastreams || [])
                }
            }))
        };
    };

    const updateSensorSource = () => {
        if (!map.current) return;
        const source = map.current.getSource('sensors') as maplibregl.GeoJSONSource;
        if (source) {
            source.setData(getGeoJson() as any);
        }
    };

    const updatePopupDataDOM = (sensorId: string, data: any[]) => {
        if (!data || data.length === 0) return;
        data.forEach((item: any) => {
            const dsName = item.datastream;
            const valEl = document.getElementById(`popup-val-${sensorId}-${dsName}`);
            const timeEl = document.getElementById(`popup-time-${sensorId}-${dsName}`);

            if (valEl) {
                valEl.innerText = typeof item.value === 'number' ? item.value.toFixed(2) : String(item.value);
                valEl.classList.remove('animate-pulse');
            }
            if (timeEl) {
                timeEl.innerText = new Date(item.timestamp).toLocaleString();
            }
        });
    };

    const addSensorLayer = () => {
        if (!map.current) return;
        if (map.current.getSource('sensors')) return;

        map.current.addSource('sensors', {
            type: 'geojson',
            data: getGeoJson() as any
        });

        map.current.addLayer({
            id: 'sensor-circles',
            type: 'circle',
            source: 'sensors',
            paint: {
                'circle-radius': 8,
                'circle-color': [
                    'match',
                    ['get', 'status'],
                    'active', '#4ade80',
                    'alert', '#facc15',
                    'inactive', '#94a3b8',
                    'unknown', '#64748b',
                    '#3b82f6'
                ],
                'circle-stroke-width': 2,
                'circle-stroke-color': theme === 'dark' ? '#1e293b' : '#ffffff'
            }
        });

        map.current.on('mouseenter', 'sensor-circles', () => map.current!.getCanvas().style.cursor = 'pointer');
        map.current.on('mouseleave', 'sensor-circles', () => map.current!.getCanvas().style.cursor = '');

        map.current.on('click', 'sensor-circles', (e) => {
            if (!e.features || e.features.length === 0) return;
            const feature = e.features[0];
            const coords = (feature.geometry as any).coordinates.slice();
            const props = feature.properties;
            const sensorUuid = String(props?.uuid);

            if (activePopupRef.current) {
                activePopupRef.current.remove();
                activePopupRef.current = null;
            }

            setPopupSensorId(sensorUuid);

            const isAlert = props?.status === 'alert';
            const isActive = props?.status === 'active';
            const statusColor = isActive ? 'bg-emerald-500' : (isAlert ? 'bg-amber-500' : 'bg-slate-500');
            const statusGlow = isActive ? 'shadow-[0_0_8px_rgba(16,185,129,0.5)]' : '';

            const datastreams = props?.datastreams ? JSON.parse(props.datastreams) : [];
            const hasDatastreams = datastreams.length > 0;

            const popupContent = `
                <div class="flex flex-col min-w-[240px] select-none text-[var(--foreground)]">
                    <div class="flex items-start justify-between p-4 pb-3 border-b border-border bg-card/50">
                        <div class="mr-4">
                            <h3 class="font-bold text-sm leading-tight mb-0.5">${props?.name}</h3>
                            <div class="text-[10px] opacity-30 font-mono select-all">${props?.uuid}</div>
                        </div>
                        <div class="flex items-center pt-1">
                            <span class="relative flex h-2.5 w-2.5">
                              ${isActive ? '<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>' : ''}
                              <span class="relative inline-flex rounded-full h-2.5 w-2.5 ${statusColor} ${statusGlow}"></span>
                            </span>
                        </div>
                    </div>
                    
                    <div id="popup-content-${props?.uuid}" class="p-4 pt-2 space-y-3 max-h-[200px] overflow-y-auto custom-scrollbar bg-card">
                         ${hasDatastreams ? datastreams.map((ds: any) => `
                            <div id="popup-row-${props?.uuid}-${ds.name}" class="group">
                                <div class="flex items-baseline justify-between mb-1">
                                    <div class="text-[10px] uppercase tracking-wider font-semibold text-hydro-primary">${ds.label || ds.name}</div>
                                    <div class="text-[10px] opacity-30 font-mono" id="popup-time-${props?.uuid}-${ds.name}">--</div>
                                </div>
                                <div class="flex items-baseline gap-1">
                                    <span id="popup-val-${props?.uuid}-${ds.name}" class="text-xl font-bold tracking-tight text-[var(--foreground)] animate-pulse">--</span>
                                    <span class="text-xs font-medium opacity-50 text-[var(--foreground)]">${ds.unit_of_measurement?.symbol || ds.unit || ''}</span>
                                </div>
                            </div>
                         `).join('<div class="h-px bg-border my-2"></div>') : '<div class="text-sm opacity-50 italic">No datastreams found</div>'}
                    </div>

                    <button id="popup-btn-${props?.uuid}"
                       class="block w-full p-3 text-center text-xs font-semibold text-[var(--foreground)] opacity-70 bg-card hover:opacity-100 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors border-t border-border cursor-pointer no-underline group">
                        View Details <span class="inline-block transition-transform group-hover:translate-x-0.5 ml-1">→</span>
                    </button>
                </div>
            `;

            const popup = new maplibregl.Popup({
                closeButton: false,
                className: 'hydro-map-popup',
                maxWidth: '320px',
                offset: 15
            })
                .setLngLat(coords)
                .setHTML(popupContent)
                .addTo(map.current!);

            activePopupRef.current = popup;

            if (popupDataRef.current && popupDataRef.current.length > 0 && popupSensorIdRef.current === sensorUuid) {
                updatePopupDataDOM(sensorUuid, popupDataRef.current);
            }

            popup.on('close', () => {
                if (activePopupRef.current === popup) {
                    setPopupSensorId(null);
                    activePopupRef.current = null;
                }
            });

            setTimeout(() => {
                const btn = document.getElementById(`popup-btn-${props?.uuid}`);
                if (btn) {
                    btn.addEventListener('click', () => {
                        const sensor = {
                            id: String(props?.id),
                            uuid: String(props?.uuid),
                            name: props?.name,
                            latitude: coords[1],
                            longitude: coords[0],
                            status: props?.status,
                            latest_data: []
                        } as Sensor;
                        setSelectedSensor(sensor);
                        popup.remove();
                    });
                }
            }, 0);
        });
    };

    const fitBounds = (sensorList: Sensor[]) => {
        if (!map.current || sensorList.length === 0) return;
        const bounds = new maplibregl.LngLatBounds();
        sensorList.forEach(s => bounds.extend([s.longitude, s.latitude]));
        map.current.fitBounds(bounds, { padding: 50, maxZoom: 14 });
    };

    const styleUrl = useMemo(() =>
        theme === 'dark'
            ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
            : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
        , [theme]);

    useEffect(() => {
        if (!mapContainer.current) return;

        const defaultCenter: [number, number] = [15.4, 49.8];
        const defaultZoom = 6;
        const validSensors = initialSensors.filter(s => !isDataset(s));
        const initialCenter = validSensors.length > 0
            ? [validSensors[0].longitude, validSensors[0].latitude] as [number, number]
            : defaultCenter;

        if (!map.current) {
            try {
                map.current = new maplibregl.Map({
                    container: mapContainer.current,
                    style: styleUrl,
                    center: initialCenter,
                    zoom: defaultZoom,
                    attributionControl: false,
                });

                map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
                map.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
            } catch (error) {
                console.error("Error initializing map:", error);
                return;
            }
        } else {
            map.current.setStyle(styleUrl);
        }

        const handleStyleLoad = () => {
            console.log("Style loaded, re-adding layers...");
            const style = map.current?.getStyle();
            if (style && style.layers) {
                style.layers.forEach(layer => {
                    if (layer.id.includes('water')) {
                        if (layer.type === 'fill') {
                            map.current?.setPaintProperty(layer.id, 'fill-color', '#0ea5e9');
                            map.current?.setPaintProperty(layer.id, 'fill-opacity', 0.3);
                        } else if (layer.type === 'line') {
                            map.current?.setPaintProperty(layer.id, 'line-color', '#38bdf8');
                            map.current?.setPaintProperty(layer.id, 'line-opacity', 0.6);
                            map.current?.setPaintProperty(layer.id, 'line-width', [
                                'interpolate', ['linear'], ['zoom'],
                                5, 2,
                                12, 1.5,
                                18, 10
                            ]);
                        }
                    }
                });
            }

            addSensorLayer();
            updateSensorSource();
        };

        map.current.on('style.load', handleStyleLoad);

        map.current.once('load', () => {
            const mappableSensors = initialSensors.filter(s => !isDataset(s));
            if (mappableSensors.length > 0 && !activeLayer) fitBounds(mappableSensors);
        });

        return () => {
            if (map.current) {
                map.current.off('style.load', handleStyleLoad);
            }
        };
    }, [styleUrl]);

    useEffect(() => {
        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []);

    useEffect(() => {
        if (!map.current) return;
        updateSensorSource();
    }, [displayedSensors]);

    useEffect(() => {
        popupDataRef.current = popupData || [];
        if (!popupSensorId || !popupData || !map.current) return;
        if (popupData.length > 0) {
            updatePopupDataDOM(popupSensorId, popupData);
        }
    }, [popupData, popupSensorId]);


    const toggleLayer = async (layerName: string) => {
        if (!map.current) return;

        const resetMap = () => {
            setActiveLayer(null);
            setPopupSensorId(null);
            if (map.current?.getLayer('active-layer-fill')) map.current.removeLayer('active-layer-fill');
            if (map.current?.getLayer('active-layer-line')) map.current.removeLayer('active-layer-line');
            if (map.current?.getSource('active-layer-source')) map.current.removeSource('active-layer-source');
            if (map.current?.getLayer('active-wms-layer')) map.current.removeLayer('active-wms-layer');
            if (map.current?.getSource('active-wms-source')) map.current.removeSource('active-wms-source');
            const mappableSensors = initialSensors.filter(s => !isDataset(s));
            if (mappableSensors.length > 0) fitBounds(mappableSensors);
        };

        if (!layerName || activeLayer === layerName) {
            resetMap();
            return;
        }

        setActiveLayer(layerName);

        try {
            const bboxRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/geospatial/layers/${layerName}/bbox`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (bboxRes.ok) {
                const data = await bboxRes.json();
                if (data.bbox && map.current) {
                    const [minLng, minLat, maxLng, maxLat] = data.bbox;
                    map.current.fitBounds(
                        [[minLng, minLat], [maxLng, maxLat]],
                        { padding: 50, duration: 1000 }
                    );
                }
            }
        } catch (e) { console.error(e); }

        if (map.current.getLayer('active-layer-fill')) map.current.removeLayer('active-layer-fill');
        if (map.current.getLayer('active-layer-line')) map.current.removeLayer('active-layer-line');
        if (map.current.getSource('active-layer-source')) map.current.removeSource('active-layer-source');
        if (map.current.getLayer('active-wms-layer')) map.current.removeLayer('active-wms-layer');
        if (map.current.getSource('active-wms-source')) map.current.removeSource('active-wms-source');

        const proxyUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/geospatial/geoserver/layers/${layerName}/geojson`;

        map.current.addSource('active-layer-source', {
            type: 'geojson',
            data: proxyUrl,
            generateId: true
        });

        const beforeId = map.current.getLayer('sensor-circles') ? 'sensor-circles' : undefined;

        map.current.addLayer({
            id: 'active-layer-fill',
            type: 'fill',
            source: 'active-layer-source',
            paint: {
                'fill-color': theme === 'dark' ? '#ffffff' : '#000000',
                'fill-opacity': 0.05
            }
        }, beforeId);

        map.current.addLayer({
            id: 'active-layer-line',
            type: 'line',
            source: 'active-layer-source',
            paint: {
                'line-color': theme === 'dark' ? '#ffffff' : '#475569',
                'line-width': 1.5,
                'line-opacity': 0.8
            }
        }, beforeId);
    };

    return (
        <>
            <div className={`relative rounded-xl overflow-hidden border border-border bg-card ${className}`}>
                {isLayerLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-20 pointer-events-none">
                        <Loader2 className="w-8 h-8 animate-spin text-hydro-primary" />
                    </div>
                )}

                {layers.length > 0 && (
                    <div className="absolute top-4 left-4 z-10">
                        <div className="relative">
                            <button
                                onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
                                className="flex items-center gap-2 px-3 py-2 bg-card/90 hover:bg-accent backdrop-blur-md border border-border rounded-lg shadow-lg text-xs font-semibold text-[var(--foreground)] transition-all"
                            >
                                <svg className="w-4 h-4 text-hydro-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                                {activeLayer ? layers.find(l => l.layer_name === activeLayer)?.title : 'Maps & Layers'}
                                <svg className={`w-3 h-3 opacity-50 transition-transform ${isLayerMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                            </button>

                            {isLayerMenuOpen && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-card/95 backdrop-blur-xl border border-border rounded-lg shadow-xl py-1 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                    <div className="max-h-60 overflow-y-auto">
                                        <button
                                            onClick={() => { toggleLayer(''); setIsLayerMenuOpen(false); }}
                                            className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between hover:bg-accent transition-colors ${!activeLayer ? 'text-hydro-primary bg-hydro-primary/10' : 'text-[var(--foreground)] opacity-70'}`}
                                        >
                                            <span>Default Map</span>
                                            {!activeLayer && <span className="w-1.5 h-1.5 rounded-full bg-hydro-primary"></span>}
                                        </button>
                                        <div className="h-px bg-border my-1 mx-2"></div>
                                        {layers.map(layer => (
                                            <button
                                                key={layer.layer_name}
                                                onClick={() => { toggleLayer(layer.layer_name); setIsLayerMenuOpen(false); }}
                                                className={`w-full text-left px-4 py-2 text-xs flex items-center justify-between hover:bg-accent transition-colors ${activeLayer === layer.layer_name ? 'text-hydro-primary bg-hydro-primary/10' : 'text-[var(--foreground)] opacity-70'}`}
                                            >
                                                <span>{layer.title}</span>
                                                {activeLayer === layer.layer_name && <span className="w-1.5 h-1.5 rounded-full bg-hydro-primary"></span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div ref={mapContainer} className="w-full h-full" />
            </div>

            {selectedSensor && (
                <SensorDetailModal
                    sensor={selectedSensor}
                    isOpen={!!selectedSensor}
                    onClose={() => setSelectedSensor(null)}
                    token={token}
                    onDelete={() => { }}
                />
            )}
        </>
    );
}
