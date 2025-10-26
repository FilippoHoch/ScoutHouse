import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { ApiError, getStructures } from "../shared/api";
import {
  CostBand,
  Season,
  StructureSearchItem,
  StructureSearchParams,
  StructureSearchResponse,
  StructureType,
  Unit
} from "../shared/types";

const structureTypes: StructureType[] = ["house", "land", "mixed"];
const seasons: Season[] = ["winter", "spring", "summer", "autumn"];
const units: Unit[] = ["LC", "EG", "RS", "ALL"];
const costBands: CostBand[] = ["cheap", "medium", "expensive"];
const sortOptions: Array<{ value: StructureSearchParams["sort"]; label: string }> = [
  { value: "distance", label: "Distance" },
  { value: "name", label: "Name" },
  { value: "created_at", label: "Created" }
];
const orderOptions: Array<{ value: StructureSearchParams["order"]; label: string }> = [
  { value: "asc", label: "Ascending" },
  { value: "desc", label: "Descending" }
];
const pageSizeOptions = [6, 12, 20];

const envBaseCoords = (() => {
  const raw = import.meta.env.VITE_BASE_COORDS;
  if (typeof raw !== "string") {
    return null;
  }
  const [lat, lon] = raw.split(",").map((value) => Number.parseFloat(value.trim()));
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lon };
  }
  return null;
})();

interface FilterFormState {
  q: string;
  province: string;
  type: string;
  max_km: string;
  season: string;
  unit: string;
  cost_band: string;
  sort: StructureSearchParams["sort"];
  order: StructureSearchParams["order"];
}

