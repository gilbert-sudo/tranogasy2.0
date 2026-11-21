'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
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
import { FaUser } from "react-icons/fa";
import { LocateFixed, Maximize2, Minimize2 } from "lucide-react";

interface PropertyLocationDisplayerProps {
  position: { lat: number; lng: number };
  circle?: boolean;
}

interface CameraSnapshot {
  center: { lat: number; lng: number };
  zoom: number;
}

// Re-centers the uncontrolled map when the target property coordinates change,
// keeps a live camera snapshot in sync, and injects Refocus + Fullscreen controls.
function PropertyMapControls({
  position,
  isFullscreen,
  onToggleFullscreen,
  cameraRef,
  syncVersion,
}: {
  position: { lat: number; lng: number };
  isFullscreen: boolean;
  onToggleFullscreen: (snapshot?: CameraSnapshot) => void;
  cameraRef: React.MutableRefObject<CameraSnapshot>;
  syncVersion: number;
}) {
  const map = useMap();
  const prevCoordsRef = useRef<string | null>(null);
  const lastAppliedSyncRef = useRef<number>(syncVersion);

  useEffect(() => {
    if (!map) return;
    const key = `${position.lat},${position.lng}`;
    if (prevCoordsRef.current !== null && prevCoordsRef.current !== key) {
      map.panTo(position);
      map.setZoom(15);
      cameraRef.current = { center: position, zoom: 15 };
    }
    prevCoordsRef.current = key;
  }, [map, position, cameraRef]);

  // Sync camera snapshot back when exiting/entering fullscreen
  useEffect(() => {
    if (!map || lastAppliedSyncRef.current === syncVersion) return;
    lastAppliedSyncRef.current = syncVersion;
    map.setCenter(cameraRef.current.center);
    map.setZoom(cameraRef.current.zoom);
  }, [map, syncVersion, cameraRef]);

  // Keep cameraRef updated on map idle so fullscreen transitions preserve exact view
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener("idle", () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (center && typeof zoom === "number") {
        cameraRef.current = {
          center: { lat: center.lat(), lng: center.lng() },
          zoom,
        };
      }
    });
    return () => listener.remove();
  }, [map, cameraRef]);

  const handleRefocusProperty = useCallback(() => {
    if (!map) return;
    map.panTo(position);
    map.setZoom(15);
    cameraRef.current = { center: position, zoom: 15 };
  }, [map, position, cameraRef]);

  const handleToggle = useCallback(() => {
    let snapshot: CameraSnapshot | undefined;
    if (map) {
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (center && typeof zoom === "number") {
        snapshot = {
          center: { lat: center.lat(), lng: center.lng() },
          zoom,
        };
      }
    }
    onToggleFullscreen(snapshot);
  }, [map, onToggleFullscreen]);

  return (
    <>
      <MapControl position={ControlPosition.LEFT_BOTTOM}>
        <div
          className={`ml-2.5 flex items-center ${
            isFullscreen ? "mb-[calc(1rem+env(safe-area-inset-bottom))]" : "mb-2.5"
          }`}
        >
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
        </div>
      </MapControl>

      {!isFullscreen && (
        <MapControl position={ControlPosition.TOP_RIGHT}>
          <div className="mr-2.5 mt-2.5 flex items-center">
            <button
              type="button"
              onClick={handleToggle}
              title="Afficher la carte en plein écran"
              aria-label="Afficher la carte en plein écran"
              className="inline-flex items-center justify-center h-9.5 w-9.5 rounded-full bg-white/95 hover:bg-white text-zinc-900 border border-zinc-200/90 shadow-[0_4px_14px_rgba(0,0,0,0.22)] active:scale-90 transition-all cursor-pointer"
            >
              <Maximize2 className="w-4 h-4 stroke-[2.25]" />
            </button>
          </div>
        </MapControl>
      )}
    </>
  );
}

/**
 * Full-screen interactive map overlay portaled directly to `document.body`.
 *
 * Implements unambiguous dual swipe-down behavior:
 * 1. Normal swipe down anywhere on the map -> smoothly slides/pans the map (look upward/north).
 * 2. Very quick straight-down flick on the map (or pulling down on the top drag pill) ->
 *    cleanly exits full-screen mode without closing any parent modal/page.
 */
