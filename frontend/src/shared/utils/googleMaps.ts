export type GoogleMapsCoordinates = {
  lat: number;
  lng: number;
};

type CreateEmbedUrlOptions = {
  zoom?: number;
  mapType?: "m" | "k" | "h" | "p" | "e";
  locationMode?: "near" | "addr";
};

const formatCoordinate = (value: number) => value.toFixed(6);

export const createGoogleMapsEmbedUrl = (
  coordinates: GoogleMapsCoordinates,
  options: CreateEmbedUrlOptions = {}
) => {
  const lat = formatCoordinate(coordinates.lat);
  const lng = formatCoordinate(coordinates.lng);

  const params = new URLSearchParams({
    q: `${lat},${lng}`,
    z: String(options.zoom ?? 15),
    t: options.mapType ?? "m",
    output: "embed",
    iwloc: options.locationMode ?? "near"
  });

  return `https://maps.google.com/maps?${params.toString()}`;
};

export const createGoogleMapsViewUrl = (coordinates: GoogleMapsCoordinates) => {
  const lat = formatCoordinate(coordinates.lat);
  const lng = formatCoordinate(coordinates.lng);
  return `https://www.google.com/maps?q=${lat},${lng}`;
};
