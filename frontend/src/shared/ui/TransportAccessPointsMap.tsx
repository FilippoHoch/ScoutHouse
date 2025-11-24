import { useEffect, useMemo, useState } from "react";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import type { TransportAccessPoint, TransportAccessPointType } from "../types";
import {
  TRANSPORT_ACCESS_POINT_VISUALS,
  getTransportAccessPointCoordinates,
  getTransportAccessPointVisual,
} from "../utils/transportAccessPoints";

type Coordinates = { lat: number; lon: number };

type TransportAccessPointsMapProps = {
  structureName: string;
  structureLabel: string;
  structureCoordinates: Coordinates | null;
  accessPoints: TransportAccessPoint[] | null | undefined;
  typeLabels: Record<TransportAccessPointType, string>;
  emptyLabel: string;
  legendLabel: string;
};

const GOOGLE_TILE_URL = "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
const GOOGLE_TILE_SUBDOMAINS = ["mt0", "mt1", "mt2", "mt3"] as const;

const DEFAULT_CENTER = { lat: 41.8719, lng: 12.5674 };
const DEFAULT_ZOOM = 6;
const DEFAULT_FIT_ZOOM = 14;

type MarkerEntry = {
  id: string;
  position: LatLngExpression;
  title: string;
  icon: L.DivIcon;
};

const createMarkerIcon = (symbol: string, color: string) =>
  L.divIcon({
    className: "transport-access-map__marker",
    html: `<span class="transport-access-map__marker-icon" style="background:${color}">${symbol}</span>`,
    iconSize: [34, 40],
    iconAnchor: [17, 36],
  });

const FitToMarkers = ({ positions }: { positions: LatLngExpression[] }) => {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      return;
    }
    if (positions.length === 1) {
      map.setView(positions[0], DEFAULT_FIT_ZOOM);
      return;
    }
    map.fitBounds(positions, { padding: [32, 32], maxZoom: 16 });
  }, [map, positions]);

  return null;
};

export const TransportAccessPointsMap = ({
  structureName,
  structureLabel,
  structureCoordinates,
  accessPoints,
  typeLabels,
  emptyLabel,
  legendLabel,
}: TransportAccessPointsMapProps) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const markers = useMemo(() => {
    const entries: MarkerEntry[] = [];

    if (structureCoordinates) {
      entries.push({
        id: "structure",
        position: { lat: structureCoordinates.lat, lng: structureCoordinates.lon },
        title: structureName,
        icon: createMarkerIcon("★", "#0f172a"),
      });
    }

    accessPoints?.forEach((point, index) => {
      const position = getTransportAccessPointCoordinates(point);
      if (!position) {
        return;
      }
      const visual = getTransportAccessPointVisual(point.type);
      entries.push({
        id: `${point.type}-${index}`,
        position,
        title: point.note || typeLabels[point.type] || point.type,
        icon: createMarkerIcon(visual.markerSymbol, visual.color),
      });
    });

    return entries;
  }, [accessPoints, structureCoordinates, structureName, typeLabels]);

  const legendEntries = useMemo(() => {
    const variants = new Map<string, { label: string; color: string; symbol: string }>();
    if (structureCoordinates) {
      variants.set("structure", { label: structureLabel, color: "#0f172a", symbol: "★" });
    }

    accessPoints?.forEach((point) => {
      const visual = TRANSPORT_ACCESS_POINT_VISUALS[point.type];
      variants.set(point.type, {
        label: typeLabels[point.type] ?? point.type,
        color: visual.color,
        symbol: visual.markerSymbol,
      });
    });

    return Array.from(variants.entries()).map(([key, entry]) => ({ key, ...entry }));
  }, [accessPoints, structureCoordinates, structureName, typeLabels]);

  if (!isClient) {
    return (
      <div className="transport-access-map transport-access-map--empty" role="figure" aria-label={structureName}>
        <p className="transport-access-map__message">{emptyLabel}</p>
      </div>
    );
  }

  if (markers.length === 0) {
    return (
      <div className="transport-access-map transport-access-map--empty" role="figure" aria-label={structureName}>
        <p className="transport-access-map__message">{emptyLabel}</p>
      </div>
    );
  }

  const positions = markers.map((marker) => marker.position);

  return (
    <div className="transport-access-map" role="figure" aria-label={structureName}>
      <MapContainer
        center={structureCoordinates ? { lat: structureCoordinates.lat, lng: structureCoordinates.lon } : DEFAULT_CENTER}
        zoom={structureCoordinates ? DEFAULT_FIT_ZOOM : DEFAULT_ZOOM}
        scrollWheelZoom
        className="transport-access-map__map"
        aria-hidden="true"
      >
        <TileLayer
          url={GOOGLE_TILE_URL}
          subdomains={GOOGLE_TILE_SUBDOMAINS}
          maxZoom={19}
          attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
        />
        <FitToMarkers positions={positions} />
        {markers.map((marker) => (
          <Marker key={marker.id} position={marker.position} icon={marker.icon}>
            <Tooltip direction="top">{marker.title}</Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {legendEntries.length > 0 && (
        <div className="transport-access-map__legend" aria-label={legendLabel}>
          {legendEntries.map((entry) => (
            <div className="transport-access-map__legend-item" key={entry.key}>
              <span
                className="transport-access-map__legend-icon"
                style={{ background: entry.color }}
                aria-hidden="true"
              >
                {entry.symbol}
              </span>
              <span className="transport-access-map__legend-label">{entry.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