function FullscreenMapPortal({
  propertyPosition,
  circle,
  userPosition,
  initialCamera,
  onExit,
}: {
  propertyPosition: { lat: number; lng: number };
  circle?: boolean;
  userPosition: { lat: number; lng: number } | null;
  initialCamera: CameraSnapshot;
  onExit: (finalCamera: CameraSnapshot) => void;
}) {
  const [showHint, setShowHint] = useState(true);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const topHandleRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<CameraSnapshot>(initialCamera);
  const preTouchCameraRef = useRef<CameraSnapshot>(initialCamera);
  const isClosingRef = useRef(false);
  const onExitRef = useRef(onExit);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const triggerExit = useCallback((usePreTouchCamera: boolean, slideDown = true) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const finalCamera = usePreTouchCamera ? preTouchCameraRef.current : cameraRef.current;
    const sheet = sheetRef.current;

    if (slideDown && sheet) {
      sheet.style.transition =
        "transform 200ms cubic-bezier(0.4, 0, 1, 1), opacity 180ms ease";
      sheet.style.transform = `translate3d(0, ${Math.max(window.innerHeight * 0.4, 280)}px, 0)`;
      sheet.style.opacity = "0";
      setTimeout(() => {
        onExitRef.current(finalCamera);
      }, 190);
    } else {
      onExitRef.current(finalCamera);
    }
  }, []);

  // Auto-fade subtle gesture hint shortly after entering full-screen
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 2800);
    return () => clearTimeout(timer);
  }, []);

  // Preserve parent body overflow safely
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Escape exits ONLY full-screen map (capture phase protects underlying PropertyDetailsModal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        triggerExit(false, false);
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [triggerExit]);

  // 1) Passive capture-phase observer on the map canvas:
  //    - Normal drags/pans (slow, medium, diagonal, paused, multi-touch) -> 100% native Google Maps pan!
  //    - Very quick, strictly vertical downward ballistic flick -> exits full-screen smoothly!
  useEffect(() => {
    const host = mapHostRef.current;
    if (!host) return;

    let active = false;
    let hadMultiTouch = false;
    let reversedUp = false;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let minY = 0;
    let maxY = 0;
    const samples: Array<{ y: number; t: number }> = [];

    const handleTouchStart = (e: TouchEvent) => {
      if (isClosingRef.current) return;

      if (e.touches.length !== 1) {
        hadMultiTouch = true;
        active = false;
        return;
      }

      const target = e.target as HTMLElement | null;
      if (target?.closest("button") || target?.closest('[data-map-exit-handle="true"]')) {
        active = false;
        return;
      }

      const touch = e.touches[0];
      const now = performance.now();
      active = true;
      hadMultiTouch = false;
      reversedUp = false;
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = now;
      minY = startY;
      maxY = startY;
      samples.length = 0;
      samples.push({ y: startY, t: now });

      // Remember settled camera before this stroke so a quick exit flick doesn't drift the inline map
      preTouchCameraRef.current = {
        center: { ...cameraRef.current.center },
        zoom: cameraRef.current.zoom,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!active || isClosingRef.current) return;
      if (e.touches.length !== 1) {
        hadMultiTouch = true;
        active = false;
        return;
      }

      const touch = e.touches[0];
      const y = touch.clientY;
      const now = performance.now();

      if (y < minY) minY = y;
      if (y > maxY) {
        maxY = y;
      } else if (maxY - y > 18) {
        // User reversed direction upward while exploring the map -> definitely panning
        reversedUp = true;
      }

      samples.push({ y, t: now });
      // Trim samples older than 130ms while keeping at least 2 points
      while (samples.length > 2 && now - samples[0].t > 130) {
        samples.shift();
      }
    };

    const handleTouchEndOrCancel = (e: TouchEvent) => {
      if (!active || isClosingRef.current) {
        active = false;
        return;
      }
      active = false;

      if (e.type === "touchcancel" || hadMultiTouch || reversedUp) {
        return;
      }

      const touch = e.changedTouches[0];
      if (!touch) return;

      const endTime = performance.now();
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const dt = Math.max(1, endTime - startTime);

      // Compute both overall velocity and recent release velocity (px/ms)
      const avgVy = dy / dt;
      const refSample = samples[0] ?? { y: startY, t: startTime };
      const recentDt = Math.max(1, endTime - refSample.t);
      const recentVy = (touch.clientY - refSample.y) / recentDt;

      // Strict high-velocity ballistic straight-down flick classifier:
      // - Normal pan down (avgVy ~ 0.2–0.95 px/ms or dt > 230ms or diagonal) -> stays on map!
      // - Very quick straight-down flick (>= 115px in <= 230ms, >= 1.25 px/ms, <= 22.6 deg off vertical) -> exits!
      const isVeryQuickStraightDownFlick =
        dy >= 115 &&
        dt <= 230 &&
        minY >= startY - 12 &&
        dy > Math.abs(dx) * 2.4 &&
        avgVy >= 1.25 &&
        recentVy >= 1.25;

      if (isVeryQuickStraightDownFlick) {
        triggerExit(true, true);
      }
    };

    host.addEventListener("touchstart", handleTouchStart, { capture: true, passive: true });
    host.addEventListener("touchmove", handleTouchMove, { capture: true, passive: true });
    host.addEventListener("touchend", handleTouchEndOrCancel, { capture: true, passive: true });
    host.addEventListener("touchcancel", handleTouchEndOrCancel, { capture: true, passive: true });

    return () => {
      host.removeEventListener("touchstart", handleTouchStart, { capture: true });
      host.removeEventListener("touchmove", handleTouchMove, { capture: true });
      host.removeEventListener("touchend", handleTouchEndOrCancel, { capture: true });
      host.removeEventListener("touchcancel", handleTouchEndOrCancel, { capture: true });
    };
  }, [triggerExit]);

  // 2) Dedicated top drag handle bar: gentle swipe-down at any speed exits full-screen cleanly
  useEffect(() => {
    const handle = topHandleRef.current;
    if (!handle) return;

    let dragging = false;
    let startY = 0;
    let lastY = 0;
    let prevY = 0;
    let lastTime = 0;
    let prevTime = 0;
    let dragY = 0;

    const springBack = () => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      sheet.style.transition =
        "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 240ms ease";
      sheet.style.transform = "translate3d(0, 0, 0)";
      sheet.style.borderRadius = "0px";
    };

    const onStart = (e: TouchEvent) => {
      if (isClosingRef.current || e.touches.length !== 1) return;
      e.stopPropagation();
      const touch = e.touches[0];
      const now = performance.now();
      dragging = true;
      startY = touch.clientY;
      lastY = startY;
      prevY = startY;
      lastTime = now;
      prevTime = now;
      dragY = 0;
      if (sheetRef.current) {
        sheetRef.current.style.transition = "none";
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!dragging || isClosingRef.current || e.touches.length !== 1) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();

      const touch = e.touches[0];
      const now = performance.now();
      if (now - lastTime > 12) {
        prevY = lastY;
        prevTime = lastTime;
        lastY = touch.clientY;
        lastTime = now;
      }

      dragY = Math.max(0, touch.clientY - startY);
      const sheet = sheetRef.current;
      if (sheet) {
        sheet.style.transform = `translate3d(0, ${dragY}px, 0)`;
        sheet.style.borderRadius = `${Math.min(28, dragY * 0.25)}px`;
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!dragging || isClosingRef.current) return;
      dragging = false;
      e.stopPropagation();

      if (e.type === "touchcancel") {
        springBack();
        return;
      }

      const touch = e.changedTouches[0];
      const finalY = touch ? touch.clientY : lastY;
      const vy = (finalY - prevY) / Math.max(1, performance.now() - prevTime);

      if (dragY > 80 || (dragY > 36 && vy > 0.45)) {
        triggerExit(false, true);
      } else {
        springBack();
      }
    };

    handle.addEventListener("touchstart", onStart, { passive: true });
    handle.addEventListener("touchmove", onMove, { passive: false });
    handle.addEventListener("touchend", onEnd, { passive: true });
    handle.addEventListener("touchcancel", onEnd, { passive: true });

    return () => {
      handle.removeEventListener("touchstart", onStart);
      handle.removeEventListener("touchmove", onMove);
      handle.removeEventListener("touchend", onEnd);
      handle.removeEventListener("touchcancel", onEnd);
    };
  }, [triggerExit]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-swipe-dismiss-ignore="true"
      data-modal-overlay-active="true"
      data-map-container="true"
      role="dialog"
      aria-modal="true"
      aria-label="Carte en plein écran"
      className="fixed inset-0 z-[150] bg-black/75 overflow-hidden select-none"
    >
      <div
        ref={sheetRef}
        className="relative w-full h-full bg-zinc-950 overflow-hidden will-change-transform"
      >
        {/* Top Safe-Area Drag Handle Pill + Exit Fullscreen Controls */}
        <div className="pointer-events-none absolute top-0 left-0 right-0 z-30 pt-[calc(0.6rem+var(--ios-safe-top))] px-3.5 flex items-start justify-between">
          <div className="w-10 shrink-0" aria-hidden="true" />

          {/* Dedicated Top Drag Pill Handle (pull gently to exit full-screen) */}
          <div
            ref={topHandleRef}
            data-map-exit-handle="true"
            className="pointer-events-auto flex flex-col items-center gap-1.5 px-5 py-2 cursor-grab active:cursor-grabbing"
            style={{ touchAction: "none" }}
            aria-label="Glisser vers le bas pour quitter le plein écran"
          >
            <div className="w-11 h-1.5 rounded-full bg-zinc-900/75 dark:bg-white/80 shadow-[0_2px_10px_rgba(0,0,0,0.3)] border border-white/50" />
            <div
              className={`px-3 py-1 rounded-full bg-zinc-950/80 text-white text-[11px] font-semibold tracking-wide backdrop-blur-md border border-white/15 shadow-lg transition-all duration-300 whitespace-nowrap ${
                showHint ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none"
              }`}
            >
              Glissez vite vers le bas pour quitter
            </div>
          </div>

          {/* Safe-Area Aware Exit Fullscreen Button */}
          <button
            type="button"
            onClick={() => triggerExit(false, true)}
            title="Quitter le plein écran"
            aria-label="Quitter le plein écran"
            className="pointer-events-auto inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full bg-white/95 hover:bg-white text-zinc-900 border border-zinc-200/90 shadow-[0_4px_18px_rgba(0,0,0,0.28)] text-xs font-bold tracking-wide active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <Minimize2 className="w-4 h-4 stroke-[2.25] shrink-0" />
            <span className="hidden sm:inline">Réduire</span>
          </button>
        </div>

        {/* Interactive Full-Screen Google Map */}
        <div ref={mapHostRef} className="w-full h-full">
          <Map
            defaultZoom={initialCamera.zoom}
            minZoom={6}
            defaultCenter={initialCamera.center}
            mapId="80e7a8f8db80acb5"
            gestureHandling="greedy"
            zoomControl={true}
            fullscreenControl={false}
            streetViewControl={false}
            className="w-full h-full"
          >
            <PropertyMapControls
              position={propertyPosition}
              isFullscreen={true}
              onToggleFullscreen={() => triggerExit(false, true)}
              cameraRef={cameraRef}
              syncVersion={0}
            />

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
                <AdvancedMarker position={userPosition} title="Vous êtes ici">
                  <div className="flex flex-col items-center justify-center bg-white px-2 py-1 rounded shadow-md">
                    <FaUser size={14} className="text-black mb-1" />
                    <span className="text-[10px] font-bold text-[#4285F4]">Vous</span>
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
      </div>
    </div>,
    document.body
  );
}

