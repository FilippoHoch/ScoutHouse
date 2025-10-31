/// <reference types="google.maps" />

import { useEffect, useMemo, useRef, useState } from "react";

type MapLibreModule = typeof import("maplibre-gl");
type MapLibreMap = import("maplibre-gl").Map;
type MapLibreMarker = import("maplibre-gl").Marker;

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

const FALLBACK_STYLE_URL = "https://demotiles.maplibre.org/style.json";
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
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
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
      marker.setLngLat([value.lng, value.lat]);
      marker.addTo(map);
      const updates: Parameters<MapLibreMap["jumpTo"]>[0] = {
        center: [value.lng, value.lat]
      };

      if (map.getZoom() < FALLBACK_SELECTED_ZOOM) {
        updates.zoom = FALLBACK_SELECTED_ZOOM;
      }

      map.jumpTo(updates);
    } else {
      marker.remove();
    }
  }, [value]);

  useEffect(() => {
    let isMounted = true;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const maplibreModule = (await import("maplibre-gl")) as MapLibreModule;
        await import("maplibre-gl/dist/maplibre-gl.css");

        if (!isMounted || !containerRef.current) {
          return;
        }

        const center = latestValueRef.current ?? GOOGLE_MAP_DEFAULT_CENTER;
        const map = new maplibreModule.Map({
          container: containerRef.current,
          style: FALLBACK_STYLE_URL,
          center: [center.lng, center.lat],
          zoom: latestValueRef.current ? FALLBACK_SELECTED_ZOOM : FALLBACK_DEFAULT_ZOOM,
          pitch: 45,
          bearing: -17.6,
          antialias: true
        });

        const markerElement = document.createElement("div");
        markerElement.className = "google-map-picker-marker";
        const markerInner = document.createElement("span");
        markerElement.appendChild(markerInner);

        const marker = new maplibreModule.Marker({
          element: markerElement,
          draggable: true
        });

        mapRef.current = map;
        markerRef.current = marker;

        if (latestValueRef.current) {
          marker.setLngLat([latestValueRef.current.lng, latestValueRef.current.lat]);
          marker.addTo(map);
        }

        const selectCoordinates = (coordinates: { lat: number; lng: number }) => {
          if (!mapRef.current || !markerRef.current) {
            return;
          }

          markerRef.current.setLngLat([coordinates.lng, coordinates.lat]);
          markerRef.current.addTo(mapRef.current);
          const options: Parameters<MapLibreMap["easeTo"]>[0] = {
            center: [coordinates.lng, coordinates.lat]
          };
          if (mapRef.current.getZoom() < FALLBACK_SELECTED_ZOOM) {
            options.zoom = FALLBACK_SELECTED_ZOOM;
          }
          mapRef.current.easeTo(options);
          onChangeRef.current({ lat: coordinates.lat, lng: coordinates.lng });
        };

        const handleMapClick = (event: import("maplibre-gl").MapMouseEvent) => {
          const { lat, lng } = event.lngLat;
          selectCoordinates({ lat, lng });
        };

        const handleMarkerDrag = () => {
          if (!markerRef.current) {
            return;
          }
          const coords = markerRef.current.getLngLat();
          selectCoordinates({ lat: coords.lat, lng: coords.lng });
        };

        map.on("click", handleMapClick);
        marker.on("dragend", handleMarkerDrag);

        map.on("load", () => {
          if (!mapRef.current) {
            return;
          }

          const layers = mapRef.current.getStyle()?.layers ?? [];
          const labelLayer = layers.find(
            (layer) => layer.type === "symbol" && Boolean(layer.layout?.["text-field"])
          );

          if (!mapRef.current.getLayer("3d-buildings")) {
            mapRef.current.addLayer(
              {
                id: "3d-buildings",
                source: "openmaptiles",
                "source-layer": "building",
                type: "fill-extrusion",
                minzoom: 13,
                paint: {
                  "fill-extrusion-color": [
                    "case",
                    ["boolean", ["feature-state", "hover"], false],
                    "#4f83ff",
                    "#9bb5ff"
                  ],
                  "fill-extrusion-opacity": 0.85,
                  "fill-extrusion-height": [
                    "coalesce",
                    ["get", "render_height"],
                    ["get", "height"],
                    20
                  ],
                  "fill-extrusion-base": [
                    "coalesce",
                    ["get", "render_min_height"],
                    ["get", "min_height"],
                    0
                  ]
                }
              },
              labelLayer?.id
            );
          }

          mapRef.current.addControl(new maplibreModule.NavigationControl());
          setState("ready");
        });

        map.on("error", () => {
          setState((prev) => (prev === "ready" ? prev : "error"));
        });

        cleanup = () => {
          map.off("click", handleMapClick);
          marker.off("dragend", handleMarkerDrag);
        };
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