const initialFormState: FilterFormState = {
  q: "",
  province: "",
  type: "",
  max_km: "",
  season: "",
  unit: "",
  cost_band: "",
  sort: "distance",
  order: "asc"
};

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const StructuresPage = () => {
  const [form, setForm] = useState<FilterFormState>(initialFormState);
  const [filters, setFilters] = useState<StructureSearchParams>({
    sort: initialFormState.sort,
    order: initialFormState.order
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeOptions[0]);

  const queryKey = ["structures", filters, page, pageSize];

  const fetchStructures = async (): Promise<StructureSearchResponse> =>
    getStructures({ ...filters, page, page_size: pageSize });

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey,
    queryFn: fetchStructures,
    keepPreviousData: true
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFilters: StructureSearchParams = {
      sort: form.sort,
      order: form.order
    };

    if (form.q.trim()) {
      nextFilters.q = form.q.trim();
    }

    if (form.province) {
      nextFilters.province = form.province;
    }

    if (form.type) {
      nextFilters.type = form.type as StructureType;
    }

    if (form.season) {
      nextFilters.season = form.season as Season;
    }

    if (form.unit) {
      nextFilters.unit = form.unit as Unit;
    }

    if (form.cost_band) {
      nextFilters.cost_band = form.cost_band as CostBand;
    }

    if (form.max_km) {
      const numeric = Number.parseFloat(form.max_km);
      if (!Number.isNaN(numeric)) {
        nextFilters.max_km = numeric;
      }
    }

    setFilters(nextFilters);
    setPage(1);
  };

  const handleReset = () => {
    setForm(initialFormState);
    setFilters({ sort: initialFormState.sort, order: initialFormState.order });
    setPage(1);
  };

  const provinces = useMemo(() => {
    const fromResponse = new Set<string>();
    data?.items.forEach((item) => {
      if (item.province) {
        fromResponse.add(item.province);
      }
    });
    if (form.province) {
      fromResponse.add(form.province);
    }
    return Array.from(fromResponse).sort();
  }, [data?.items, form.province]);

  const baseCoords = data?.base_coords ?? envBaseCoords ?? { lat: 45.5966, lon: 10.1655 };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const canGoPrev = page > 1;
  const canGoNext = data ? page < totalPages : false;

  if (isLoading && !data) {
    return (
      <section>
        <div className="card">
          <h2>Structures</h2>
          <p>Loading structures…</p>
        </div>
      </section>
    );
  }

  if (isError) {
    const message = error instanceof ApiError ? error.message : "Unable to load structures.";
    return (
      <section>
        <div className="card">
          <h2>Structures</h2>
          <p>{message}</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="card">
        <h2>Structures</h2>
        <form className="filters" onSubmit={handleSubmit}>
          <div className="filters-row">
            <label>
              Search
              <input
                type="search"
                value={form.q}
                onChange={(event) => setForm((prev) => ({ ...prev, q: event.target.value }))}
                placeholder="Name or address"
              />
            </label>
            <label>
              Province
              <select
                value={form.province}
                onChange={(event) => setForm((prev) => ({ ...prev, province: event.target.value }))}
              >
                <option value="">All</option>
                {provinces.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              >
                <option value="">All</option>
                {structureTypes.map((structureType) => (
                  <option key={structureType} value={structureType}>
                    {structureType}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Season
              <select
                value={form.season}
                onChange={(event) => setForm((prev) => ({ ...prev, season: event.target.value }))}
              >
                <option value="">All</option>
                {seasons.map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unit
              <select
                value={form.unit}
                onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}
              >
                <option value="">All</option>
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filters-row">
            <label>
              Max distance (km)
              <input
                type="number"
                min="0"
                step="1"
                value={form.max_km}
                onChange={(event) => setForm((prev) => ({ ...prev, max_km: event.target.value }))}
                placeholder="e.g. 25"
              />
            </label>
            <label>
              Cost band
              <select
                value={form.cost_band}
                onChange={(event) => setForm((prev) => ({ ...prev, cost_band: event.target.value }))}
              >
                <option value="">All</option>
                {costBands.map((band) => (
                  <option key={band} value={band}>
                    {band}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort by
              <select
                value={form.sort}
                onChange={(event) => setForm((prev) => ({ ...prev, sort: event.target.value as FilterFormState["sort"] }))}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value ?? ""}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Order
              <select
                value={form.order}
                onChange={(event) => setForm((prev) => ({ ...prev, order: event.target.value as FilterFormState["order"] }))}
              >
                {orderOptions.map((option) => (
                  <option key={option.value} value={option.value ?? ""}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Page size
              <select
                value={pageSize}
                onChange={(event) => {
                  const nextSize = Number.parseInt(event.target.value, 10);
                  setPageSize(nextSize);
                  setPage(1);
                }}
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="filters-actions">
              <button type="submit">Apply</button>
              <button type="button" onClick={handleReset} className="secondary">
                Reset
              </button>
            </div>
          </div>
        </form>

        <p className="meta">
          Showing page {page} of {totalPages} — Base coordinates: {baseCoords.lat.toFixed(4)}, {baseCoords.lon.toFixed(4)}
          {isFetching && <span> (updating…)</span>}
        </p>

        {data && data.items.length === 0 ? (
          <p>No structures match your filters. Try broadening your search.</p>
        ) : (
          <ul className="structure-results">
            {data?.items.map((item: StructureSearchItem) => (
              <li key={item.id} className="card structure-card">
                <h3>
                  <Link to={`/structures/${item.slug}`}>{item.name}</Link>
                </h3>
                <p>
                  <strong>{item.type}</strong> · {item.province ?? "N/A"}
                </p>
                {item.address && <p>{item.address}</p>}
                {(item.seasons.length > 0 || item.units.length > 0) && (
                  <div className="structure-badges">
                    {item.seasons.length > 0 && (
                      <div className="badge-group" aria-label="Seasons">
                        {item.seasons.map((season) => (
                          <span key={`${item.id}-season-${season}`} className="badge badge-season">
                            {season}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.units.length > 0 && (
                      <div className="badge-group" aria-label="Units">
                        {item.units.map((unit) => (
                          <span key={`${item.id}-unit-${unit}`} className="badge badge-unit">
                            {unit}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {item.distance_km !== null && <p>Distance: {item.distance_km.toFixed(1)} km</p>}
                {item.estimated_cost !== null && (
                  <p>
                    Estimated cost: €{item.estimated_cost.toFixed(2)}
                    {item.cost_band && ` · ${capitalize(item.cost_band)}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="pagination">
          <button type="button" onClick={() => setPage((prev) => prev - 1)} disabled={!canGoPrev}>
            Previous
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button type="button" onClick={() => setPage((prev) => prev + 1)} disabled={!canGoNext}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
};
