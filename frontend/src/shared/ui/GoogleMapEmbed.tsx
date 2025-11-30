import { useCallback, useEffect, useMemo, useState } from "react";
import type { LeafletMouseEvent } from "leaflet";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import { getTileLayerVariant, type GoogleMapType } from "../utils/googleMaps";

export type GoogleMapEmbedCoordinates = {
  lat: number;
  lng: number;
};

type GoogleMapEmbedProps = {
  coordinates: GoogleMapEmbedCoordinates | null;
  title: string;
  ariaLabel?: string;
  emptyLabel: string;
  className?: string;
  mapType?: GoogleMapType;
  onCoordinatesChange?: (coordinates: GoogleMapEmbedCoordinates) => void;
};

const GOOGLE_TILE_URL = (variant: string) => `https://{s}.google.com/vt/lyrs=${variant}&x={x}&y={y}&z={z}`;
const GOOGLE_TILE_SUBDOMAINS = ["mt0", "mt1", "mt2", "mt3"];

const DEFAULT_CENTER: GoogleMapEmbedCoordinates = {
  lat: 41.8719,
  lng: 12.5674
};

const DEFAULT_ZOOM = 6;
const SELECTION_ZOOM = 15;

const combineClassNames = (...classNames: (string | false | null | undefined)[]) =>
  classNames.filter(Boolean).join(" ");

const MARKER_ICON_HTML = `
  <span class="google-map-embed__marker-icon" aria-hidden="true">
    <svg viewBox="0 0 20 20" focusable="false">
      <circle cx="10" cy="10" r="6" />
    </svg>
  </span>
`;

const MARKER_ICON_SIZE: [number, number] = [28, 28];

const markerIcon = L.divIcon({
  className: "google-map-embed__marker",
  html: MARKER_ICON_HTML,
  iconSize: MARKER_ICON_SIZE,
  iconAnchor: [MARKER_ICON_SIZE[0] / 2, MARKER_ICON_SIZE[1]]
});

const normalizeCoordinates = (value: GoogleMapEmbedCoordinates) => ({
  lat: Number.parseFloat(value.lat.toFixed(6)),
  lng: Number.parseFloat(value.lng.toFixed(6))
});

type MapInteractionHandlerProps = {
  coordinates: GoogleMapEmbedCoordinates | null;
  onSelect: (coordinates: GoogleMapEmbedCoordinates) => void;
};

const MapInteractionHandler = ({ coordinates, onSelect }: MapInteractionHandlerProps) => {
  const map = useMapEvents({
    click: (event: LeafletMouseEvent) => {
      const next = normalizeCoordinates(event.latlng);
      onSelect(next);
      map.flyTo(next, SELECTION_ZOOM);
    }
  });

  useEffect(() => {
    if (coordinates) {
      map.flyTo(coordinates, SELECTION_ZOOM);
    }
  }, [coordinates, map]);

  return null;
};

export const GoogleMapEmbed = ({
  coordinates,
  title,
  ariaLabel,
  emptyLabel,
  className,
  mapType = "roadmap",
  onCoordinatesChange
}: GoogleMapEmbedProps) => {
  const [isClient, setIsClient] = useState(false);
  const [marker, setMarker] = useState<GoogleMapEmbedCoordinates | null>(coordinates);

  const tileLayerVariant = useMemo(() => getTileLayerVariant(mapType), [mapType]);
  const tileLayerUrl = useMemo(() => GOOGLE_TILE_URL(tileLayerVariant), [tileLayerVariant]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    setMarker(coordinates);
  }, [coordinates]);

  const handleSelect = useCallback(
    (next: GoogleMapEmbedCoordinates) => {
      setMarker(next);
      onCoordinatesChange?.(next);
    },
    [onCoordinatesChange]
  );

  const baseClassName = useMemo(
    () =>
      combineClassNames(
        "google-map-embed",
        className,
        marker ? "google-map-embed--ready" : "google-map-embed--empty"
      ),
    [className, marker]
  );

  const label = ariaLabel ?? title;

  return (
    <div className={baseClassName} data-state={marker ? "ready" : "empty"} role="group" aria-label={label}>
      {isClient ? (
        <>
          <MapContainer
            center={marker ?? DEFAULT_CENTER}
            zoom={marker ? SELECTION_ZOOM : DEFAULT_ZOOM}
            scrollWheelZoom
            className="google-map-embed__map"
            aria-hidden="true"
          >
            <TileLayer
              key={tileLayerVariant}
              url={tileLayerUrl}
              subdomains={GOOGLE_TILE_SUBDOMAINS}
              maxZoom={19}
              attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
            />
            <MapInteractionHandler coordinates={marker} onSelect={handleSelect} />
            {marker && <Marker position={marker} icon={markerIcon} />}
          </MapContainer>
          {!marker && <p className="google-map-embed__message">{emptyLabel}</p>}
        </>
      ) : (
        <p className="google-map-embed__message">{emptyLabel}</p>
      )}
    </div>
  );
};