// Cached position across mounts to prevent re-querying geolocation on every feed scroll
let cachedUserPosition: { lat: number; lng: number } | null = null;
let isRequestingGeolocation = false;
let hasAttemptedGeolocation = false;

export default function PropertyLocationDisplayer({ position, circle }: PropertyLocationDisplayerProps) {
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(cachedUserPosition);
  const [fullscreenCamera, setFullscreenCamera] = useState<CameraSnapshot | null>(null);
  const [syncVersion, setSyncVersion] = useState(0);

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

  const cameraRef = useRef<CameraSnapshot>({
    center: propertyPosition,
    zoom: 15,
  });

  const handleOpenFullscreen = useCallback((snapshot?: CameraSnapshot) => {
    const resolved = snapshot ?? cameraRef.current;
    cameraRef.current = resolved;
    setFullscreenCamera({
      center: { ...resolved.center },
      zoom: resolved.zoom,
    });
  }, []);

  const handleExitFullscreen = useCallback((finalCamera: CameraSnapshot) => {
    cameraRef.current = finalCamera;
    setFullscreenCamera(null);
    setSyncVersion((v) => v + 1);
  }, []);

  return (
    <APIProvider apiKey="AIzaSyBPQYtD-cm2GmdJGXhFcD7_2vXTkyPXqOs">
      <div
        data-swipe-dismiss-ignore="true"
        data-map-container="true"
        className="w-full h-full min-h-[220px] relative"
      >
        <Map
          defaultZoom={15}
          minZoom={6}
          defaultCenter={propertyPosition}
          mapId="80e7a8f8db80acb5"
          gestureHandling="greedy"
          zoomControl={true}
          fullscreenControl={false}
          streetViewControl={false}
          className="w-full h-full"
        >
          <PropertyMapControls
            position={propertyPosition}
            isFullscreen={false}
            onToggleFullscreen={handleOpenFullscreen}
            cameraRef={cameraRef}
            syncVersion={syncVersion}
          />

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

      {fullscreenCamera && (
        <FullscreenMapPortal
          propertyPosition={propertyPosition}
          circle={circle}
          userPosition={userPosition}
          initialCamera={fullscreenCamera}
          onExit={handleExitFullscreen}
        />
      )}
    </APIProvider>
  );
}
