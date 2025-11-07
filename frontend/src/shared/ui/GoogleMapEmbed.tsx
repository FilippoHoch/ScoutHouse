import { useCallback, useEffect, useMemo, useState } from "react";
import type { LeafletMouseEvent } from "leaflet";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

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
  onCoordinatesChange?: (coordinates: GoogleMapEmbedCoordinates) => void;
};

const GOOGLE_TILE_URL = "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
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
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M12 22C12 22 5 14.9706 5 10C5 6.13401 8.13401 3 12 3C15.866 3 19 6.13401 19 10C19 14.9706 12 22 12 22Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  </span>
`;

const MARKER_ICON_SIZE: [number, number] = [48, 62];

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
  onCoordinatesChange
}: GoogleMapEmbedProps) => {
  const [isClient, setIsClient] = useState(false);
  const [marker, setMarker] = useState<GoogleMapEmbedCoordinates | null>(coordinates);

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
              url={GOOGLE_TILE_URL}
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
