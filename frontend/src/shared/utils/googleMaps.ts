export type GoogleMapsCoordinates = {
  lat: number;
  lng: number;
};

export type GoogleMapType = "roadmap" | "satellite";

type CreateEmbedUrlOptions = {
  zoom?: number;
  mapType?: GoogleMapType;
  locationMode?: "near" | "addr";
};

const MAP_TYPE_TO_EMBED_PARAM: Record<GoogleMapType, "m" | "k"> = {
  roadmap: "m",
  satellite: "k",
};

const MAP_TYPE_TO_TILE_PARAM: Record<GoogleMapType, "m" | "s"> = {
  roadmap: "m",
  satellite: "s",
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
    t: MAP_TYPE_TO_EMBED_PARAM[options.mapType ?? "roadmap"],
    output: "embed",
    iwloc: options.locationMode ?? "near"
  });

  return `https://maps.google.com/maps?${params.toString()}`;
};

export const createGoogleMapsViewUrl = (
  coordinates: GoogleMapsCoordinates,
  options: { mapType?: GoogleMapType } = {}
) => {
  const lat = formatCoordinate(coordinates.lat);
  const lng = formatCoordinate(coordinates.lng);
  const mapTypeParam = options.mapType ? MAP_TYPE_TO_EMBED_PARAM[options.mapType] : null;
  const typeSuffix = mapTypeParam && options.mapType !== "roadmap" ? `&t=${mapTypeParam}` : "";
  return `https://www.google.com/maps?q=${lat},${lng}${typeSuffix}`;
};

export const getTileLayerVariant = (mapType: GoogleMapType = "roadmap") =>
  MAP_TYPE_TO_TILE_PARAM[mapType];
