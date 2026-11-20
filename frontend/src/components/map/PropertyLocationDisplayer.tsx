'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  MapControl,
  ControlPosition,
  useMap,
} from "@vis.gl/react-google-maps";
import { Circle } from "./Circle";
import { FaUser, FaStreetView } from "react-icons/fa";
import { LocateFixed, Loader2 } from "lucide-react";

interface PropertyLocationDisplayerProps {
  position: { lat: number; lng: number };
  circle?: boolean;
}

function computeHeading(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Re-centers the uncontrolled map only when the target property coordinates change,
// and injects Refocus + Street View controls directly inside Google Maps (works inline & fullscreen).
function PropertyMapControls({ position }: { position: { lat: number; lng: number } }) {
  const map = useMap();
  const prevCoordsRef = useRef<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLoadingStreetView, setIsLoadingStreetView] = useState(false);
  const [isStreetViewVisible, setIsStreetViewVisible] = useState(false);
  const [streetViewNotice, setStreetViewNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!map) return;
    const key = `${position.lat},${position.lng}`;
    if (prevCoordsRef.current !== null && prevCoordsRef.current !== key) {
      map.panTo(position);
      map.setZoom(15);
    }
    prevCoordsRef.current = key;
  }, [map, position]);

  useEffect(() => {
    if (!map) return;
    const panorama = map.getStreetView();
    if (!panorama) return;

    const listener = panorama.addListener("visible_changed", () => {
      setIsStreetViewVisible(Boolean(panorama.getVisible()));
    });

    return () => {
      listener.remove();
    };
  }, [map]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const showNotice = useCallback((msg: string) => {
    setStreetViewNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setStreetViewNotice(null);
    }, 3200);
  }, []);

  const handleRefocusProperty = useCallback(() => {
    if (!map) return;
    const panorama = map.getStreetView();
    if (panorama?.getVisible()) {
      panorama.setVisible(false);
    }
    map.panTo(position);
    map.setZoom(15);
  }, [map, position]);

  const handleToggleStreetView = useCallback(() => {
    if (!map || typeof window === "undefined" || !window.google?.maps) return;
    const panorama = map.getStreetView();
    if (!panorama) return;

    if (panorama.getVisible()) {
      panorama.setVisible(false);
      return;
    }

    setIsLoadingStreetView(true);
    setStreetViewNotice(null);
    const svService = new window.google.maps.StreetViewService();

    svService.getPanorama(
      {
        location: position,
        radius: 250,
        preference: window.google.maps.StreetViewPreference.NEAREST,
      },
      (data, status) => {
        setIsLoadingStreetView(false);
        if (
          status === window.google.maps.StreetViewStatus.OK &&
          data?.location?.pano
        ) {
          panorama.setPano(data.location.pano);
          const panoLatLng = data.location.latLng;
          if (panoLatLng) {
            const heading = computeHeading(
              { lat: panoLatLng.lat(), lng: panoLatLng.lng() },
              position
            );
            panorama.setPov({ heading, pitch: 0 });
          }
          panorama.setVisible(true);
        } else {
          showNotice("Street View indisponible autour de ce bien");
        }
      }
    );
  }, [map, position, showNotice]);

  return (
    <MapControl position={ControlPosition.LEFT_BOTTOM}>
      <div className="ml-2.5 mb-2.5 flex flex-col items-start gap-1.5">
        {streetViewNotice && (
          <div className="px-3 py-1.5 rounded-full bg-zinc-950/90 text-white text-[11px] font-semibold shadow-lg backdrop-blur-md border border-white/15">
            {streetViewNotice}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefocusProperty}
            title="Recentrer la carte sur le bien"
            aria-label="Recentrer sur le bien"
            className="inline-flex items-center gap-1.5 h-9.5 px-3.5 rounded-full bg-white/95 hover:bg-white text-zinc-900 border border-zinc-200/90 shadow-[0_4px_14px_rgba(0,0,0,0.22)] text-xs font-bold tracking-wide active:scale-95 transition-all cursor-pointer"
          >
            <LocateFixed className="w-4 h-4 text-brand-green shrink-0 stroke-[2.25]" />
            <span>Recentrer</span>
          </button>

          <button
            type="button"
            onClick={handleToggleStreetView}
            disabled={isLoadingStreetView}
            title="Ouvrir Google Street View près du bien"
            aria-label="Google Street View"
            className={`inline-flex items-center gap-1.5 h-9.5 px-3.5 rounded-full border shadow-[0_4px_14px_rgba(0,0,0,0.22)] text-xs font-bold tracking-wide active:scale-95 transition-all cursor-pointer disabled:opacity-75 ${
              isStreetViewVisible
                ? "bg-zinc-950 text-white border-white/20 hover:bg-zinc-800"
                : "bg-white/95 hover:bg-white text-zinc-900 border-zinc-200/90"
            }`}
          >
            {isLoadingStreetView ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500 shrink-0" />
            ) : (
              <FaStreetView className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            )}
            <span>{isStreetViewVisible ? "Quitter" : "Street View"}</span>
          </button>
        </div>
      </div>
    </MapControl>
  );
}

// Cached position across mounts to prevent re-querying geolocation on every feed scroll
let cachedUserPosition: { lat: number; lng: number } | null = null;
let isRequestingGeolocation = false;
let hasAttemptedGeolocation = false;

export default function PropertyLocationDisplayer({ position, circle }: PropertyLocationDisplayerProps) {
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(cachedUserPosition);

  // Only query geolocation automatically if permission was already granted by the user
  useEffect(() => {
    let isMounted = true;

    if (
      cachedUserPosition ||
      hasAttemptedGeolocation ||
      isRequestingGeolocation ||
      typeof navigator === "undefined" ||
      !("geolocation" in navigator)
    ) {
      return;
    }

    const requestIfGranted = async () => {
      if (!navigator.permissions?.query) return;
      try {
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (!isMounted || status.state !== "granted" || isRequestingGeolocation || hasAttemptedGeolocation) {
          return;
        }
        isRequestingGeolocation = true;
        hasAttemptedGeolocation = true;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            cachedUserPosition = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            };
            if (isMounted) {
              setUserPosition(cachedUserPosition);
            }
            isRequestingGeolocation = false;
          },
          () => {
            isRequestingGeolocation = false;
          },
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        );
      } catch {
        // Ignore Permissions API errors on unsupported browsers
      }
    };

    void requestIfGranted();

    return () => {
      isMounted = false;
    };
  }, []);

  // Always focus the camera on the property location (while still rendering the user marker)
  const propertyPosition = useMemo(
    () => ({ lat: position.lat, lng: position.lng }),
    [position.lat, position.lng]
  );

  return (
    <APIProvider apiKey="AIzaSyBPQYtD-cm2GmdJGXhFcD7_2vXTkyPXqOs">
      <div className="w-full h-full min-h-[220px] relative">
        <Map
          defaultZoom={15}
          minZoom={6}
          defaultCenter={propertyPosition}
          mapId="80e7a8f8db80acb5"
          gestureHandling="greedy"
          zoomControl={true}
          fullscreenControl={true}
          className="w-full h-full"
        >
          <PropertyMapControls position={propertyPosition} />

          <AdvancedMarker position={propertyPosition}>
            <Pin background={"#dc2626"} glyphColor={"white"} borderColor={"#dc2626"} />
          </AdvancedMarker>

          {circle && (
            <Circle
              center={propertyPosition}
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
      </div>
    </APIProvider>
  );
}
