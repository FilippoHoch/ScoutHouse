import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { ApiError, getStructureBySlug } from "../shared/api";
import type { Availability, CostOption, CostBand, Structure } from "../shared/types";

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value);

const formatCostBand = (band: CostBand | null | undefined) =>
  band ? band.charAt(0).toUpperCase() + band.slice(1) : null;

export const StructureDetailsPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [activeTab, setActiveTab] = useState<"overview" | "availability" | "costs">("overview");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["structure", slug],
    queryFn: () => {
      if (!slug) {
        throw new Error("Missing slug");
      }
      return getStructureBySlug(slug, { include: "details" });
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

  const availabilities = structure.availabilities ?? [];
  const costOptions = structure.cost_options ?? [];

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
        {structure.estimated_cost !== undefined && structure.estimated_cost !== null && (
          <p>
            Estimated daily cost: €{structure.estimated_cost.toFixed(2)}
            {structure.cost_band && ` · ${formatCostBand(structure.cost_band)}`}
          </p>
        )}

        <div
          className="map-placeholder"
          style={{ marginTop: "1rem", padding: "1rem", backgroundColor: "#f3f4f6" }}
        >
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

        <div className="detail-tabs">
          <button
            type="button"
            className={activeTab === "overview" ? "active" : ""}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            className={activeTab === "availability" ? "active" : ""}
            onClick={() => setActiveTab("availability")}
          >
            Availability
          </button>
          <button
            type="button"
            className={activeTab === "costs" ? "active" : ""}
            onClick={() => setActiveTab("costs")}
          >
            Costs
          </button>
        </div>

        {activeTab === "overview" && (
          <div className="detail-panel">
            <p>The overview tab summarises the structure metadata and coordinates.</p>
          </div>
        )}

        {activeTab === "availability" && (
          <div className="detail-panel">
            {availabilities.length === 0 ? (
              <p>No seasonal availability has been configured yet.</p>
            ) : (
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>Units</th>
                    <th>Capacity</th>
                  </tr>
                </thead>
                <tbody>
                  {availabilities.map((availability: Availability) => {
                    const { capacity_min, capacity_max } = availability;
                    const capacityLabel =
                      capacity_min !== null && capacity_max !== null
                        ? `${capacity_min} – ${capacity_max}`
                        : capacity_min !== null
                        ? `from ${capacity_min}`
                        : capacity_max !== null
                        ? `up to ${capacity_max}`
                        : "n/a";

                    return (
                      <tr key={availability.id}>
                        <td>{availability.season}</td>
                        <td>{availability.units.join(", ")}</td>
                        <td>{capacityLabel}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "costs" && (
          <div className="detail-panel">
            {costOptions.length === 0 ? (
              <p>No cost options are available for this structure.</p>
            ) : (
              <ul className="cost-options">
                {costOptions.map((option: CostOption) => (
                  <li key={option.id}>
                    <strong>{option.model}</strong> — {formatCurrency(option.amount, option.currency)}
                    <div className="cost-breakdown">
                      {option.deposit !== null && <span>Deposit: {formatCurrency(option.deposit, option.currency)}</span>}
                      {option.city_tax_per_night !== null && (
                        <span>City tax: {formatCurrency(option.city_tax_per_night, option.currency)} per night</span>
                      )}
                      {option.utilities_flat !== null && (
                        <span>Utilities: {formatCurrency(option.utilities_flat, option.currency)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p style={{ marginTop: "1rem" }}>
          <Link to="/structures">← Back to catalog</Link>
        </p>
      </div>
    </section>
  );
};
