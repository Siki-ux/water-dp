"use client";

import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from '@/components/ThemeContext';

interface LocationPickerMapProps {
    latitude: number;
    longitude: number;
    onLocationChange: (lat: number, lon: number) => void;
}

export default function LocationPickerMap({ latitude, longitude, onLocationChange }: LocationPickerMapProps) {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const marker = useRef<maplibregl.Marker | null>(null);

    const { theme } = useTheme();

    // Initial Map Setup
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        const isLight = theme === 'light';
        const styleUrl = isLight
            ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
            : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

        try {
            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style: styleUrl,
                center: [longitude || 0, latitude || 0],
                zoom: longitude && latitude ? 12 : 1,
                interactive: true,
                attributionControl: false,
            });

            map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

            // Initialize Marker
            marker.current = new maplibregl.Marker({ color: '#3b82f6', draggable: true })
                .setLngLat([longitude || 0, latitude || 0])
                .addTo(map.current);

            // Handle Drag End
            marker.current.on('dragend', () => {
                const lngLat = marker.current?.getLngLat();
                if (lngLat) {
                    onLocationChange(lngLat.lat, lngLat.lng);
                }
            });

            // Handle Map Click
            map.current.on('click', (e) => {
                const { lng, lat } = e.lngLat;
                marker.current?.setLngLat([lng, lat]);
                onLocationChange(lat, lng);
            });

        } catch (error) {
            console.error("Error initializing location picker map:", error);
        }

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, []); // Run only once

    // Update map style when theme changes
    useEffect(() => {
        if (!map.current) return;
        const isLight = theme === 'light';
        map.current.setStyle(
            isLight
                ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
                : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
        );
    }, [theme]);

    // Sync Props to Map (One-way sync to avoid loop if parent updates)
    // We only update map view if the distance is significant or it's a fresh load
    // Actually, for a picker, we usually want the map to follow the form inputs if they are typed manually.
    useEffect(() => {
        if (!map.current || !marker.current) return;
        const currentPos = marker.current.getLngLat();

        // precise comparison to avoid jitter
        if (Math.abs(currentPos.lat - latitude) > 0.000001 || Math.abs(currentPos.lng - longitude) > 0.000001) {
            marker.current.setLngLat([longitude, latitude]);
            map.current.flyTo({ center: [longitude, latitude], zoom: map.current.getZoom() });
        }
    }, [latitude, longitude]);

    return <div ref={mapContainer} className="w-full h-full rounded-md" />;
}
