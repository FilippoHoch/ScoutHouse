/// <reference types="google.maps" />

import { useEffect, useMemo, useRef, useState } from "react";

export type GoogleMapPickerCoordinates = {
  lat: number;
  lng: number;
};

export type GoogleMapPickerLabels = {
  loading: string;
  loadError: string;
  missingKey: string;
};

type GoogleMapPickerProps = {
  apiKey?: string;
  value: GoogleMapPickerCoordinates | null;
  onChange: (value: GoogleMapPickerCoordinates) => void;
  className?: string;
  labels: GoogleMapPickerLabels;
  ariaLabel?: string;
};

type LoaderState = "idle" | "missing-key" | "loading" | "ready" | "error";

const DEFAULT_CENTER: GoogleMapPickerCoordinates = {
  lat: 41.8719,
  lng: 12.5674
};

const scriptCache: Record<string, Promise<typeof google.maps> | undefined> = {};

const MAP_CALLBACK_NAME = "__scouthouseGoogleMapsInit" as const;

declare global {
  interface Window {
    [MAP_CALLBACK_NAME]?: () => void;
  }
}

const loadGoogleMapsApi = (apiKey: string): Promise<typeof google.maps> => {
  if (scriptCache[apiKey]) {
    return scriptCache[apiKey]!;
  }

  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps API can only load in the browser"));
  }

  if (window.google && window.google.maps) {
    const existing = Promise.resolve(window.google.maps);
    scriptCache[apiKey] = existing;
    return existing;
  }

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=${MAP_CALLBACK_NAME}`;
  script.async = true;
  script.defer = true;
  script.dataset.googleMapsScript = "true";

  const promise = new Promise<typeof google.maps>((resolve, reject) => {
    window[MAP_CALLBACK_NAME] = () => {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error("Google Maps API loaded without google.maps"));
      }
      delete window[MAP_CALLBACK_NAME];
    };

    script.onerror = () => {
      delete window[MAP_CALLBACK_NAME];
      reject(new Error("Unable to load Google Maps API"));
    };
  });

  scriptCache[apiKey] = promise;
  document.head.appendChild(script);
  return promise.catch((error) => {
    delete scriptCache[apiKey];
    throw error;
  });
};

const cleanupListeners = (listeners: google.maps.MapsEventListener[]) => {
  for (const listener of listeners) {
    listener.remove();
  }
};

export const GoogleMapPicker = ({
  apiKey,
  value,
  onChange,
  className,
  labels,
  ariaLabel
}: GoogleMapPickerProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const listenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const latestValueRef = useRef<GoogleMapPickerCoordinates | null>(value);
  const onChangeRef = useRef(onChange);
  const [state, setState] = useState<LoaderState>(() =>
    apiKey ? "idle" : "missing-key"
  );

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const fallbackEmbedUrl = useMemo(() => {
    const center = value ?? DEFAULT_CENTER;
    const zoom = value ? 14 : 6;
    const { lat, lng } = center;
    const url = new URL("https://maps.google.com/maps");
    url.searchParams.set("q", `${lat},${lng}`);
    url.searchParams.set("z", zoom.toString());
    url.searchParams.set("output", "embed");
    url.searchParams.set("iwloc", "");
    return url.toString();
  }, [value]);

  useEffect(() => {
    if (!apiKey) {
      setState("missing-key");
      return;
    }

    let isCancelled = false;
    setState("loading");

    loadGoogleMapsApi(apiKey)
      .then(() => {
        if (isCancelled) {
          return;
        }

        if (!containerRef.current) {
          setState("error");
          return;
        }

        const initialValue = latestValueRef.current;

        const map = new google.maps.Map(containerRef.current, {
          center: initialValue ?? DEFAULT_CENTER,
          zoom: initialValue ? 12 : 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false
        });

        mapRef.current = map;

        const marker = new google.maps.Marker({
          map,
          draggable: true
        });

        markerRef.current = marker;

        if (initialValue) {
          marker.setPosition(initialValue);
        } else {
          marker.setMap(null);
        }

        listenersRef.current = [
          map.addListener("click", (event: google.maps.MapMouseEvent) => {
            if (!event.latLng) {
              return;
            }
            const coordinates = event.latLng.toJSON();
            marker.setMap(map);
            marker.setPosition(coordinates);
            onChangeRef.current(coordinates);
          }),
          marker.addListener("dragend", (event: google.maps.MapMouseEvent) => {
            if (!event.latLng) {
              return;
            }
            const coordinates = event.latLng.toJSON();
            marker.setMap(map);
            marker.setPosition(coordinates);
            onChangeRef.current(coordinates);
          })
        ];

        setState("ready");
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }
        setState("error");
      });

    return () => {
      isCancelled = true;
      cleanupListeners(listenersRef.current);
      listenersRef.current = [];
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [apiKey]);

  useEffect(() => {
    latestValueRef.current = value;

    if (!mapRef.current || !markerRef.current) {
      return;
    }

    if (value) {
      markerRef.current.setMap(mapRef.current);
      markerRef.current.setPosition(value);
      mapRef.current.panTo(value);
      if (mapRef.current.getZoom() < 12) {
        mapRef.current.setZoom(12);
      }
    } else {
      markerRef.current.setMap(null);
    }
  }, [value]);

  const statusMessage = useMemo(() => {
    if (state === "loading") {
      return labels.loading;
    }
    if (state === "error") {
      return labels.loadError;
    }
    if (state === "missing-key") {
      return labels.missingKey;
    }
    return null;
  }, [labels.loadError, labels.loading, labels.missingKey, state]);

  if (!apiKey) {
    return (
      <div
        className={["google-map-picker", className].filter(Boolean).join(" ")}
        data-state="embed"
      >
        <div className="google-map-picker-embed">
          <iframe
            src={fallbackEmbedUrl}
            title={ariaLabel ?? labels.missingKey ?? "Google Maps embed"}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        {labels.missingKey && (
          <div className="google-map-picker-status" role="status">
            <p>{labels.missingKey}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={["google-map-picker", className].filter(Boolean).join(" ")}
      data-state={state}
    >
      <div
        ref={containerRef}
        className="google-map-picker-canvas"
        role="application"
        aria-label={ariaLabel}
      />
      {statusMessage && (
        <div className="google-map-picker-status" role="status">
          <p>{statusMessage}</p>
        </div>
      )}
    </div>
  );
};

