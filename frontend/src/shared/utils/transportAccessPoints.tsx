import type { ReactNode } from "react";

import type { TransportAccessPoint, TransportAccessPointType } from "../types";
import { CarIcon, CoachIcon, OffroadCarIcon } from "../ui/icons";

export type TransportAccessPointVisual = {
  icon: ReactNode;
  markerSymbol: string;
  color: string;
};

export const TRANSPORT_ACCESS_POINT_VISUALS: Record<TransportAccessPointType, TransportAccessPointVisual> = {
  bus: {
    icon: <CoachIcon aria-hidden="true" />,
    markerSymbol: "🚌",
    color: "#2563eb",
  },
  car: {
    icon: <CarIcon aria-hidden="true" />,
    markerSymbol: "🚗",
    color: "#16a34a",
  },
  "4x4": {
    icon: <OffroadCarIcon aria-hidden="true" />,
    markerSymbol: "🚙",
    color: "#d97706",
  },
};

export const getTransportAccessPointVisual = (
  type: TransportAccessPointType
): TransportAccessPointVisual => TRANSPORT_ACCESS_POINT_VISUALS[type] ?? TRANSPORT_ACCESS_POINT_VISUALS.car;

export const getTransportAccessPointCoordinates = (point: TransportAccessPoint) => {
  if (!point.coordinates) {
    return null;
  }
  return { lat: point.coordinates.lat, lng: point.coordinates.lon } as const;
};
