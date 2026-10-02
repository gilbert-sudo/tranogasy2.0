'use client';

import { useEffect, useRef, useContext, forwardRef, useImperativeHandle } from 'react';
import { GoogleMapsContext, latLngEquals } from '@vis.gl/react-google-maps';

export interface CircleProps extends google.maps.CircleOptions {
  radius?: number;
  center?: google.maps.LatLngLiteral;
  onClick?: (e: google.maps.MapMouseEvent) => void;
  onDrag?: (e: google.maps.MapMouseEvent) => void;
  onDragStart?: (e: google.maps.MapMouseEvent) => void;
  onDragEnd?: (e: google.maps.MapMouseEvent) => void;
  onMouseOver?: (e: google.maps.MapMouseEvent) => void;
  onMouseOut?: (e: google.maps.MapMouseEvent) => void;
  onRadiusChanged?: (radius: number) => void;
  onCenterChanged?: (center: google.maps.LatLng | null) => void;
}

function useCircle(props: CircleProps) {
  const {
    onClick,
    onDrag,
    onDragStart,
    onDragEnd,
    onMouseOver,
    onMouseOut,
    onRadiusChanged,
    onCenterChanged,
    radius,
    center,
    clickable = false,
    ...circleOptions
  } = props;

  const callbacks = useRef<Record<string, any>>({});

  Object.assign(callbacks.current, {
    onClick,
    onDrag,
    onDragStart,
    onDragEnd,
    onMouseOver,
    onMouseOut,
    onRadiusChanged,
    onCenterChanged,
  });

  const circle = useRef(new google.maps.Circle()).current;

  circle.setOptions({
    ...circleOptions,
    clickable
  });

  useEffect(() => {
    if (!center) return;
    const currentCenter = circle.getCenter();
    const currentCenterLiteral = currentCenter 
      ? { lat: currentCenter.lat(), lng: currentCenter.lng() } 
      : null;
    if (!latLngEquals(center, currentCenterLiteral)) circle.setCenter(center);
  }, [center, circle]);

  useEffect(() => {
    if (radius === undefined || radius === null) return;
    if (radius !== circle.getRadius()) circle.setRadius(radius);
  }, [radius, circle]);

  const map = useContext(GoogleMapsContext)?.map;

  useEffect(() => {
    if (!map) {
      if (map === undefined)
        console.error('<Circle> has to be inside a Map component.');
      return;
    }

    circle.setMap(map);
    return () => {
      circle.setMap(null);
    };
  }, [map, circle]);

  useEffect(() => {
    if (!circle) return;

    const gme = google.maps.event;

    if (clickable) {
      [
        ['click', 'onClick'],
        ['drag', 'onDrag'],
        ['dragstart', 'onDragStart'],
        ['dragend', 'onDragEnd'],
        ['mouseover', 'onMouseOver'],
        ['mouseout', 'onMouseOut']
      ].forEach(([eventName, eventCallback]) => {
        gme.addListener(circle, eventName, (e: any) => {
          const callback = callbacks.current[eventCallback];
          if (callback) callback(e);
        });
      });
    }

    gme.addListener(circle, 'radius_changed', () => {
      const newRadius = circle.getRadius();
      callbacks.current.onRadiusChanged?.(newRadius);
    });

    gme.addListener(circle, 'center_changed', () => {
      const newCenter = circle.getCenter();
      callbacks.current.onCenterChanged?.(newCenter);
    });

    return () => {
      gme.clearInstanceListeners(circle);
    };
  }, [circle, clickable]);

  return circle;
}

export const Circle = forwardRef((props: CircleProps, ref) => {
  const circle = useCircle(props);
  useImperativeHandle(ref, () => circle);
  return null;
});
