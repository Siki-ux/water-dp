"use client";

import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from '../ThemeContext';

interface SensorMiniMapProps {
    latitude: number;
    longitude: number;
}

export default function SensorMiniMap({ latitude, longitude }: SensorMiniMapProps) {
    const { theme } = useTheme();
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);

    const styleUrl = theme === 'dark'
        ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
        : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

    useEffect(() => {
        if (!mapContainer.current) return;

        if (!map.current) {
            try {
                map.current = new maplibregl.Map({
                    container: mapContainer.current,
                    style: styleUrl,
                    center: [longitude, latitude],
                    zoom: 5,
                    interactive: true,
                    attributionControl: false,
                });

                map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

                map.current.on('load', () => {
                    new maplibregl.Marker({ color: '#3b82f6' })
                        .setLngLat([longitude, latitude])
                        .addTo(map.current!);
                });

            } catch (error) {
                console.error("Error initializing mini map:", error);
            }
        } else {
            map.current.setStyle(styleUrl);
        }
    }, [styleUrl]);

    useEffect(() => {
        if (!map.current) return;
        map.current.setCenter([longitude, latitude]);
    }, [latitude, longitude]);

    return <div ref={mapContainer} className="w-full h-full" />;
}
