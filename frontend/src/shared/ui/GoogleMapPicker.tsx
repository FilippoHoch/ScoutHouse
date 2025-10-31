/// <reference types="google.maps" />

import { useEffect, useMemo, useRef, useState } from "react";

type LeafletMap = import("leaflet").Map;
type LeafletMarker = import("leaflet").Marker;
type LeafletLatLng = import("leaflet").LatLng;
type LeafletMouseEvent = import("leaflet").LeafletMouseEvent;

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

type LoaderState = "idle" | "loading" | "ready" | "error";

export const GOOGLE_MAP_DEFAULT_CENTER: GoogleMapPickerCoordinates = {
  lat: 45.59342700792413,
  lng: 10.154572253126775
};

const FALLBACK_TILE_URL = "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
const FALLBACK_TILE_SUBDOMAINS: string[] = ["mt0", "mt1", "mt2", "mt3"];
const FALLBACK_DEFAULT_ZOOM = 13;
const FALLBACK_SELECTED_ZOOM = 15;

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

type FallbackProps = {
  value: GoogleMapPickerCoordinates | null;
  onChange: (value: GoogleMapPickerCoordinates) => void;
  className?: string;
  labels: GoogleMapPickerLabels;
  ariaLabel?: string;
};

const FallbackGoogleMapPicker = ({
  value,
  onChange,
  className,
  labels,
  ariaLabel
}: FallbackProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const latestValueRef = useRef<GoogleMapPickerCoordinates | null>(value);
  const onChangeRef = useRef(onChange);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    latestValueRef.current = value;

    if (!mapRef.current || !markerRef.current) {
      return;
    }

    const map = mapRef.current;
    const marker = markerRef.current;

    if (value) {
      marker.setLatLng(value);
      if (!map.hasLayer(marker)) {
        marker.addTo(map);
      }
      if (map.getZoom() < FALLBACK_SELECTED_ZOOM) {
        map.setZoom(FALLBACK_SELECTED_ZOOM);
      }
      map.panTo(value);
    } else if (map.hasLayer(marker)) {
      marker.remove();
    }
  }, [value]);

  useEffect(() => {
    let isMounted = true;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const L = await import("leaflet");
        await import("leaflet/dist/leaflet.css");

        if (!isMounted || !containerRef.current) {
          return;
        }

        const map = L.map(containerRef.current, {
          center: latestValueRef.current ?? GOOGLE_MAP_DEFAULT_CENTER,
          zoom: latestValueRef.current ? FALLBACK_SELECTED_ZOOM : FALLBACK_DEFAULT_ZOOM,
          zoomControl: true,
          attributionControl: false
        });

        const tileLayer = L.tileLayer(FALLBACK_TILE_URL, {
          subdomains: FALLBACK_TILE_SUBDOMAINS,
          maxZoom: 19,
          minZoom: 4
        });

        tileLayer.addTo(map);

        const markerIcon = L.divIcon({
          className: "google-map-picker-marker",
          html: "<span></span>",
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const marker = L.marker(
          latestValueRef.current ?? GOOGLE_MAP_DEFAULT_CENTER,
          {
            draggable: true,
            autoPan: true,
            icon: markerIcon
          }
        );

        mapRef.current = map;
        markerRef.current = marker;

        if (latestValueRef.current) {
          marker.addTo(map);
        }

        const selectCoordinates = (coordinates: LeafletLatLng) => {
          if (!mapRef.current || !markerRef.current) {
            return;
          }

          markerRef.current.setLatLng(coordinates);
          if (!mapRef.current.hasLayer(markerRef.current)) {
            markerRef.current.addTo(mapRef.current);
          }
          if (mapRef.current.getZoom() < FALLBACK_SELECTED_ZOOM) {
            mapRef.current.setZoom(FALLBACK_SELECTED_ZOOM);
          }
          mapRef.current.panTo(coordinates);
          onChangeRef.current({ lat: coordinates.lat, lng: coordinates.lng });
        };

        const handleMapClick = (event: LeafletMouseEvent) => {
          selectCoordinates(event.latlng);
        };

        const handleMarkerDrag = (event: import("leaflet").LeafletEvent) => {
          const coords = (event.target as LeafletMarker).getLatLng();
          selectCoordinates(coords);
        };

        map.on("click", handleMapClick);
        marker.on("dragend", handleMarkerDrag);

        cleanup = () => {
          map.off("click", handleMapClick);
          marker.off("dragend", handleMarkerDrag);
        };

        setState("ready");
      } catch {
        if (!isMounted) {
          return;
        }
        setState("error");
      }
    })();

    return () => {
      isMounted = false;
      cleanup?.();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const statusMessage = useMemo(() => {
    if (state === "loading") {
      return labels.loading;
    }
    if (state === "error") {
      return labels.loadError;
    }
    return null;
  }, [labels.loadError, labels.loading, state]);

  return (
    <div
      className={["google-map-picker", className].filter(Boolean).join(" ")}
      data-state={`fallback-${state}`}
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
      {state === "ready" && labels.missingKey && (
        <div className="google-map-picker-helper">
          <p>{labels.missingKey}</p>
        </div>
      )}
    </div>
  );
};

type GoogleMapPickerWithApiProps = GoogleMapPickerProps & { apiKey: string };

const GoogleMapPickerWithApi = ({
  apiKey,
  value,
  onChange,
  className,
  labels,
  ariaLabel
}: GoogleMapPickerWithApiProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const listenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const latestValueRef = useRef<GoogleMapPickerCoordinates | null>(value);
  const onChangeRef = useRef(onChange);
  const [state, setState] = useState<LoaderState>("idle");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!apiKey) {
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
          center: initialValue ?? GOOGLE_MAP_DEFAULT_CENTER,
          zoom: initialValue ? 14 : 13,
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
      if (mapRef.current.getZoom() < 14) {
        mapRef.current.setZoom(14);
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
    return null;
  }, [labels.loadError, labels.loading, state]);

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

export const GoogleMapPicker = ({
  apiKey,
  value,
  onChange,
  className,
  labels,
  ariaLabel
}: GoogleMapPickerProps) => {
  if (!apiKey) {
    return (
      <FallbackGoogleMapPicker
        value={value}
        onChange={onChange}
        className={className}
        labels={labels}
        ariaLabel={ariaLabel}
      />
    );
  }

  return (
    <GoogleMapPickerWithApi
      apiKey={apiKey}
      value={value}
      onChange={onChange}
      className={className}
      labels={labels}
      ariaLabel={ariaLabel}
    />
  );
};

