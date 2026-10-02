'use client';

import React, { useState, useEffect } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
} from "@vis.gl/react-google-maps";
import { Circle } from "./Circle";
import { getCenterOfBounds } from "geolib";
import { FaUser } from "react-icons/fa";

interface PropertyLocationDisplayerProps {
  position: { lat: number; lng: number };
  circle?: boolean;
}

export default function PropertyLocationDisplayer({ position, circle }: PropertyLocationDisplayerProps) {
  const [open, setOpen] = useState(false);
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState<number | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);

  // Ask for user location
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserPosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => {
          console.warn("Geolocation error:", err.message);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  }, []);

  // Calculate bounds and zoom
  useEffect(() => {
    if (userPosition) {
      const centerCoord = getCenterOfBounds([
        { latitude: position.lat, longitude: position.lng },
        { latitude: userPosition.lat, longitude: userPosition.lng },
      ]);

      if (centerCoord) {
        setCenter({
          lat: centerCoord.latitude,
          lng: centerCoord.longitude,
        });
      }
      // Simple zoom calculation based on distance could be here, but we'll use a fixed zoom or let map auto-fit bounds
      setMapZoom(12);
    } else {
      setCenter(position);
      setMapZoom(15);
    }
  }, [userPosition, position]);

  return (
    <APIProvider apiKey="AIzaSyBPQYtD-cm2GmdJGXhFcD7_2vXTkyPXqOs">
      <div className="w-full h-64 md:h-96 rounded-xl border border-zinc-200 overflow-hidden relative mb-4">
        {mapZoom && center && (
          <Map
            zoom={mapZoom}
            minZoom={6}
            center={center}
            mapId="80e7a8f8db80acb5"
            gestureHandling={"cooperative"}
          >
            <AdvancedMarker
              position={position}
              onClick={() => setOpen(true)}
            >
              <Pin background={"#dc2626"} glyphColor={"white"} borderColor={"#dc2626"} />
            </AdvancedMarker>

            {circle && (
              <Circle
                center={position}
                radius={600}
                strokeColor={"#7cbd1e"}
                strokeOpacity={1}
                strokeWeight={2}
                fillColor={"#3b82f6"}
                fillOpacity={0.1}
                clickable={false}
              />
            )}

            {userPosition && (
              <>
                <AdvancedMarker
                  position={userPosition}
                  title="Vous êtes ici"
                >
                  <div className="flex flex-col items-center justify-center bg-white px-2 py-1 rounded shadow-md">
                    <FaUser
                      size={14}
                      className="text-black mb-1"
                    />
                    <span className="text-[10px] font-bold text-[#4285F4]">
                      Vous
                    </span>
                  </div>
                </AdvancedMarker>
                <Circle
                  center={userPosition}
                  radius={1000}
                  strokeColor={"#4285F4"}
                  strokeOpacity={0.5}
                  fillOpacity={0}
                  strokeWeight={2}
                  clickable={false}
                />
              </>
            )}
          </Map>
        )}
      </div>
    </APIProvider>
  );
}
