export type GeocodeResult = {
  lat: number;
  lon: number;
};

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

export async function geocodeAddress(
  query: string,
  signal?: AbortSignal
): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }

  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "0");
  url.searchParams.set("countrycodes", "it");
  url.searchParams.set("q", trimmed);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      signal
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const { lat, lon } = data[0];
    const latitude = Number.parseFloat(lat);
    const longitude = Number.parseFloat(lon);

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return null;
    }

    return { lat: latitude, lon: longitude };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return null;
  }
}
