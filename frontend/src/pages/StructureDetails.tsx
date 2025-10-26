import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { ApiError, getStructureBySlug } from "../shared/api";
import { Structure } from "../shared/types";

export const StructureDetailsPage = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["structure", slug],
    queryFn: () => {
      if (!slug) {
        throw new Error("Missing slug");
      }
      return getStructureBySlug(slug);
    },
    enabled: Boolean(slug),
    retry: false
  });

  if (!slug) {
    return (
      <section>
        <div className="card">
          <h2>Structure not found</h2>
          <p>The requested structure does not exist.</p>
          <Link to="/structures">Back to catalog</Link>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section>
        <div className="card">
          <h2>Loading structure…</h2>
        </div>
      </section>
    );
  }

  if (isError) {
    if (error instanceof ApiError && error.status === 404) {
      return (
        <section>
          <div className="card">
            <h2>Structure not found</h2>
            <p>The structure “{slug}” could not be located. It may have been removed.</p>
            <Link to="/structures">Back to catalog</Link>
          </div>
        </section>
      );
    }

    return (
      <section>
        <div className="card">
          <h2>Unable to load structure</h2>
          <p>Please try again later.</p>
          <Link to="/structures">Back to catalog</Link>
        </div>
      </section>
    );
  }

  const structure = data as Structure;
  const createdAt = new Date(structure.created_at).toLocaleDateString();
  const hasCoordinates = structure.latitude !== null && structure.longitude !== null;
  const googleMapsUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${structure.latitude},${structure.longitude}`
    : null;

  return (
    <section>
      <div className="card">
        <h2>{structure.name}</h2>
        <p>
          <strong>{structure.type}</strong> · {structure.province ?? "N/A"}
        </p>
        {structure.address && <p>{structure.address}</p>}
        <p>Slug: {structure.slug}</p>
        <p>Created: {createdAt}</p>

        <div className="map-placeholder" style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f3f4f6" }}>
          {hasCoordinates ? (
            <>
              <p>
                Coordinates: {structure.latitude?.toFixed(4)}, {structure.longitude?.toFixed(4)}
              </p>
              <p>This is a placeholder map. Integrate a map provider in future milestones.</p>
            </>
          ) : (
            <p>Coordinates are not available for this structure.</p>
          )}
        </div>

        {googleMapsUrl && (
          <p style={{ marginTop: "1rem" }}>
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
              Open in Google Maps
            </a>
          </p>
        )}

        <p style={{ marginTop: "1rem" }}>
          <Link to="/structures">← Back to catalog</Link>
        </p>
      </div>
    </section>
  );
};
